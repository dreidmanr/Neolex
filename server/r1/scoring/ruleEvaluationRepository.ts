import { and, eq, gt } from "drizzle-orm";
import {
  diagnosticCases,
  outboxEvents,
  questionnaireRuleEvaluations,
  questionnaireSubmissions,
  type InsertQuestionnaireRuleEvaluation,
  type OutboxEvent,
  type QuestionnaireRuleEvaluation,
  type QuestionnaireSubmission,
} from "../../../drizzle/schema";
import type { R1Executor } from "../database";
import { parseOutboxEvent } from "../events/contracts";
import type { ScoringOutboxLeaseFence } from "../outbox/outboxRepository";
import {
  canonicalSerialize,
  type CanonicalJsonValue,
} from "../questionnaire/canonicalJson";

export type ImmutableScoringSubmission = {
  submission: QuestionnaireSubmission;
  sourceOutboxEvent: OutboxEvent;
  submittedCaseStateVersion: number;
};

export type RuleEvaluationTerminalStatus =
  | "succeeded"
  | "manual_review_required"
  | "failed";

export type RuleEvaluationFailureCode =
  | "configuration_invalid"
  | "input_inconsistent"
  | "retry_exhausted"
  | "technical_failure";

export class RuleEvaluationPersistenceError extends Error {
  constructor(message: string) {
    super(`Rule evaluation persistence is inconsistent: ${message}`);
    this.name = "RuleEvaluationPersistenceError";
  }
}

function decodeJson(value: unknown, label: string): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new RuleEvaluationPersistenceError(`${label} is not valid JSON`);
  }
}

function isDuplicateEntry(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  return candidate.code === "ER_DUP_ENTRY" || candidate.cause?.code === "ER_DUP_ENTRY";
}

function sameEvaluationIdentity(
  row: QuestionnaireRuleEvaluation,
  value: InsertQuestionnaireRuleEvaluation,
): boolean {
  return row.id === value.id &&
    row.customerAccountId === value.customerAccountId &&
    row.diagnosticCaseId === value.diagnosticCaseId &&
    row.questionnaireSubmissionId === value.questionnaireSubmissionId &&
    row.sourceOutboxEventId === value.sourceOutboxEventId &&
    row.submittedCaseStateVersion === value.submittedCaseStateVersion &&
    row.rulesetId === value.rulesetId &&
    row.rulesetVersion === value.rulesetVersion &&
    row.rulesetHash === value.rulesetHash &&
    row.inputSnapshotHash === value.inputSnapshotHash &&
    row.status === "pending" &&
    row.outcomeJson === null &&
    row.outcomeHash === null &&
    row.manualReviewRequired === false &&
    row.failureCode === null;
}

/**
 * Loads the only input an internal scoring worker may consume. The immutable
 * submission remains the source of raw canonical answers; the outbox and
 * evaluation rows intentionally contain only identifiers and hashes.
 */
export async function loadImmutableSubmissionForScoring(
  executor: R1Executor,
  input: ScoringOutboxLeaseFence,
  strictImmutableFence = true,
): Promise<ImmutableScoringSubmission | null> {
  const rows = await executor
    .select({
      submission: questionnaireSubmissions,
      sourceOutboxEvent: outboxEvents,
      caseId: diagnosticCases.id,
      caseOwnerId: diagnosticCases.customerAccountId,
      caseStatus: diagnosticCases.status,
      caseStateVersion: diagnosticCases.stateVersion,
    })
    .from(outboxEvents)
    .innerJoin(
      questionnaireSubmissions,
      and(
        eq(questionnaireSubmissions.id, outboxEvents.aggregateId),
        eq(questionnaireSubmissions.id, input.submissionId),
        eq(questionnaireSubmissions.customerAccountId, input.customerAccountId),
        eq(questionnaireSubmissions.diagnosticCaseId, input.diagnosticCaseId),
      ),
    )
    .innerJoin(
      diagnosticCases,
      and(
        eq(diagnosticCases.id, questionnaireSubmissions.diagnosticCaseId),
        eq(diagnosticCases.customerAccountId, questionnaireSubmissions.customerAccountId),
      ),
    )
    .where(
      and(
        eq(outboxEvents.id, input.outboxEventId),
        eq(outboxEvents.aggregateType, "questionnaire_submission"),
        eq(outboxEvents.eventType, "questionnaire.submitted_for_scoring"),
        eq(outboxEvents.status, "processing"),
        eq(outboxEvents.leaseOwner, input.leaseOwner),
        eq(outboxEvents.leaseVersion, input.leaseVersion),
        gt(outboxEvents.leaseExpiresAt, input.now),
      ),
    )
    .limit(1)
    .for("update");
  const row = rows[0];
  if (!row) return null;

  const event = parseOutboxEvent({
    aggregateType: row.sourceOutboxEvent.aggregateType,
    aggregateId: row.sourceOutboxEvent.aggregateId,
    eventType: row.sourceOutboxEvent.eventType,
    privacySafePayload: decodeJson(
      row.sourceOutboxEvent.privacySafePayload,
      "scoring outbox payload",
    ),
    createdAt: row.sourceOutboxEvent.createdAt,
  });
  if (event.eventType !== "questionnaire.submitted_for_scoring") {
    throw new RuleEvaluationPersistenceError("leased event type changed");
  }
  const payload = event.privacySafePayload;
  if (
    row.caseId !== input.diagnosticCaseId ||
    row.caseOwnerId !== input.customerAccountId ||
    !(["submitted", "scoring"] as const).includes(
      row.caseStatus as "submitted" | "scoring",
    ) ||
    (strictImmutableFence &&
      !(
        ((row.caseStatus === "submitted" &&
          row.caseStateVersion === payload.submittedCaseStateVersion) ||
          (row.caseStatus === "scoring" &&
            row.caseStateVersion === payload.submittedCaseStateVersion + 1)) &&
        payload.caseId === input.diagnosticCaseId &&
        payload.submissionId === input.submissionId &&
        payload.submissionVersion === row.submission.submissionVersion &&
        payload.inputSnapshotHash === row.submission.inputSnapshotHash
      ))
  ) {
    throw new RuleEvaluationPersistenceError("leased submission is outside its immutable fence");
  }
  return {
    submission: row.submission,
    sourceOutboxEvent: row.sourceOutboxEvent,
    submittedCaseStateVersion: payload.submittedCaseStateVersion,
  };
}

/**
 * Starts one evaluation per source event and per (submission, ruleset hash).
 * An exact replay returns the original row; any divergent collision fails.
 */
export async function insertRuleEvaluation(
  executor: R1Executor,
  lease: ScoringOutboxLeaseFence,
  value: InsertQuestionnaireRuleEvaluation,
): Promise<QuestionnaireRuleEvaluation> {
  const source = await loadImmutableSubmissionForScoring(executor, lease, false);
  if (!source) throw new RuleEvaluationPersistenceError("active scoring lease is missing");
  if (
    value.customerAccountId !== lease.customerAccountId ||
    value.diagnosticCaseId !== lease.diagnosticCaseId ||
    value.questionnaireSubmissionId !== lease.submissionId ||
    value.sourceOutboxEventId !== lease.outboxEventId ||
    value.submittedCaseStateVersion !== source.submittedCaseStateVersion ||
    value.inputSnapshotHash !== source.submission.inputSnapshotHash ||
    (value.status !== undefined && value.status !== "pending") ||
    value.outcomeJson != null ||
    value.outcomeHash != null ||
    value.manualReviewRequired === true ||
    value.failureCode != null
  ) {
    throw new RuleEvaluationPersistenceError("new evaluation is outside its source fence");
  }

  try {
    await executor.insert(questionnaireRuleEvaluations).values(value);
  } catch (error) {
    if (!isDuplicateEntry(error)) throw error;
  }
  const rows = await executor
    .select()
    .from(questionnaireRuleEvaluations)
    .where(
      and(
        eq(questionnaireRuleEvaluations.questionnaireSubmissionId, lease.submissionId),
        eq(questionnaireRuleEvaluations.rulesetHash, value.rulesetHash),
        eq(questionnaireRuleEvaluations.customerAccountId, lease.customerAccountId),
        eq(questionnaireRuleEvaluations.diagnosticCaseId, lease.diagnosticCaseId),
      ),
    )
    .limit(1);
  const persisted = rows[0];
  if (!persisted || !sameEvaluationIdentity(persisted, value)) {
    throw new RuleEvaluationPersistenceError("evaluation uniqueness collision is divergent");
  }
  return persisted;
}

/**
 * Looks up the unique evaluation only after the caller has locked the source
 * lease target in the same transaction. The full worker verifies its immutable
 * identity before treating a terminal row as an exactly-once replay.
 */
export async function findRuleEvaluationBySourceForUpdate(
  executor: R1Executor,
  input: {
    sourceOutboxEventId: string;
    customerAccountId: string;
    diagnosticCaseId: string;
    questionnaireSubmissionId: string;
  },
): Promise<QuestionnaireRuleEvaluation | null> {
  const rows = await executor
    .select()
    .from(questionnaireRuleEvaluations)
    .where(
      and(
        eq(questionnaireRuleEvaluations.sourceOutboxEventId, input.sourceOutboxEventId),
        eq(questionnaireRuleEvaluations.customerAccountId, input.customerAccountId),
        eq(questionnaireRuleEvaluations.diagnosticCaseId, input.diagnosticCaseId),
        eq(
          questionnaireRuleEvaluations.questionnaireSubmissionId,
          input.questionnaireSubmissionId,
        ),
      ),
    )
    .limit(1)
    .for("update");
  return rows[0] ?? null;
}

async function lockPendingEvaluation(
  executor: R1Executor,
  lease: ScoringOutboxLeaseFence,
  evaluationId: string,
  strictImmutableFence: boolean,
): Promise<QuestionnaireRuleEvaluation | null> {
  const source = strictImmutableFence
    ? await loadImmutableSubmissionForScoring(executor, lease)
    : null;
  if (strictImmutableFence && !source) return null;
  const rows = await executor
    .select()
    .from(questionnaireRuleEvaluations)
    .where(
      and(
        eq(questionnaireRuleEvaluations.id, evaluationId),
        eq(questionnaireRuleEvaluations.customerAccountId, lease.customerAccountId),
        eq(questionnaireRuleEvaluations.diagnosticCaseId, lease.diagnosticCaseId),
        eq(questionnaireRuleEvaluations.questionnaireSubmissionId, lease.submissionId),
        eq(questionnaireRuleEvaluations.sourceOutboxEventId, lease.outboxEventId),
        eq(questionnaireRuleEvaluations.status, "pending"),
        source
          ? eq(
              questionnaireRuleEvaluations.submittedCaseStateVersion,
              source.submittedCaseStateVersion,
            )
          : undefined,
        source
          ? eq(
              questionnaireRuleEvaluations.inputSnapshotHash,
              source.submission.inputSnapshotHash,
            )
          : undefined,
      ),
    )
    .limit(1)
    .for("update");
  return rows[0] ?? null;
}

export async function completeRuleEvaluation(
  executor: R1Executor,
  input: ScoringOutboxLeaseFence & {
    evaluationId: string;
    status: Exclude<RuleEvaluationTerminalStatus, "failed">;
    outcomeJson: CanonicalJsonValue;
    outcomeHash: string;
  },
): Promise<boolean> {
  const evaluation = await lockPendingEvaluation(executor, input, input.evaluationId, true);
  if (!evaluation) return false;
  if (canonicalSerialize(input.outcomeJson).length === 0) {
    throw new RuleEvaluationPersistenceError("outcome is empty");
  }
  const result = await executor
    .update(questionnaireRuleEvaluations)
    .set({
      status: input.status,
      outcomeJson: input.outcomeJson,
      outcomeHash: input.outcomeHash,
      manualReviewRequired: input.status === "manual_review_required",
      failureCode: null,
      completedAt: input.now,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(questionnaireRuleEvaluations.id, evaluation.id),
        eq(questionnaireRuleEvaluations.customerAccountId, input.customerAccountId),
        eq(questionnaireRuleEvaluations.diagnosticCaseId, input.diagnosticCaseId),
        eq(questionnaireRuleEvaluations.questionnaireSubmissionId, input.submissionId),
        eq(questionnaireRuleEvaluations.sourceOutboxEventId, input.outboxEventId),
        eq(questionnaireRuleEvaluations.status, "pending"),
      ),
    );
  return Number(result[0].affectedRows) === 1;
}

export async function failRuleEvaluation(
  executor: R1Executor,
  input: ScoringOutboxLeaseFence & {
    evaluationId: string;
    failureCode: RuleEvaluationFailureCode;
  },
): Promise<boolean> {
  const evaluation = await lockPendingEvaluation(executor, input, input.evaluationId, false);
  if (!evaluation) return false;
  const result = await executor
    .update(questionnaireRuleEvaluations)
    .set({
      status: "failed",
      outcomeJson: null,
      outcomeHash: null,
      manualReviewRequired: false,
      failureCode: input.failureCode,
      completedAt: input.now,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(questionnaireRuleEvaluations.id, evaluation.id),
        eq(questionnaireRuleEvaluations.customerAccountId, input.customerAccountId),
        eq(questionnaireRuleEvaluations.diagnosticCaseId, input.diagnosticCaseId),
        eq(questionnaireRuleEvaluations.questionnaireSubmissionId, input.submissionId),
        eq(questionnaireRuleEvaluations.sourceOutboxEventId, input.outboxEventId),
        eq(questionnaireRuleEvaluations.status, "pending"),
      ),
    );
  return Number(result[0].affectedRows) === 1;
}
