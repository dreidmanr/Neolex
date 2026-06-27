import { z } from "zod";
import { nanoid } from "nanoid";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { notifyOwner } from "./_core/notification";
import {
  createSession,
  getSessionByToken,
  updateSessionStatus,
  completeSession,
  saveContact,
  getContactBySession,
  saveConsent,
  upsertAnswer,
  getAnswersBySession,
  saveScoringResult,
  getScoringResultBySession,
  saveFeedback,
} from "./db";
import { calculateScore, CONSENT_VERSIONS } from "../shared/diagnosticData";
import { invokeLLM } from "./_core/llm";
import { paidRouter } from "./paidRouter";
import { adminRouter } from "./adminRouter";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  paid: paidRouter,
  admin: adminRouter,

  feedback: router({
    submit: publicProcedure
      .input(z.object({
        sessionToken: z.string().optional(),
        rating: z.number().int().min(1).max(5),
        usefulnessRating: z.number().int().min(1).max(5).optional(),
        wouldRecommend: z.boolean().optional(),
        comment: z.string().max(2000).optional(),
        foundAccurate: z.boolean().optional(),
        interestedInPaid: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        await saveFeedback({
          sessionToken: input.sessionToken ?? null,
          rating: input.rating,
          usefulnessRating: input.usefulnessRating ?? null,
          wouldRecommend: input.wouldRecommend ?? null,
          comment: input.comment ?? null,
          foundAccurate: input.foundAccurate ?? null,
          interestedInPaid: input.interestedInPaid ?? null,
        });
        return { success: true };
      }),
  }),

  diagnostic: router({
    // Create a new diagnostic session
    createSession: publicProcedure.mutation(async () => {
      const token = nanoid(32);
      const session = await createSession({ sessionToken: token, status: "started" });
      return { sessionToken: token, sessionId: session?.id };
    }),

    // Get session by token
    getSession: publicProcedure
      .input(z.object({ sessionToken: z.string() }))
      .query(async ({ input }) => {
        return getSessionByToken(input.sessionToken);
      }),

    // Save consents
    saveConsents: publicProcedure
      .input(z.object({
        sessionToken: z.string(),
        userAgreementAccepted: z.boolean(),
        marketingAccepted: z.boolean(),
      }))
      .mutation(async ({ input }) => {
        if (!input.userAgreementAccepted) {
          throw new Error("User agreement acceptance is required");
        }
        const session = await getSessionByToken(input.sessionToken);
        if (!session) throw new Error("Session not found");

        const now = new Date();
        await saveConsent({
          sessionId: session.id,
          consentType: "user_agreement",
          accepted: input.userAgreementAccepted,
          documentVersion: CONSENT_VERSIONS.userAgreement,
          acceptedAt: now,
        });
        await saveConsent({
          sessionId: session.id,
          consentType: "marketing",
          accepted: input.marketingAccepted,
          documentVersion: CONSENT_VERSIONS.marketing,
          acceptedAt: now,
        });
        await updateSessionStatus(session.id, "consented");
        return { success: true };
      }),

    // Save contact info
    saveContact: publicProcedure
      .input(z.object({
        sessionToken: z.string(),
        name: z.string().optional(), // "How to address you" field
        email: z.string().email(),
        productName: z.string().optional(),
        website: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const session = await getSessionByToken(input.sessionToken);
        if (!session) throw new Error("Session not found");

        await saveContact({
          sessionId: session.id,
          name: input.name,
          email: input.email,
          productName: input.productName,
          website: input.website,
        });
        await updateSessionStatus(session.id, "contact_collected");
        return { success: true };
      }),

    // Save a single answer (auto-save) — supports multi-select via answerIds array
    saveAnswer: publicProcedure
      .input(z.object({
        sessionToken: z.string(),
        questionId: z.string(),
        answerId: z.string(), // primary/first answer id
        answerIds: z.array(z.string()).optional(), // all selected ids for multi-select
        answerText: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const session = await getSessionByToken(input.sessionToken);
        if (!session) throw new Error("Session not found");

        await upsertAnswer({
          sessionId: session.id,
          questionId: input.questionId,
          answerId: input.answerId,
          answerIds: input.answerIds ?? [input.answerId],
          answerText: input.answerText,
        });
        if (session.status === "contact_collected") {
          await updateSessionStatus(session.id, "in_progress");
        }
        return { success: true };
      }),

    // Get all answers for a session
    getAnswers: publicProcedure
      .input(z.object({ sessionToken: z.string() }))
      .query(async ({ input }) => {
        const session = await getSessionByToken(input.sessionToken);
        if (!session) return [];
        return getAnswersBySession(session.id);
      }),

    // Complete diagnostic and calculate score
    complete: publicProcedure
      .input(z.object({
        sessionToken: z.string(),
        answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
      }))
      .mutation(async ({ input }) => {
        const session = await getSessionByToken(input.sessionToken);
        if (!session) throw new Error("Session not found");

        const scoring = calculateScore(input.answers);

        await saveScoringResult({
          sessionId: session.id,
          riskCategory: scoring.riskCategory,
          totalScore: scoring.totalScore,
          hasCriticalEvent: scoring.hasCriticalEvent,
          criticalEvents: scoring.criticalEvents,
          significantRisks: scoring.significantRisks,
          riskBlocks: scoring.activeRiskBlocks,
          mainConclusion: scoring.mainConclusion,
        });

        await completeSession(session.id, scoring.riskCategory, scoring.totalScore, scoring.hasCriticalEvent);

        // Notify owner
        const contact = await getContactBySession(session.id);
        const categoryLabel = { low: "Низкий", moderate: "Умеренный", high: "Высокий", critical: "Критический" }[scoring.riskCategory];
        await notifyOwner({
          title: `Новая диагностика завершена — ${categoryLabel} риск`,
          content: `Как обращаться: ${contact?.name || "—"}\nEmail: ${contact?.email || "—"}\nПродукт: ${contact?.productName || "—"}\nСайт: ${contact?.website || "—"}\nКатегория риска: ${categoryLabel}\nБалл: ${scoring.totalScore}`,
        });

        return { success: true, scoring };
      }),

    // Lexy widget: answer a user question about the service
    askLexy: publicProcedure
      .input(z.object({ question: z.string().max(500) }))
      .mutation(async ({ input }) => {
        const systemPrompt = `Ты Lexy — дружелюбный AI-помощник юридического сервиса Neolex. 
Neolex помогает IT-предпринимателям выявить правовые риски в их продуктах.

Отвечай коротко (2-4 предложения), по-русски, без юридического жаргона.
Если вопрос не связан с сервисом, мягко перенаправь на тему диагностики.

О сервисе:
- Бесплатная экспресс-диагностика: 8 вопросов, 5-7 минут, результат сразу
- Углублённая диагностика: 14 блоков, 50+ вопросов, AI-отчёт, 4 900 ₽
- Результат: категория риска (низкий/умеренный/высокий/критический), конкретные риски, правовые основания
- Дорожная карта устранения рисков на 30/60/90 дней (в платной версии)`;
        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: input.question },
            ],
          });
          const content = response.choices?.[0]?.message?.content;
          const answer = typeof content === "string" ? content : "Извините, не смог сформулировать ответ. Попробуйте переформулировать вопрос.";
          return { answer };
        } catch {
          return { answer: "Сейчас я недоступен. Пожалуйста, попробуйте позже или начните диагностику — результат придёт сразу после завершения." };
        }
      }),

    // Get results by session token
    getResults: publicProcedure
      .input(z.object({ sessionToken: z.string() }))
      .query(async ({ input }) => {
        const session = await getSessionByToken(input.sessionToken);
        if (!session) return null;
        const result = await getScoringResultBySession(session.id);
        if (!result) return null;
        return {
          session,
          result,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
