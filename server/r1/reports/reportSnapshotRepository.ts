import { and, asc, desc, eq, gt, lte, or, sql } from "drizzle-orm";
import {
  accessGrants,
  caseConsents,
  diagnosticCases,
  outboxEvents,
  paymentRecords,
  questionnaireAnswerRevisions,
  questionnaireDrafts,
  questionnaireRuleEvaluations,
  questionnaireSubmissions,
  reportSnapshots,
  tariffSnapshots,
  type InsertReportSnapshot,
  type QuestionnaireRuleEvaluation,
  type ReportSnapshot,
} from "../../../drizzle/schema";
import type { R1Database, R1Executor } from "../database";
import {
  canonicalSha256,
  type CanonicalJsonValue,
} from "../questionnaire/canonicalJson";
import type { PersistedReportSourceBundle } from "./types";

export type ReportSnapshotLeaseFence = {
  reportSnapshotId: string;
  customerAccountId: string;
  diagnosticCaseId: string;
  leaseOwner: string;
  leaseVersion: number;
  now: Date;
};

export type ReportSnapshotFailureCode =
  | "evaluation_invalid"
  | "template_unavailable"
  | "payload_invalid"
  | "source_fence_invalid"
  | "answer_lineage_invalid"
  | "payment_access_invalid"
  | "legal_evidence_incomplete"
  | "source_data_missing"
  | "retry_exhausted"
  | "technical_failure";

export type LockedReportSnapshotSource = {
  evaluation: QuestionnaireRuleEvaluation;
  snapshot: ReportSnapshot | null;
};

export class ReportSnapshotPersistenceError extends Error {
  constructor(message: string) {
    super(`Report snapshot persistence is inconsistent: ${message}`);
    this.name = "ReportSnapshotPersistenceError";
  }
}

function isDuplicateEntry(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  return (
    candidate.code === "ER_DUP_ENTRY" ||
    candidate.cause?.code === "ER_DUP_ENTRY"
  );
}

function sameSourceIdentity(
  row: ReportSnapshot,
  value: InsertReportSnapshot
): boolean {
  return (
    row.id === value.id &&
    row.customerAccountId === value.customerAccountId &&
    row.diagnosticCaseId === value.diagnosticCaseId &&
    row.questionnaireSubmissionId === value.questionnaireSubmissionId &&
    row.questionnaireRuleEvaluationId === value.questionnaireRuleEvaluationId &&
    row.sourceOutboxEventId === value.sourceOutboxEventId &&
    row.reportVersion === value.reportVersion &&
    row.templateVersion === value.templateVersion &&
    row.inputSnapshotHash === value.inputSnapshotHash &&
    row.outcomeHash === value.outcomeHash &&
    row.rulesetBundleHash === value.rulesetBundleHash &&
    row.status === "pending" &&
    row.generationMode === "template" &&
    row.readySlot === null &&
    row.leaseOwner === null &&
    row.leaseVersion === 0 &&
    row.leaseExpiresAt === null &&
    row.attemptCount === 0 &&
    row.payloadJson === null &&
    row.payloadHash === null &&
    row.contentHash === null &&
    row.failureCode === null &&
    row.lastAttemptAt === null &&
    row.completedAt === null
  );
}

function assertInitialSnapshot(value: InsertReportSnapshot): void {
  if (
    (value.status !== undefined && value.status !== "pending") ||
    (value.generationMode !== undefined &&
      value.generationMode !== "template") ||
    value.readySlot != null ||
    value.leaseOwner != null ||
    (value.leaseVersion !== undefined && value.leaseVersion !== 0) ||
    value.leaseExpiresAt != null ||
    (value.attemptCount !== undefined && value.attemptCount !== 0) ||
    value.payloadJson != null ||
    value.payloadHash != null ||
    value.contentHash != null ||
    value.failureCode != null ||
    value.lastAttemptAt != null ||
    value.completedAt != null
  ) {
    throw new ReportSnapshotPersistenceError(
      "initial row is not pending and empty"
    );
  }
}

/**
 * Locks the successful immutable evaluation and any existing snapshot identity.
 * Callers use this inside the transaction that initializes a report snapshot.
 */
export async function lockReportSnapshotSourceIdentity(
  executor: R1Executor,
  input: {
    customerAccountId: string;
    diagnosticCaseId: string;
    questionnaireSubmissionId: string;
    questionnaireRuleEvaluationId: string;
    sourceOutboxEventId: string;
  }
): Promise<LockedReportSnapshotSource | null> {
  const evaluations = await executor
    .select()
    .from(questionnaireRuleEvaluations)
    .where(
      and(
        eq(
          questionnaireRuleEvaluations.id,
          input.questionnaireRuleEvaluationId
        ),
        eq(
          questionnaireRuleEvaluations.customerAccountId,
          input.customerAccountId
        ),
        eq(
          questionnaireRuleEvaluations.diagnosticCaseId,
          input.diagnosticCaseId
        ),
        eq(
          questionnaireRuleEvaluations.questionnaireSubmissionId,
          input.questionnaireSubmissionId
        ),
        eq(
          questionnaireRuleEvaluations.sourceOutboxEventId,
          input.sourceOutboxEventId
        ),
        or(
          eq(questionnaireRuleEvaluations.status, "succeeded"),
          eq(questionnaireRuleEvaluations.status, "manual_review_required")
        )
      )
    )
    .limit(1)
    .for("update");
  const evaluation = evaluations[0];
  if (!evaluation || !evaluation.outcomeJson || !evaluation.outcomeHash)
    return null;

  const snapshots = await executor
    .select()
    .from(reportSnapshots)
    .where(
      and(
        eq(reportSnapshots.questionnaireRuleEvaluationId, evaluation.id),
        eq(reportSnapshots.customerAccountId, input.customerAccountId),
        eq(reportSnapshots.diagnosticCaseId, input.diagnosticCaseId),
        eq(
          reportSnapshots.questionnaireSubmissionId,
          input.questionnaireSubmissionId
        ),
        eq(reportSnapshots.sourceOutboxEventId, input.sourceOutboxEventId)
      )
    )
    .limit(1)
    .for("update");
  return { evaluation, snapshot: snapshots[0] ?? null };
}

/**
 * Creates one pending identity from a validated evaluation. Exact replay returns
 * the existing row; divergent unique collisions fail closed.
 */
export async function initializeReportSnapshot(
  executor: R1Executor,
  value: InsertReportSnapshot
): Promise<ReportSnapshot> {
  assertInitialSnapshot(value);
  const source = await lockReportSnapshotSourceIdentity(executor, {
    customerAccountId: value.customerAccountId,
    diagnosticCaseId: value.diagnosticCaseId,
    questionnaireSubmissionId: value.questionnaireSubmissionId,
    questionnaireRuleEvaluationId: value.questionnaireRuleEvaluationId,
    sourceOutboxEventId: value.sourceOutboxEventId,
  });
  if (!source) {
    throw new ReportSnapshotPersistenceError(
      "successful source evaluation is missing"
    );
  }
  if (
    source.evaluation.inputSnapshotHash !== value.inputSnapshotHash ||
    source.evaluation.outcomeHash !== value.outcomeHash ||
    source.evaluation.rulesetHash !== value.rulesetBundleHash
  ) {
    throw new ReportSnapshotPersistenceError(
      "initial row is outside source hashes"
    );
  }
  if (source.snapshot) {
    if (!sameSourceIdentity(source.snapshot, value)) {
      throw new ReportSnapshotPersistenceError(
        "snapshot source collision is divergent"
      );
    }
    return source.snapshot;
  }

  try {
    await executor.insert(reportSnapshots).values(value);
  } catch (error) {
    if (!isDuplicateEntry(error)) throw error;
  }
  const rows = await executor
    .select()
    .from(reportSnapshots)
    .where(
      and(
        eq(
          reportSnapshots.questionnaireRuleEvaluationId,
          value.questionnaireRuleEvaluationId
        ),
        eq(reportSnapshots.customerAccountId, value.customerAccountId),
        eq(reportSnapshots.diagnosticCaseId, value.diagnosticCaseId),
        eq(
          reportSnapshots.questionnaireSubmissionId,
          value.questionnaireSubmissionId
        ),
        eq(reportSnapshots.sourceOutboxEventId, value.sourceOutboxEventId)
      )
    )
    .limit(1);
  const persisted = rows[0];
  if (!persisted || !sameSourceIdentity(persisted, value)) {
    throw new ReportSnapshotPersistenceError(
      "snapshot uniqueness collision is divergent"
    );
  }
  return persisted;
}

/** Claims the oldest pending or expired-processing snapshot with a fresh fence. */
export async function claimOneReportSnapshot(
  database: R1Database,
  input: { leaseOwner: string; now: Date; leaseExpiresAt: Date }
): Promise<ReportSnapshot | null> {
  if (input.leaseExpiresAt.getTime() <= input.now.getTime()) {
    throw new ReportSnapshotPersistenceError(
      "lease expiry must be in the future"
    );
  }
  return database.transaction(async tx => {
    const candidates = await tx
      .select()
      .from(reportSnapshots)
      .where(
        or(
          eq(reportSnapshots.status, "pending"),
          and(
            eq(reportSnapshots.status, "processing"),
            lte(reportSnapshots.leaseExpiresAt, input.now)
          )
        )
      )
      .orderBy(asc(reportSnapshots.createdAt), asc(reportSnapshots.id))
      .limit(1)
      .for("update");
    const candidate = candidates[0];
    if (!candidate) return null;

    const nextLeaseVersion = candidate.leaseVersion + 1;
    const result = await tx
      .update(reportSnapshots)
      .set({
        status: "processing",
        leaseOwner: input.leaseOwner,
        leaseVersion: nextLeaseVersion,
        leaseExpiresAt: input.leaseExpiresAt,
        attemptCount: sql`${reportSnapshots.attemptCount} + 1`,
        lastAttemptAt: input.now,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(reportSnapshots.id, candidate.id),
          eq(reportSnapshots.customerAccountId, candidate.customerAccountId),
          eq(reportSnapshots.diagnosticCaseId, candidate.diagnosticCaseId),
          eq(reportSnapshots.leaseVersion, candidate.leaseVersion),
          or(
            eq(reportSnapshots.status, "pending"),
            and(
              eq(reportSnapshots.status, "processing"),
              lte(reportSnapshots.leaseExpiresAt, input.now)
            )
          )
        )
      );
    if (Number(result[0].affectedRows) !== 1) return null;

    const claimed = await tx
      .select()
      .from(reportSnapshots)
      .where(
        and(
          eq(reportSnapshots.id, candidate.id),
          eq(reportSnapshots.customerAccountId, candidate.customerAccountId),
          eq(reportSnapshots.diagnosticCaseId, candidate.diagnosticCaseId),
          eq(reportSnapshots.status, "processing"),
          eq(reportSnapshots.leaseOwner, input.leaseOwner),
          eq(reportSnapshots.leaseVersion, nextLeaseVersion),
          gt(reportSnapshots.leaseExpiresAt, input.now)
        )
      )
      .limit(1);
    if (!claimed[0]) {
      throw new ReportSnapshotPersistenceError(
        "claimed lease could not be reloaded"
      );
    }
    return claimed[0];
  });
}

/** Owner/case fenced internal load; no public locator is exposed here. */
export async function loadReportSnapshot(
  executor: R1Executor,
  input: {
    reportSnapshotId: string;
    customerAccountId: string;
    diagnosticCaseId: string;
  }
): Promise<ReportSnapshot | null> {
  const rows = await executor
    .select()
    .from(reportSnapshots)
    .where(
      and(
        eq(reportSnapshots.id, input.reportSnapshotId),
        eq(reportSnapshots.customerAccountId, input.customerAccountId),
        eq(reportSnapshots.diagnosticCaseId, input.diagnosticCaseId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Public-case locator still requires the authenticated owner fence. */
export async function loadReadyReportSnapshotByPublicCase(
  executor: R1Executor,
  input: { customerAccountId: string; casePublicId: string }
): Promise<ReportSnapshot | null> {
  const rows = await executor
    .select({ snapshot: reportSnapshots })
    .from(reportSnapshots)
    .innerJoin(
      diagnosticCases,
      and(
        eq(diagnosticCases.id, reportSnapshots.diagnosticCaseId),
        eq(diagnosticCases.customerAccountId, reportSnapshots.customerAccountId)
      )
    )
    .where(
      and(
        eq(reportSnapshots.customerAccountId, input.customerAccountId),
        eq(diagnosticCases.publicId, input.casePublicId),
        eq(reportSnapshots.status, "ready"),
        eq(reportSnapshots.readySlot, 1)
      )
    )
    .limit(1);
  return rows[0]?.snapshot ?? null;
}

async function lockActiveLease(
  executor: R1Executor,
  input: ReportSnapshotLeaseFence
): Promise<ReportSnapshot | null> {
  const rows = await executor
    .select()
    .from(reportSnapshots)
    .where(
      and(
        eq(reportSnapshots.id, input.reportSnapshotId),
        eq(reportSnapshots.customerAccountId, input.customerAccountId),
        eq(reportSnapshots.diagnosticCaseId, input.diagnosticCaseId),
        eq(reportSnapshots.status, "processing"),
        eq(reportSnapshots.leaseOwner, input.leaseOwner),
        eq(reportSnapshots.leaseVersion, input.leaseVersion),
        gt(reportSnapshots.leaseExpiresAt, input.now)
      )
    )
    .limit(1)
    .for("update");
  return rows[0] ?? null;
}

/**
 * Loads every persisted fact used by the builder while the exact report lease is
 * locked. Ambiguous/missing joins return null; semantic validation remains pure.
 */
export async function loadPersistedReportSourceBundleForUpdate(
  executor: R1Executor,
  input: ReportSnapshotLeaseFence,
): Promise<PersistedReportSourceBundle | null> {
  const snapshot = await lockActiveLease(executor, input);
  if (!snapshot) return null;

  const coreRows = await executor
    .select({
      diagnosticCase: diagnosticCases,
      submission: questionnaireSubmissions,
      evaluation: questionnaireRuleEvaluations,
      sourceOutboxEvent: outboxEvents,
      draft: questionnaireDrafts,
    })
    .from(questionnaireRuleEvaluations)
    .innerJoin(
      questionnaireSubmissions,
      and(
        eq(questionnaireSubmissions.id, snapshot.questionnaireSubmissionId),
        eq(questionnaireSubmissions.customerAccountId, snapshot.customerAccountId),
        eq(questionnaireSubmissions.diagnosticCaseId, snapshot.diagnosticCaseId),
      ),
    )
    .innerJoin(
      questionnaireDrafts,
      and(
        eq(questionnaireDrafts.id, questionnaireSubmissions.questionnaireDraftId),
        eq(questionnaireDrafts.customerAccountId, snapshot.customerAccountId),
        eq(questionnaireDrafts.diagnosticCaseId, snapshot.diagnosticCaseId),
      ),
    )
    .innerJoin(
      diagnosticCases,
      and(
        eq(diagnosticCases.id, snapshot.diagnosticCaseId),
        eq(diagnosticCases.customerAccountId, snapshot.customerAccountId),
      ),
    )
    .innerJoin(
      outboxEvents,
      and(
        eq(outboxEvents.id, snapshot.sourceOutboxEventId),
        eq(outboxEvents.id, questionnaireRuleEvaluations.sourceOutboxEventId),
      ),
    )
    .where(and(
      eq(questionnaireRuleEvaluations.id, snapshot.questionnaireRuleEvaluationId),
      eq(questionnaireRuleEvaluations.customerAccountId, snapshot.customerAccountId),
      eq(questionnaireRuleEvaluations.diagnosticCaseId, snapshot.diagnosticCaseId),
      eq(questionnaireRuleEvaluations.questionnaireSubmissionId, snapshot.questionnaireSubmissionId),
    ))
    .limit(1)
    .for("update");
  const core = coreRows[0];
  if (!core) return null;

  const answerRevisions = await executor
    .select()
    .from(questionnaireAnswerRevisions)
    .where(and(
      eq(questionnaireAnswerRevisions.questionnaireDraftId, core.draft.id),
      eq(questionnaireAnswerRevisions.customerAccountId, snapshot.customerAccountId),
      eq(questionnaireAnswerRevisions.diagnosticCaseId, snapshot.diagnosticCaseId),
      lte(questionnaireAnswerRevisions.draftRevision, core.draft.draftRevision),
    ))
    .orderBy(
      desc(questionnaireAnswerRevisions.draftRevision),
      desc(questionnaireAnswerRevisions.createdAt),
      desc(questionnaireAnswerRevisions.id),
    )
    .for("update");

  const paymentRows = await executor
    .select({
      payment: paymentRecords,
      accessGrant: accessGrants,
      tariffSnapshot: tariffSnapshots,
    })
    .from(paymentRecords)
    .innerJoin(
      accessGrants,
      and(
        eq(accessGrants.paymentRecordId, paymentRecords.id),
        eq(accessGrants.customerAccountId, paymentRecords.customerAccountId),
        eq(accessGrants.diagnosticCaseId, paymentRecords.diagnosticCaseId),
      ),
    )
    .innerJoin(tariffSnapshots, eq(tariffSnapshots.id, paymentRecords.tariffSnapshotId))
    .where(and(
      eq(paymentRecords.customerAccountId, snapshot.customerAccountId),
      eq(paymentRecords.diagnosticCaseId, snapshot.diagnosticCaseId),
    ))
    .limit(2)
    .for("update");
  if (paymentRows.length !== 1) return null;

  const consents = await executor
    .select()
    .from(caseConsents)
    .where(and(
      eq(caseConsents.customerAccountId, snapshot.customerAccountId),
      eq(caseConsents.diagnosticCaseId, snapshot.diagnosticCaseId),
    ))
    .orderBy(asc(caseConsents.createdAt), asc(caseConsents.id))
    .for("update");

  return Object.freeze({
    reportSnapshot: snapshot,
    diagnosticCase: core.diagnosticCase,
    submission: core.submission,
    evaluation: core.evaluation,
    sourceOutboxEvent: core.sourceOutboxEvent,
    draft: core.draft,
    answerRevisions: Object.freeze(answerRevisions),
    payment: paymentRows[0]!.payment,
    accessGrant: paymentRows[0]!.accessGrant,
    tariffSnapshot: paymentRows[0]!.tariffSnapshot,
    caseConsents: Object.freeze(consents),
    lease: Object.freeze({
      leaseOwner: input.leaseOwner,
      leaseVersion: input.leaseVersion,
      verifiedAt: input.now,
    }),
  });
}

/** The only repository transition that can persist report payload/content. */
export async function completeReportSnapshot(
  executor: R1Executor,
  input: ReportSnapshotLeaseFence & {
    payloadJson: CanonicalJsonValue;
    payloadHash: string;
    contentHash: string;
  }
): Promise<boolean> {
  const locked = await lockActiveLease(executor, input);
  if (!locked) return false;
  if (canonicalSha256(input.payloadJson) !== input.payloadHash) {
    throw new ReportSnapshotPersistenceError(
      "canonical payload hash does not match"
    );
  }
  const result = await executor
    .update(reportSnapshots)
    .set({
      status: "ready",
      readySlot: 1,
      leaseOwner: null,
      leaseExpiresAt: null,
      payloadJson: input.payloadJson,
      payloadHash: input.payloadHash,
      contentHash: input.contentHash,
      failureCode: null,
      completedAt: input.now,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(reportSnapshots.id, locked.id),
        eq(reportSnapshots.customerAccountId, input.customerAccountId),
        eq(reportSnapshots.diagnosticCaseId, input.diagnosticCaseId),
        eq(reportSnapshots.status, "processing"),
        eq(reportSnapshots.leaseOwner, input.leaseOwner),
        eq(reportSnapshots.leaseVersion, input.leaseVersion),
        gt(reportSnapshots.leaseExpiresAt, input.now)
      )
    );
  return Number(result[0].affectedRows) === 1;
}

export async function failReportSnapshot(
  executor: R1Executor,
  input: ReportSnapshotLeaseFence & { failureCode: ReportSnapshotFailureCode }
): Promise<boolean> {
  const locked = await lockActiveLease(executor, input);
  if (!locked) return false;
  const result = await executor
    .update(reportSnapshots)
    .set({
      status: "failed",
      readySlot: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      payloadJson: null,
      payloadHash: null,
      contentHash: null,
      failureCode: input.failureCode,
      completedAt: input.now,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(reportSnapshots.id, locked.id),
        eq(reportSnapshots.customerAccountId, input.customerAccountId),
        eq(reportSnapshots.diagnosticCaseId, input.diagnosticCaseId),
        eq(reportSnapshots.status, "processing"),
        eq(reportSnapshots.leaseOwner, input.leaseOwner),
        eq(reportSnapshots.leaseVersion, input.leaseVersion),
        gt(reportSnapshots.leaseExpiresAt, input.now)
      )
    );
  return Number(result[0].affectedRows) === 1;
}

/**
 * Optional version handoff: only a ready artifact can lose the one-ready slot;
 * its payload and hashes remain immutable and no generic update API exists.
 */
export async function supersedeReadyReportSnapshot(
  executor: R1Executor,
  input: {
    reportSnapshotId: string;
    customerAccountId: string;
    diagnosticCaseId: string;
  }
): Promise<boolean> {
  const result = await executor
    .update(reportSnapshots)
    .set({ status: "superseded", readySlot: null })
    .where(
      and(
        eq(reportSnapshots.id, input.reportSnapshotId),
        eq(reportSnapshots.customerAccountId, input.customerAccountId),
        eq(reportSnapshots.diagnosticCaseId, input.diagnosticCaseId),
        eq(reportSnapshots.status, "ready"),
        eq(reportSnapshots.readySlot, 1)
      )
    );
  return Number(result[0].affectedRows) === 1;
}

/**
 * Validates the complete persisted source graph while holding all source rows.
 * This is intentionally separate from initialization so workers can revalidate
 * source hashes immediately before deterministic template generation.
 */
export async function validateReportSnapshotSourceForUpdate(
  executor: R1Executor,
  input: {
    reportSnapshotId: string;
    customerAccountId: string;
    diagnosticCaseId: string;
  }
): Promise<ReportSnapshot | null> {
  const rows = await executor
    .select({
      snapshot: reportSnapshots,
      evaluationStatus: questionnaireRuleEvaluations.status,
      evaluationInputHash: questionnaireRuleEvaluations.inputSnapshotHash,
      evaluationOutcomeHash: questionnaireRuleEvaluations.outcomeHash,
      evaluationRulesetHash: questionnaireRuleEvaluations.rulesetHash,
      submissionInputHash: questionnaireSubmissions.inputSnapshotHash,
      submissionRulesetHash: questionnaireSubmissions.rulesetBundleHash,
      sourceOutboxId: outboxEvents.id,
    })
    .from(reportSnapshots)
    .innerJoin(
      questionnaireRuleEvaluations,
      and(
        eq(
          questionnaireRuleEvaluations.id,
          reportSnapshots.questionnaireRuleEvaluationId
        ),
        eq(
          questionnaireRuleEvaluations.customerAccountId,
          reportSnapshots.customerAccountId
        ),
        eq(
          questionnaireRuleEvaluations.diagnosticCaseId,
          reportSnapshots.diagnosticCaseId
        ),
        eq(
          questionnaireRuleEvaluations.questionnaireSubmissionId,
          reportSnapshots.questionnaireSubmissionId
        ),
        eq(
          questionnaireRuleEvaluations.sourceOutboxEventId,
          reportSnapshots.sourceOutboxEventId
        )
      )
    )
    .innerJoin(
      questionnaireSubmissions,
      and(
        eq(
          questionnaireSubmissions.id,
          reportSnapshots.questionnaireSubmissionId
        ),
        eq(
          questionnaireSubmissions.customerAccountId,
          reportSnapshots.customerAccountId
        ),
        eq(
          questionnaireSubmissions.diagnosticCaseId,
          reportSnapshots.diagnosticCaseId
        )
      )
    )
    .innerJoin(
      outboxEvents,
      eq(outboxEvents.id, reportSnapshots.sourceOutboxEventId)
    )
    .where(
      and(
        eq(reportSnapshots.id, input.reportSnapshotId),
        eq(reportSnapshots.customerAccountId, input.customerAccountId),
        eq(reportSnapshots.diagnosticCaseId, input.diagnosticCaseId)
      )
    )
    .limit(1)
    .for("update");
  const row = rows[0];
  if (!row) return null;
  if (
    !(
      row.evaluationStatus === "succeeded" ||
      row.evaluationStatus === "manual_review_required"
    ) ||
    row.evaluationInputHash !== row.snapshot.inputSnapshotHash ||
    row.submissionInputHash !== row.snapshot.inputSnapshotHash ||
    row.evaluationOutcomeHash !== row.snapshot.outcomeHash ||
    row.evaluationRulesetHash !== row.snapshot.rulesetBundleHash ||
    row.submissionRulesetHash !== row.snapshot.rulesetBundleHash ||
    row.sourceOutboxId !== row.snapshot.sourceOutboxEventId
  ) {
    throw new ReportSnapshotPersistenceError(
      "persisted source graph is divergent"
    );
  }
  return row.snapshot;
}
