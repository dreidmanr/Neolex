import { and, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import {
  accessGrants,
  diagnosticCases,
  paymentRecords,
  questionnaireAnswerRevisions,
  questionnaireDrafts,
  questionnaireSubmissions,
  type DiagnosticCase,
  type InsertQuestionnaireAnswerRevision,
  type InsertQuestionnaireDraft,
  type InsertQuestionnaireSubmission,
  type QuestionnaireAnswerRevision,
  type QuestionnaireDraft,
  type QuestionnaireSubmission,
} from "../../../drizzle/schema";
import type { R1Executor } from "../database";
import type { QuestionnaireBundle } from "./configBundle";
import {
  validateCanonicalAnswer,
  type CanonicalAnswer,
  type EffectiveAnswers,
} from "./validation";

export class QuestionnairePersistenceError extends Error {
  constructor(message: string) {
    super(`Questionnaire persistence is inconsistent: ${message}`);
    this.name = "QuestionnairePersistenceError";
  }
}

export type AuthorizedQuestionnaireCase = DiagnosticCase;

/**
 * Questionnaire transactions use one global lock order: the owned case row is
 * locked first, then its owner/case grant and joined payment rows. Keeping the
 * case lookup separate prevents optimizer-dependent join order from becoming
 * the transaction lock order.
 */
export async function findOwnedQuestionnaireCaseForUpdate(
  executor: R1Executor,
  customerAccountId: string,
  publicId: string,
): Promise<AuthorizedQuestionnaireCase | null> {
  const rows = await executor
    .select()
    .from(diagnosticCases)
    .where(
      and(
        eq(diagnosticCases.publicId, publicId),
        eq(diagnosticCases.customerAccountId, customerAccountId),
      ),
    )
    .for("update")
    .limit(1);
  return rows[0] ?? null;
}

export async function hasLockedActiveQuestionnaireAccess(
  executor: R1Executor,
  customerAccountId: string,
  diagnosticCaseId: string,
): Promise<boolean> {
  const rows = await executor
    .select({ grantId: accessGrants.id })
    .from(accessGrants)
    .innerJoin(
      paymentRecords,
      and(
        eq(paymentRecords.id, accessGrants.paymentRecordId),
        eq(paymentRecords.customerAccountId, accessGrants.customerAccountId),
        eq(paymentRecords.diagnosticCaseId, accessGrants.diagnosticCaseId),
      ),
    )
    .where(
      and(
        eq(accessGrants.customerAccountId, customerAccountId),
        eq(accessGrants.diagnosticCaseId, diagnosticCaseId),
        eq(accessGrants.status, "active"),
        isNull(accessGrants.revokedAt),
        or(isNull(accessGrants.expiresAt), gt(accessGrants.expiresAt, sql`CURRENT_TIMESTAMP`)),
        eq(paymentRecords.status, "promo_granted"),
      ),
    )
    .for("update")
    .limit(1);
  return rows.length === 1;
}

export async function findOwnedDraftByCaseId(
  executor: R1Executor,
  customerAccountId: string,
  diagnosticCaseId: string,
  lockForUpdate = false,
): Promise<QuestionnaireDraft | null> {
  const query = executor
    .select()
    .from(questionnaireDrafts)
    .where(
      and(
        eq(questionnaireDrafts.customerAccountId, customerAccountId),
        eq(questionnaireDrafts.diagnosticCaseId, diagnosticCaseId),
      ),
    );
  const rows = lockForUpdate
    ? await query.for("update").limit(1)
    : await query.limit(1);
  return rows[0] ?? null;
}

export async function insertQuestionnaireDraft(
  executor: R1Executor,
  value: InsertQuestionnaireDraft,
): Promise<boolean> {
  const result = await executor
    .insert(questionnaireDrafts)
    .values(value)
    .onDuplicateKeyUpdate({ set: { id: sql`${questionnaireDrafts.id}` } });
  return Number(result[0].affectedRows) === 1;
}

export async function listAnswerRevisionsAtDraftRevision(
  executor: R1Executor,
  draft: QuestionnaireDraft,
): Promise<QuestionnaireAnswerRevision[]> {
  return executor
    .select()
    .from(questionnaireAnswerRevisions)
    .where(
      and(
        eq(questionnaireAnswerRevisions.questionnaireDraftId, draft.id),
        eq(questionnaireAnswerRevisions.customerAccountId, draft.customerAccountId),
        eq(questionnaireAnswerRevisions.diagnosticCaseId, draft.diagnosticCaseId),
        lte(questionnaireAnswerRevisions.draftRevision, draft.draftRevision),
      ),
    )
    .orderBy(
      desc(questionnaireAnswerRevisions.draftRevision),
      desc(questionnaireAnswerRevisions.createdAt),
      desc(questionnaireAnswerRevisions.id),
    );
}

function decodeJson(value: unknown, label: string): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new QuestionnairePersistenceError(`${label} is not valid JSON`);
  }
}

function assertKnownSelectedQuestion(bundle: QuestionnaireBundle, questionId: string): void {
  const question = bundle.questionById[questionId];
  if (
    !question ||
    !question.activeInPilot ||
    question.type === "file" ||
    (!bundle.activeCoreQuestionIds.includes(questionId) &&
      !bundle.activeBranchQuestionIds.includes(questionId))
  ) {
    throw new QuestionnairePersistenceError("an answer references an inactive question");
  }
}

/**
 * Resolves the immutable revision log at the draft's exact revision. The first
 * row encountered for each question is authoritative because rows are ordered
 * by revision descending. Suppression rows and explicit text clears produce no
 * effective answer; malformed rows fail closed rather than being normalized.
 */
export function effectiveAnswersFromRevisionRows(
  bundle: QuestionnaireBundle,
  draft: QuestionnaireDraft,
  rows: readonly QuestionnaireAnswerRevision[],
): EffectiveAnswers {
  if (!Number.isSafeInteger(draft.draftRevision) || draft.draftRevision < 0) {
    throw new QuestionnairePersistenceError("draft revision is invalid");
  }

  const seen = new Set<string>();
  const answers: Record<string, CanonicalAnswer> = {};
  for (const row of rows) {
    if (
      row.questionnaireDraftId !== draft.id ||
      row.customerAccountId !== draft.customerAccountId ||
      row.diagnosticCaseId !== draft.diagnosticCaseId ||
      !Number.isSafeInteger(row.draftRevision) ||
      row.draftRevision < 1 ||
      row.draftRevision > draft.draftRevision
    ) {
      throw new QuestionnairePersistenceError("an answer revision is outside its draft scope");
    }
    assertKnownSelectedQuestion(bundle, row.questionId);
    if (seen.has(row.questionId)) continue;
    seen.add(row.questionId);

    const decoded = decodeJson(row.valueJson, `answer ${row.questionId}`);
    if (row.answerState === "inactive") {
      if (
        decoded !== null ||
        row.source !== "system_branch_recompute" ||
        row.deactivationReasonCode !== "branch_no_longer_visible"
      ) {
        throw new QuestionnairePersistenceError("a branch suppression row is malformed");
      }
      continue;
    }
    if (row.answerState !== "active") {
      throw new QuestionnairePersistenceError("an answer state is invalid");
    }
    if (decoded === null) {
      if (
        row.source !== "customer" ||
        bundle.questionById[row.questionId]?.type !== "text" ||
        row.deactivationReasonCode !== null
      ) {
        throw new QuestionnairePersistenceError("an explicit clear row is malformed");
      }
      continue;
    }
    if (row.source !== "customer" || row.deactivationReasonCode !== null) {
      throw new QuestionnairePersistenceError("an active answer row is malformed");
    }
    try {
      answers[row.questionId] = validateCanonicalAnswer(bundle, row.questionId, decoded);
    } catch {
      throw new QuestionnairePersistenceError("a persisted answer is not canonical");
    }
  }
  return Object.freeze(answers);
}

export async function loadEffectiveAnswers(
  executor: R1Executor,
  bundle: QuestionnaireBundle,
  draft: QuestionnaireDraft,
): Promise<EffectiveAnswers> {
  const rows = await listAnswerRevisionsAtDraftRevision(executor, draft);
  return effectiveAnswersFromRevisionRows(bundle, draft, rows);
}

export async function insertAnswerRevisions(
  executor: R1Executor,
  values: readonly InsertQuestionnaireAnswerRevision[],
): Promise<void> {
  if (values.length === 0) return;
  await executor.insert(questionnaireAnswerRevisions).values([...values]);
}

export async function findExactCustomerAnswerRevision(
  executor: R1Executor,
  input: {
    customerAccountId: string;
    diagnosticCaseId: string;
    questionnaireDraftId: string;
    questionId: string;
    draftRevision: number;
    clientMutationIdHash: string;
  },
): Promise<QuestionnaireAnswerRevision | null> {
  const rows = await executor
    .select()
    .from(questionnaireAnswerRevisions)
    .where(
      and(
        eq(questionnaireAnswerRevisions.customerAccountId, input.customerAccountId),
        eq(questionnaireAnswerRevisions.diagnosticCaseId, input.diagnosticCaseId),
        eq(questionnaireAnswerRevisions.questionnaireDraftId, input.questionnaireDraftId),
        eq(questionnaireAnswerRevisions.questionId, input.questionId),
        eq(questionnaireAnswerRevisions.draftRevision, input.draftRevision),
        eq(questionnaireAnswerRevisions.clientMutationIdHash, input.clientMutationIdHash),
        eq(questionnaireAnswerRevisions.answerState, "active"),
        eq(questionnaireAnswerRevisions.source, "customer"),
        isNull(questionnaireAnswerRevisions.deactivationReasonCode),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function compareAndSwapDraftRevision(
  executor: R1Executor,
  input: {
    draftId: string;
    customerAccountId: string;
    diagnosticCaseId: string;
    expectedDraftRevision: number;
    nextDraftRevision: number;
    currentQuestionId: string | null;
    visibleQuestionIds: readonly string[];
    visibleSetHash: string;
    manualFollowUpRequired: boolean;
    manualFollowUpTriggerIds: readonly string[];
    now: Date;
  },
): Promise<boolean> {
  const result = await executor
    .update(questionnaireDrafts)
    .set({
      draftRevision: input.nextDraftRevision,
      currentQuestionId: input.currentQuestionId,
      visibleQuestionIds: [...input.visibleQuestionIds],
      visibleSetHash: input.visibleSetHash,
      manualFollowUpRequired: input.manualFollowUpRequired,
      manualFollowUpTriggerIds: [...input.manualFollowUpTriggerIds],
      updatedAt: input.now,
    })
    .where(
      and(
        eq(questionnaireDrafts.id, input.draftId),
        eq(questionnaireDrafts.customerAccountId, input.customerAccountId),
        eq(questionnaireDrafts.diagnosticCaseId, input.diagnosticCaseId),
        eq(questionnaireDrafts.status, "open"),
        eq(questionnaireDrafts.draftRevision, input.expectedDraftRevision),
      ),
    );
  return Number(result[0].affectedRows) === 1;
}

export async function compareAndSwapDraftSubmitted(
  executor: R1Executor,
  input: {
    draftId: string;
    customerAccountId: string;
    diagnosticCaseId: string;
    expectedDraftRevision: number;
    now: Date;
  },
): Promise<boolean> {
  const result = await executor
    .update(questionnaireDrafts)
    .set({ status: "submitted", updatedAt: input.now })
    .where(
      and(
        eq(questionnaireDrafts.id, input.draftId),
        eq(questionnaireDrafts.customerAccountId, input.customerAccountId),
        eq(questionnaireDrafts.diagnosticCaseId, input.diagnosticCaseId),
        eq(questionnaireDrafts.status, "open"),
        eq(questionnaireDrafts.draftRevision, input.expectedDraftRevision),
      ),
    );
  return Number(result[0].affectedRows) === 1;
}

export async function insertQuestionnaireSubmission(
  executor: R1Executor,
  value: InsertQuestionnaireSubmission,
): Promise<void> {
  await executor.insert(questionnaireSubmissions).values(value);
}

export async function findOwnedSubmissionById(
  executor: R1Executor,
  input: {
    submissionId: string;
    draftId: string;
    customerAccountId: string;
    diagnosticCaseId: string;
  },
): Promise<QuestionnaireSubmission | null> {
  const rows = await executor
    .select()
    .from(questionnaireSubmissions)
    .where(
      and(
        eq(questionnaireSubmissions.id, input.submissionId),
        eq(questionnaireSubmissions.questionnaireDraftId, input.draftId),
        eq(questionnaireSubmissions.customerAccountId, input.customerAccountId),
        eq(questionnaireSubmissions.diagnosticCaseId, input.diagnosticCaseId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export function decodeStringArray(value: unknown, label: string): readonly string[] {
  const decoded = decodeJson(value, label);
  if (!Array.isArray(decoded) || decoded.some(item => typeof item !== "string")) {
    throw new QuestionnairePersistenceError(`${label} must be a string array`);
  }
  if (new Set(decoded).size !== decoded.length) {
    throw new QuestionnairePersistenceError(`${label} contains duplicates`);
  }
  return Object.freeze([...decoded]);
}

export function isDuplicateEntry(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  return candidate.code === "ER_DUP_ENTRY" || candidate.cause?.code === "ER_DUP_ENTRY";
}
