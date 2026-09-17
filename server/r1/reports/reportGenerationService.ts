import type {
  InsertReportSnapshot,
  QuestionnaireRuleEvaluation,
  ReportSnapshot,
} from "../../../drizzle/schema";
import type { R1Database, R1Executor } from "../database";
import { sha256Hex } from "../questionnaire/canonicalJson";
import {
  initializeReportSnapshot,
  loadPersistedReportSourceBundleForUpdate,
  lockReportSnapshotSourceIdentity,
  type ReportSnapshotLeaseFence,
} from "./reportSnapshotRepository";
import {
  ReportSourceBundleValidationError,
  verifyPersistedReportSourceBundle,
} from "./sourceBundleValidator";
import {
  REPORT_SCHEMA_VERSION,
  type BuildReportSnapshotInput,
  type PersistedReportSourceBundle,
  type VerifiedReportSourceBundle,
} from "./types";
import { PINNED_REPORT_CONFIGURATION } from "./provenanceValidator";

export type ReportSnapshotClaim = Readonly<{
  reportSnapshotId: string;
  customerAccountId: string;
  diagnosticCaseId: string;
  leaseOwner: string;
  leaseVersion: number;
}>;

export type CompletedEvaluationClaim = Readonly<{
  customerAccountId: string;
  diagnosticCaseId: string;
  questionnaireSubmissionId: string;
  questionnaireRuleEvaluationId: string;
  sourceOutboxEventId: string;
}>;

export class ReportGenerationSourceError extends Error {
  constructor(readonly code: "source_data_missing" | "source_fence_invalid") {
    super(code);
    this.name = "ReportGenerationSourceError";
  }
}

function snapshotId(evaluation: QuestionnaireRuleEvaluation): string {
  return `report_${sha256Hex(`report:v1:${evaluation.id}:${evaluation.outcomeHash}`).slice(0, 40)}`;
}

function initialSnapshot(
  evaluation: QuestionnaireRuleEvaluation,
  claim: CompletedEvaluationClaim,
  now: Date,
): InsertReportSnapshot {
  if (!evaluation.outcomeHash) throw new ReportGenerationSourceError("source_fence_invalid");
  return {
    id: snapshotId(evaluation),
    customerAccountId: claim.customerAccountId,
    diagnosticCaseId: claim.diagnosticCaseId,
    questionnaireSubmissionId: claim.questionnaireSubmissionId,
    questionnaireRuleEvaluationId: claim.questionnaireRuleEvaluationId,
    sourceOutboxEventId: claim.sourceOutboxEventId,
    reportVersion: 1,
    generationReason: "initial_evaluation",
    templateVersion: REPORT_SCHEMA_VERSION,
    inputSnapshotHash: evaluation.inputSnapshotHash,
    outcomeHash: evaluation.outcomeHash,
    rulesetBundleHash: evaluation.rulesetHash,
    status: "pending",
    generationMode: "template",
    readySlot: null,
    leaseOwner: null,
    leaseVersion: 0,
    leaseExpiresAt: null,
    attemptCount: 0,
    payloadJson: null,
    payloadHash: null,
    contentHash: null,
    failureCode: null,
    lastAttemptAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function initializeReportForCompletedEvaluationInTransaction(
  executor: R1Executor,
  claim: CompletedEvaluationClaim,
  now: Date,
): Promise<ReportSnapshot> {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError("Invalid report initialization clock");
  }
  const source = await lockReportSnapshotSourceIdentity(executor, claim);
  if (!source) throw new ReportGenerationSourceError("source_data_missing");
  const expectedManual = source.evaluation.status === "manual_review_required";
  if (
    !(source.evaluation.status === "succeeded" || expectedManual) ||
    source.evaluation.manualReviewRequired !== expectedManual ||
    source.evaluation.failureCode !== null ||
    source.evaluation.completedAt === null ||
    !source.evaluation.outcomeHash
  ) {
    throw new ReportGenerationSourceError("source_fence_invalid");
  }
  return initializeReportSnapshot(
    executor,
    initialSnapshot(source.evaluation, claim, now),
  );
}

/** Explicit internal path; no scheduler/event contract is introduced. */
export async function initializeReportForCompletedEvaluation(
  database: R1Database,
  claim: CompletedEvaluationClaim,
  now: Date,
): Promise<ReportSnapshot> {
  return database.transaction(tx =>
    initializeReportForCompletedEvaluationInTransaction(tx, claim, now)
  );
}

export async function loadVerifiedReportBuildInputForUpdate(
  executor: R1Executor,
  claim: ReportSnapshotClaim,
  now: Date,
): Promise<{
  input: BuildReportSnapshotInput;
  source: PersistedReportSourceBundle;
  verified: VerifiedReportSourceBundle;
}> {
  const lease: ReportSnapshotLeaseFence = { ...claim, now };
  const source = await loadPersistedReportSourceBundleForUpdate(executor, lease);
  if (!source) throw new ReportGenerationSourceError("source_data_missing");
  let verified: VerifiedReportSourceBundle;
  try {
    verified = verifyPersistedReportSourceBundle(source);
  } catch (error) {
    if (error instanceof ReportSourceBundleValidationError) throw error;
    throw new ReportGenerationSourceError("source_fence_invalid");
  }
  const input: BuildReportSnapshotInput = Object.freeze({
    identity: Object.freeze({
      reportId: source.reportSnapshot.id,
      reportVersion: source.reportSnapshot.reportVersion,
      generationReason: source.reportSnapshot.generationReason,
      generatedAt: now.toISOString(),
      sourceReportRequestId: source.evaluation.id,
      idempotencyKeyHash: sha256Hex(
        `report:${source.evaluation.id}:${source.evaluation.outcomeHash}`,
      ),
      supersedesReportId: null,
    }),
    submission: source.submission,
    evaluation: source.evaluation,
    approved: false as const,
    pinnedConfiguration: PINNED_REPORT_CONFIGURATION,
    verifiedSourceBundle: verified,
  });
  return Object.freeze({ input, source, verified });
}
