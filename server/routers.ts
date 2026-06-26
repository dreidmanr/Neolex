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
} from "./db";
import { calculateScore, CONSENT_VERSIONS } from "../shared/diagnosticData";

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
