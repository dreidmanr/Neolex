import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { notifyOwner } from "./_core/notification";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import {
  createPaidSession,
  getPaidSessionByToken,
  getPaidSessionById,
  updatePaidSessionStatus,
  markPaidSessionPaid,
  savePaidConsent,
  upsertPaidAnswer,
  getPaidAnswers,
  savePaidDocument,
  getPaidDocuments,
  savePaidReport,
  getPaidReport,
  getAllPaidSessions,
} from "./paidDb";
import { scorePaidDiagnostic, PAID_BLOCKS, PAID_PRICE_RUB, PAID_ANKETA_VERSION } from "../shared/paidDiagnosticData";

const PAID_CONSENT_VERSIONS = {
  userAgreement: "2.0",
  marketing: "1.0",
  dataProcessing: "1.0",
};

export const paidRouter = router({
  // ── Session management ──────────────────────────────────────────────────────

  createSession: publicProcedure
    .input(z.object({
      contactEmail: z.string().email(),
      contactName: z.string().optional(),
      productName: z.string().optional(),
      website: z.string().optional(),
      freeSessionId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const session = await createPaidSession(input);
      return { sessionToken: session.sessionToken, sessionId: session.id };
    }),

  getSession: publicProcedure
    .input(z.object({ sessionToken: z.string() }))
    .query(async ({ input }) => {
      return getPaidSessionByToken(input.sessionToken);
    }),

  // ── Consents ────────────────────────────────────────────────────────────────

  saveConsents: publicProcedure
    .input(z.object({
      sessionToken: z.string(),
      userAgreementAccepted: z.boolean(),
      marketingAccepted: z.boolean().optional(),
      dataProcessingAccepted: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!input.userAgreementAccepted) {
        throw new Error("Принятие пользовательского соглашения обязательно");
      }
      const session = await getPaidSessionByToken(input.sessionToken);
      if (!session) throw new Error("Сессия не найдена");

      const now = new Date();
      await savePaidConsent({
        paidSessionId: session.id,
        consentType: "user_agreement",
        accepted: true,
        documentVersion: PAID_CONSENT_VERSIONS.userAgreement,
      });
      await savePaidConsent({
        paidSessionId: session.id,
        consentType: "marketing",
        accepted: input.marketingAccepted ?? false,
        documentVersion: PAID_CONSENT_VERSIONS.marketing,
      });
      await savePaidConsent({
        paidSessionId: session.id,
        consentType: "data_processing",
        accepted: input.dataProcessingAccepted ?? true,
        documentVersion: PAID_CONSENT_VERSIONS.dataProcessing,
      });
      return { success: true };
    }),

  // ── Payment ─────────────────────────────────────────────────────────────────

  initiatePayment: publicProcedure
    .input(z.object({ sessionToken: z.string() }))
    .mutation(async ({ input }) => {
      const session = await getPaidSessionByToken(input.sessionToken);
      if (!session) throw new Error("Сессия не найдена");

      await updatePaidSessionStatus(session.id, "payment_pending");

      // In production, integrate with a real payment provider (e.g. YooKassa).
      // For now, return a mock payment URL and simulate the flow.
      return {
        paymentUrl: null, // Will be set when real payment integration is added
        amount: PAID_PRICE_RUB,
        currency: "RUB",
        sessionToken: input.sessionToken,
        // Simulate: mark as paid immediately for demo purposes
        simulatePaid: true,
      };
    }),

  confirmPayment: publicProcedure
    .input(z.object({
      sessionToken: z.string(),
      paymentId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const session = await getPaidSessionByToken(input.sessionToken);
      if (!session) throw new Error("Сессия не найдена");

      await markPaidSessionPaid(session.id, input.paymentId);
      await updatePaidSessionStatus(session.id, "in_progress", { startedAt: new Date() });

      return { success: true };
    }),

  // ── Answers ─────────────────────────────────────────────────────────────────

  saveAnswer: publicProcedure
    .input(z.object({
      sessionToken: z.string(),
      blockId: z.number(),
      questionId: z.string(),
      answerType: z.enum(["single", "multi", "text", "file"]),
      answerId: z.string().optional(),
      answerIds: z.array(z.string()).optional(),
      answerText: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const session = await getPaidSessionByToken(input.sessionToken);
      if (!session) throw new Error("Сессия не найдена");

      await upsertPaidAnswer({
        paidSessionId: session.id,
        blockId: input.blockId,
        questionId: input.questionId,
        answerType: input.answerType,
        answerId: input.answerId,
        answerIds: input.answerIds,
        answerText: input.answerText,
      });

      // Update progress
      await updatePaidSessionStatus(session.id, "in_progress", {
        currentBlock: input.blockId,
      });

      return { success: true };
    }),

  getAnswers: publicProcedure
    .input(z.object({ sessionToken: z.string() }))
    .query(async ({ input }) => {
      const session = await getPaidSessionByToken(input.sessionToken);
      if (!session) return [];
      return getPaidAnswers(session.id);
    }),

  // ── File upload ─────────────────────────────────────────────────────────────

  uploadDocument: publicProcedure
    .input(z.object({
      sessionToken: z.string(),
      blockId: z.number().optional(),
      questionId: z.string().optional(),
      fileName: z.string(),
      fileSize: z.number().optional(),
      mimeType: z.string().optional(),
      fileBase64: z.string(), // base64 encoded file content
      documentCategory: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const session = await getPaidSessionByToken(input.sessionToken);
      if (!session) throw new Error("Сессия не найдена");

      // Decode base64 and upload to storage
      const buffer = Buffer.from(input.fileBase64, "base64");
      const fileKey = `paid-docs/${session.id}/${Date.now()}-${input.fileName}`;
      const { key, url } = await storagePut(fileKey, buffer, input.mimeType ?? "application/octet-stream");

      await savePaidDocument({
        paidSessionId: session.id,
        blockId: input.blockId,
        questionId: input.questionId,
        fileName: input.fileName,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        storageKey: key,
        storageUrl: url,
        documentCategory: input.documentCategory,
      });

      return { success: true, storageUrl: url };
    }),

  getDocuments: publicProcedure
    .input(z.object({ sessionToken: z.string() }))
    .query(async ({ input }) => {
      const session = await getPaidSessionByToken(input.sessionToken);
      if (!session) return [];
      return getPaidDocuments(session.id);
    }),

  // ── Complete & generate report ───────────────────────────────────────────────

  complete: publicProcedure
    .input(z.object({
      sessionToken: z.string(),
      answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
    }))
    .mutation(async ({ input }) => {
      const session = await getPaidSessionByToken(input.sessionToken);
      if (!session) throw new Error("Сессия не найдена");

      // Run scoring
      const scoring = scorePaidDiagnostic(input.answers);

      // Save goals and service fields from block 14
      const goals = input.answers["b14_q1"];
      const urgencyDeadline = input.answers["b14_q2"];
      const criticalQuestion = input.answers["b14_q3"];

      await updatePaidSessionStatus(session.id, "completed", {
        riskCategory: scoring.riskCategory,
        criticalTriggers: scoring.criticalTriggers,
        userGoals: Array.isArray(goals) ? goals : goals ? [goals] : [],
        urgencyDeadline: typeof urgencyDeadline === "string" ? urgencyDeadline : undefined,
        criticalQuestion: typeof criticalQuestion === "string" ? criticalQuestion : undefined,
        completedAt: new Date(),
      });

      // Generate AI-enhanced report markdown
      let reportMarkdown = "";
      try {
        reportMarkdown = await generateReportMarkdown(input.answers, scoring, session);
      } catch (e) {
        console.error("[Paid] Report generation failed:", e);
        reportMarkdown = buildFallbackReport(scoring);
      }

      // Save report
      await savePaidReport({
        paidSessionId: session.id,
        riskCategory: scoring.riskCategory,
        keyFindings: scoring.keyFindings,
        scopeAndLimitations: scoring.scopeLimitations,
        factualInputs: input.answers,
        riskMap: {},
        riskBlocks: scoring.riskBlocks,
        missingDocuments: scoring.missingDocuments,
        financialConsequences: scoring.riskBlocks.map(b => ({
          blockTitle: b.blockTitle,
          financialRange: b.financialRange,
        })),
        roadmap: scoring.roadmap,
        nextStep: scoring.nextStep,
        reportMarkdown,
        criticalTriggers: scoring.criticalTriggers,
        totalRiskScore: scoring.totalScore,
        generationModel: "claude-sonnet-4-5",
      });

      await updatePaidSessionStatus(session.id, "report_ready", {
        reportGeneratedAt: new Date(),
      });

      // Notify owner
      const categoryLabel = { low: "Низкий", moderate: "Умеренный", high: "Высокий", critical: "Критический" }[scoring.riskCategory];
      await notifyOwner({
        title: `Платная диагностика завершена — ${categoryLabel} риск`,
        content: `Email: ${session.contactEmail}\nКак обращаться: ${session.contactName || "—"}\nПродукт: ${session.productName || "—"}\nКатегория риска: ${categoryLabel}\nБалл: ${scoring.totalScore}\nКритических триггеров: ${scoring.criticalTriggers.length}`,
      });

      return { success: true, scoring, reportMarkdown };
    }),

  // ── Get report ───────────────────────────────────────────────────────────────

  getReport: publicProcedure
    .input(z.object({ sessionToken: z.string() }))
    .query(async ({ input }) => {
      const session = await getPaidSessionByToken(input.sessionToken);
      if (!session) return null;
      const report = await getPaidReport(session.id);
      if (!report) return null;
      return { session, report };
    }),

  // ── Admin ────────────────────────────────────────────────────────────────────

  adminGetSessions: publicProcedure
    .query(async () => {
      return getAllPaidSessions(100);
    }),
});

// ─── AI Report Generation ─────────────────────────────────────────────────────

async function generateReportMarkdown(
  answers: Record<string, string | string[]>,
  scoring: ReturnType<typeof scorePaidDiagnostic>,
  session: { contactEmail: string; contactName?: string | null; productName?: string | null }
): Promise<string> {
  const productName = session.productName || answers["b1_q1"] || "ваш продукт";
  const riskLabel = { low: "Низкий", moderate: "Умеренный", high: "Высокий", critical: "Критический" }[scoring.riskCategory];

  const systemPrompt = `Ты — старший юрист-аналитик, специализирующийся на правовых рисках IT-продуктов в России. 
Твоя задача — написать профессиональный, структурированный отчёт о правовых рисках на основе результатов диагностики.
Пиши на русском языке, профессионально, без воды. Используй конкретные ссылки на российское законодательство.
Не используй общие фразы — каждый вывод должен быть конкретным и применимым к описанному продукту.`;

  const riskBlocksText = scoring.riskBlocks
    .map(b => `- ${b.title}: ${b.whatFound} (${b.financialRange})`)
    .join("\n");

  const roadmapText = [
    scoring.roadmap.immediate.length > 0 ? `Немедленно: ${scoring.roadmap.immediate.join("; ")}` : "",
    scoring.roadmap.days30.length > 0 ? `30 дней: ${scoring.roadmap.days30.join("; ")}` : "",
    scoring.roadmap.days60.length > 0 ? `60 дней: ${scoring.roadmap.days60.join("; ")}` : "",
    scoring.roadmap.days90.length > 0 ? `90 дней: ${scoring.roadmap.days90.join("; ")}` : "",
  ].filter(Boolean).join("\n");

  const userPrompt = `Напиши полный отчёт о правовых рисках для продукта "${productName}".

Данные диагностики:
- Категория риска: ${riskLabel} (балл: ${scoring.totalScore})
- Критических триггеров: ${scoring.criticalTriggers.length}
${scoring.criticalTriggers.length > 0 ? `- Критические триггеры: ${scoring.criticalTriggers.join("; ")}` : ""}

Выявленные риски:
${riskBlocksText || "Критических рисков не выявлено"}

Отсутствующие документы:
${scoring.missingDocuments.length > 0 ? scoring.missingDocuments.join(", ") : "Все ключевые документы присутствуют"}

Дорожная карта:
${roadmapText}

Следующий шаг: ${scoring.nextStep.title}

Структура отчёта (строго соблюдай):

# Отчёт о правовых рисках: ${productName}

## Резюме для руководителя
[2-3 предложения: главный вывод, категория риска, самое важное действие]

## Категория риска: ${riskLabel}
[Краткое обоснование категории]

## Ключевые выводы
[Маркированный список из 3-5 пунктов]

## Детальный анализ рисков
[Для каждого выявленного риска: заголовок, что обнаружено, почему важно, правовое основание, финансовые последствия, что делать]

## Отсутствующие документы
[Список с пояснением, зачем каждый документ нужен]

## Дорожная карта устранения рисков

### Немедленно (до 7 дней)
### 30 дней
### 60 дней  
### 90 дней
### Масштабирование

## Ограничения отчёта
[Стандартные оговорки об ограничениях анкетной диагностики]

Пиши конкретно, профессионально, без воды. Длина отчёта — 1500-2500 слов.`;

  const response = await invokeLLM({
    model: "claude-sonnet-4-5",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const content = response.choices?.[0]?.message?.content;
  return (typeof content === "string" ? content : null) ?? buildFallbackReport(scoring);
}

function buildFallbackReport(scoring: ReturnType<typeof scorePaidDiagnostic>): string {
  const riskLabel = { low: "Низкий", moderate: "Умеренный", high: "Высокий", critical: "Критический" }[scoring.riskCategory];

  return `# Отчёт о правовых рисках

## Категория риска: ${riskLabel}

**Общий балл риска:** ${scoring.totalScore}

## Ключевые выводы

${scoring.keyFindings.map(f => `- ${f}`).join("\n")}

## Критические триггеры

${scoring.criticalTriggers.length > 0
  ? scoring.criticalTriggers.map(t => `- ${t}`).join("\n")
  : "Критических триггеров не выявлено."}

## Выявленные риски

${scoring.riskBlocks.map(b => `### ${b.title}

**Что обнаружено:** ${b.whatFound}

**Почему важно:** ${b.whyItMatters}

**Правовое основание:** ${b.legalBasis}

**Финансовые последствия:** ${b.financialRange}

**Что делать:** ${b.whatToDo}
`).join("\n")}

## Отсутствующие документы

${scoring.missingDocuments.length > 0
  ? scoring.missingDocuments.map(d => `- ${d}`).join("\n")
  : "Все ключевые документы присутствуют."}

## Дорожная карта

### Немедленно
${scoring.roadmap.immediate.map(i => `- ${i}`).join("\n") || "— нет срочных действий"}

### 30 дней
${scoring.roadmap.days30.map(i => `- ${i}`).join("\n") || "— нет действий"}

### 60 дней
${scoring.roadmap.days60.map(i => `- ${i}`).join("\n") || "— нет действий"}

### 90 дней
${scoring.roadmap.days90.map(i => `- ${i}`).join("\n") || "— нет действий"}

## Ограничения отчёта

${scoring.scopeLimitations.map(l => `- ${l}`).join("\n")}
`;
}
