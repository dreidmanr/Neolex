import { z } from "zod";
import { invokeLLM } from "../../_core/llm";
import { assertTechnicalPilotAllowed } from "../releaseGate";
import type { ReportViewModel } from "../reports/types";

export const R1_LLM_EDITOR_MODE = "editor_only" as const;
export const R1_LLM_EDITOR_MODEL = process.env.LEXY_R1_LLM_MODEL ?? "gpt-5-mini";

const editorialSchema = z.object({
  executiveSummary: z.string().min(1).max(3000),
  riskExplanations: z.array(z.object({
    riskId: z.string().min(1),
    explanation: z.string().min(1).max(2500),
    legalBasisIds: z.array(z.string().min(1)).max(10),
    needsHumanSourceReview: z.boolean(),
  }).strict()).max(25),
  sourceNotes: z.array(z.object({
    legalBasisId: z.string().min(1),
    note: z.string().min(1).max(1000),
  }).strict()).max(50),
  humanReviewNotice: z.string().min(1).max(1000),
}).strict();

export type R1LlmEditorialDraft = Readonly<z.infer<typeof editorialSchema> & {
  mode: typeof R1_LLM_EDITOR_MODE;
  model: string;
  sourcePolicy: "catalog_only_no_free_web_claims";
  deterministicResultUnchanged: true;
}>;

const outputSchema = {
  name: "r1_editorial_draft",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["executiveSummary", "riskExplanations", "sourceNotes", "humanReviewNotice"],
    properties: {
      executiveSummary: { type: "string" },
      riskExplanations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["riskId", "explanation", "legalBasisIds", "needsHumanSourceReview"],
          properties: {
            riskId: { type: "string" },
            explanation: { type: "string" },
            legalBasisIds: { type: "array", items: { type: "string" } },
            needsHumanSourceReview: { type: "boolean" },
          },
        },
      },
      sourceNotes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["legalBasisId", "note"],
          properties: { legalBasisId: { type: "string" }, note: { type: "string" } },
        },
      },
      humanReviewNotice: { type: "string" },
    },
  },
} as const;

function editorEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LEXY_R1_LLM_MODE === R1_LLM_EDITOR_MODE && env.LEXY_R1_LLM_PROVIDER === "builtin";
}

function modelContent(response: Awaited<ReturnType<typeof invokeLLM>>): unknown {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("LLM editor returned non-text content");
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error("LLM editor returned invalid JSON");
  }
}

function safeInput(report: ReportViewModel): Record<string, unknown> {
  return {
    reportId: report.reportId,
    reportVersion: report.reportVersion,
    title: report.title,
    summary: report.summary,
    overallSeverity: report.overallSeverity,
    risks: report.risks,
    legalBases: report.legalBases,
    roadmap: report.roadmap,
    recommendation: report.recommendation,
    escalation: report.escalation,
    limitations: report.limitations,
  };
}

function validateAgainstSnapshot(
  draft: z.infer<typeof editorialSchema>,
  report: ReportViewModel,
): void {
  const riskIds = new Set(report.risks.map(risk => risk.riskId));
  const basisIds = new Set(report.legalBases.map(basis => basis.legalBasisId));
  const seenRiskIds = new Set<string>();
  for (const item of draft.riskExplanations) {
    if (!riskIds.has(item.riskId) || seenRiskIds.has(item.riskId)) {
      throw new Error("LLM editor changed or duplicated deterministic risk identity");
    }
    seenRiskIds.add(item.riskId);
    if (item.legalBasisIds.some(id => !basisIds.has(id))) {
      throw new Error("LLM editor introduced a legal basis outside the pinned catalog");
    }
  }
  for (const item of draft.sourceNotes) {
    if (!basisIds.has(item.legalBasisId)) {
      throw new Error("LLM editor introduced an unpinned source reference");
    }
  }
}

export async function buildR1EditorialDraft(report: ReportViewModel): Promise<R1LlmEditorialDraft> {
  assertTechnicalPilotAllowed();
  if (!editorEnabled()) throw new Error("R1 LLM editor is disabled");

  const response = await invokeLLM({
    model: R1_LLM_EDITOR_MODEL,
    max_tokens: 3000,
    messages: [
      {
        role: "system",
        content: [
          "Ты — редактор предварительного технического отчёта Lexy.",
          "Режим editor_only: детерминированный результат нельзя изменять.",
          "Приоритет источников: 1) переданные правила и legal_basis_catalog_v1; 2) российское законодательство и практика только для пометки необходимости проверки; 3) свободный интернет запрещён в этом вызове.",
          "Нельзя добавлять новую статью, норму, санкцию, риск, уровень риска, рекомендацию или факт.",
          "Если в каталоге недостаточно основания, укажи needsHumanSourceReview=true и не выдумывай источник.",
          "Сформируй понятное русскоязычное объяснение. Обязательно укажи, что вывод требует проверки человеком.",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Перефразировать только переданный snapshot, сохранив все идентификаторы и юридические значения.",
          report: safeInput(report),
          allowedLegalBasisIds: report.legalBases.map(basis => basis.legalBasisId),
          outputPolicy: "catalog_only_no_free_web_claims",
        }),
      },
    ],
    response_format: { type: "json_schema", json_schema: outputSchema },
  });

  const draft = editorialSchema.parse(modelContent(response));
  validateAgainstSnapshot(draft, report);
  return Object.freeze({
    ...draft,
    mode: R1_LLM_EDITOR_MODE,
    model: response.model || R1_LLM_EDITOR_MODEL,
    sourcePolicy: "catalog_only_no_free_web_claims",
    deterministicResultUnchanged: true,
  });
}
