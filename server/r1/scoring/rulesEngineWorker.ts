import type {
  InsertQuestionnaireRuleEvaluation,
  QuestionnaireRuleEvaluation,
  QuestionnaireSubmission,
} from "../../../drizzle/schema";
import { appendAuditEvent } from "../audit/auditRepository";
import { compareAndSwapCaseStatus } from "../cases/caseRepository";
import type { R1Database, R1Executor } from "../database";
import {
  acknowledgeScoringEventInTransaction,
  claimOneScoringEvent,
  failScoringEventInTransaction,
  loadScoringLeaseTargetForUpdate,
  retryScoringEventInTransaction,
  ScoringOutboxPersistenceError,
  type ClaimedScoringEvent,
  type ScoringOutboxErrorCode,
  type ScoringOutboxLeaseFence,
} from "../outbox/outboxRepository";
import {
  canonicalSerialize,
  sha256Hex,
  type CanonicalJsonValue,
} from "../questionnaire/canonicalJson";
import { validateCanonicalAnswer, type EffectiveAnswers } from "../questionnaire/validation";
import {
  assertTechnicalLegalCoreAllowed,
  evaluateTechnicalLegalCore,
  legalCoreRulesetBundleHash,
  technicalLegalCoreConfigBundle,
  type LegalCoreConfigBundle,
  type TechnicalLegalCoreOutcome,
} from "./core";
import { LegalCoreConfigValidationError } from "./core/configBundle";
import {
  completeRuleEvaluation,
  failRuleEvaluation,
  findRuleEvaluationBySourceForUpdate,
  insertRuleEvaluation,
  RuleEvaluationPersistenceError,
  type RuleEvaluationFailureCode,
} from "./ruleEvaluationRepository";

const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 5_000;

export type RulesEngineWorkerResult =
  | Readonly<{ processed: false; reason: "empty" | "lease_lost" }>
  | Readonly<{
      processed: true;
      status: "succeeded" | "manual_review_required" | "failed" | "retry_scheduled";
      evaluationId?: string;
    }>;

export type RulesEngineWorkerOptions = Readonly<{
  leaseOwner: string;
  now: () => Date;
  leaseDurationMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  serviceActorId?: string;
}>;

export type RulesEngineWorkerDependencies = Readonly<{
  bundle?: LegalCoreConfigBundle;
  assertBundleAllowed?: typeof assertTechnicalLegalCoreAllowed;
  evaluate?: typeof evaluateTechnicalLegalCore;
  claim?: typeof claimOneScoringEvent;
  appendAudit?: typeof appendAuditEvent;
  compareAndSwapStatus?: typeof compareAndSwapCaseStatus;
  loadLeaseTarget?: typeof loadScoringLeaseTargetForUpdate;
  insertEvaluation?: typeof insertRuleEvaluation;
  findEvaluation?: typeof findRuleEvaluationBySourceForUpdate;
  completeEvaluation?: typeof completeRuleEvaluation;
  failEvaluation?: typeof failRuleEvaluation;
  acknowledge?: typeof acknowledgeScoringEventInTransaction;
  failEvent?: typeof failScoringEventInTransaction;
  retryEvent?: typeof retryScoringEventInTransaction;
}>;

type Snapshot = Readonly<{
  releaseId: string;
  version: string;
  contentHash: string;
  visibleQuestionIds: readonly string[];
  visibleSetHash: string;
  manualFollowUpTriggerIds: readonly string[];
  activeAnswers: EffectiveAnswers;
  draftRevision: number;
}>;

type PreparedEvaluation = Readonly<{
  outcome: TechnicalLegalCoreOutcome;
  outcomeJson: CanonicalJsonValue;
  outcomeHash: string;
  status: "succeeded" | "manual_review_required";
}>;

type SafeFailure = Readonly<{
  evaluationCode: RuleEvaluationFailureCode;
  outboxCode: ScoringOutboxErrorCode;
}>;

class SafeRulesEngineFailure extends Error {
  constructor(readonly failure: SafeFailure) {
    super(failure.evaluationCode);
    this.name = "SafeRulesEngineFailure";
  }
}

class RulesEngineLeaseLostError extends Error {
  constructor() {
    super("rules_engine_lease_lost");
    this.name = "RulesEngineLeaseLostError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function decodeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new SafeRulesEngineFailure({
      evaluationCode: "input_inconsistent",
      outboxCode: "input_inconsistent",
    });
  }
}

function exactStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) {
    throw new SafeRulesEngineFailure({
      evaluationCode: "input_inconsistent",
      outboxCode: "input_inconsistent",
    });
  }
  const strings = value as string[];
  if (new Set(strings).size !== strings.length) {
    throw new SafeRulesEngineFailure({
      evaluationCode: "input_inconsistent",
      outboxCode: "input_inconsistent",
    });
  }
  return Object.freeze([...strings]);
}

function parseSnapshot(
  submission: QuestionnaireSubmission,
  bundle: LegalCoreConfigBundle,
): Snapshot {
  const decoded = decodeJson(submission.inputSnapshotJson);
  if (!isPlainObject(decoded)) {
    throw new SafeRulesEngineFailure({
      evaluationCode: "input_inconsistent",
      outboxCode: "input_inconsistent",
    });
  }
  const expectedKeys = [
    "activeAnswers",
    "contentHash",
    "draftRevision",
    "manualFollowUpTriggerIds",
    "releaseId",
    "version",
    "visibleQuestionIds",
    "visibleSetHash",
  ];
  if (Object.keys(decoded).sort().join(",") !== expectedKeys.sort().join(",")) {
    throw new SafeRulesEngineFailure({
      evaluationCode: "input_inconsistent",
      outboxCode: "input_inconsistent",
    });
  }

  let canonical: string;
  try {
    canonical = canonicalSerialize(decoded as CanonicalJsonValue);
  } catch {
    throw new SafeRulesEngineFailure({
      evaluationCode: "input_inconsistent",
      outboxCode: "input_inconsistent",
    });
  }
  if (
    sha256Hex(canonical) !== submission.inputSnapshotHash ||
    submission.questionnaireReleaseId !== bundle.questionnaire.releaseId ||
    submission.questionnaireVersion !== bundle.questionnaire.version ||
    submission.questionnaireContentHash !== bundle.questionnaire.contentHash ||
    decoded.releaseId !== submission.questionnaireReleaseId ||
    decoded.version !== submission.questionnaireVersion ||
    decoded.contentHash !== submission.questionnaireContentHash ||
    decoded.visibleSetHash !== submission.visibleSetHash ||
    typeof decoded.draftRevision !== "number" ||
    !Number.isSafeInteger(decoded.draftRevision) ||
    decoded.draftRevision < 0
  ) {
    throw new SafeRulesEngineFailure({
      evaluationCode: "input_inconsistent",
      outboxCode: "input_inconsistent",
    });
  }

  const visibleQuestionIds = exactStringArray(decoded.visibleQuestionIds);
  const manualFollowUpTriggerIds = exactStringArray(decoded.manualFollowUpTriggerIds);
  const persistedVisibleQuestionIds = exactStringArray(decodeJson(submission.visibleQuestionIds));
  const persistedManualFollowUpTriggerIds = exactStringArray(
    decodeJson(submission.manualFollowUpTriggerIds),
  );
  if (
    sha256Hex(canonicalSerialize(visibleQuestionIds)) !== decoded.visibleSetHash ||
    canonicalSerialize(visibleQuestionIds) !== canonicalSerialize(persistedVisibleQuestionIds) ||
    canonicalSerialize(manualFollowUpTriggerIds) !==
      canonicalSerialize(persistedManualFollowUpTriggerIds) ||
    submission.manualFollowUpRequired !== (manualFollowUpTriggerIds.length > 0) ||
    !isPlainObject(decoded.activeAnswers)
  ) {
    throw new SafeRulesEngineFailure({
      evaluationCode: "input_inconsistent",
      outboxCode: "input_inconsistent",
    });
  }

  const activeAnswers: Record<string, EffectiveAnswers[string]> = {};
  try {
    for (const questionId of Object.keys(decoded.activeAnswers).sort()) {
      activeAnswers[questionId] = validateCanonicalAnswer(
        bundle.questionnaire,
        questionId,
        decoded.activeAnswers[questionId],
      );
    }
  } catch {
    throw new SafeRulesEngineFailure({
      evaluationCode: "input_inconsistent",
      outboxCode: "input_inconsistent",
    });
  }
  const visible = new Set(visibleQuestionIds);
  if (Object.keys(activeAnswers).some(questionId => !visible.has(questionId))) {
    throw new SafeRulesEngineFailure({
      evaluationCode: "input_inconsistent",
      outboxCode: "input_inconsistent",
    });
  }

  return Object.freeze({
    releaseId: decoded.releaseId as string,
    version: decoded.version as string,
    contentHash: decoded.contentHash as string,
    visibleQuestionIds,
    visibleSetHash: decoded.visibleSetHash as string,
    manualFollowUpTriggerIds,
    activeAnswers: Object.freeze(activeAnswers),
    draftRevision: decoded.draftRevision,
  });
}

export const rulesetBundleHash = legalCoreRulesetBundleHash;

function prepareEvaluation(
  submission: QuestionnaireSubmission,
  bundle: LegalCoreConfigBundle,
  evaluate: typeof evaluateTechnicalLegalCore,
): PreparedEvaluation {
  const snapshot = parseSnapshot(submission, bundle);
  const outcome = evaluate(
    {
      canonicalAnswers: snapshot.activeAnswers,
      previousVisibleQuestionIds: snapshot.visibleQuestionIds,
    },
    bundle,
  );
  if (
    !isPlainObject(outcome) ||
    (outcome.kind !== "validation" && outcome.kind !== "evaluated") ||
    !isPlainObject(outcome.validation) ||
    (outcome.kind === "validation" &&
      (outcome.validation.valid !== false ||
        outcome.validation.blocksRecommendation !== true ||
        outcome.recommendation !== null)) ||
    (outcome.kind === "evaluated" &&
      (outcome.validation.valid !== true ||
        outcome.validation.blocksRecommendation !== false ||
        !isPlainObject(outcome.recommendation) ||
        !isPlainObject(outcome.configuration) ||
        outcome.configuration.rulesetId !== bundle.rules.rulesetId ||
        outcome.configuration.mappingId !== bundle.recommendationMapping.mappingId ||
        canonicalSerialize(outcome.configuration.contentHashes) !==
          canonicalSerialize(bundle.contentHashes)))
  ) {
    throw new SafeRulesEngineFailure({
      evaluationCode: "technical_failure",
      outboxCode: "technical_failure",
    });
  }
  let outcomeJson: CanonicalJsonValue;
  let outcomeHash: string;
  try {
    outcomeJson = JSON.parse(canonicalSerialize(outcome as unknown as CanonicalJsonValue)) as CanonicalJsonValue;
    outcomeHash = sha256Hex(canonicalSerialize(outcomeJson));
  } catch {
    throw new SafeRulesEngineFailure({
      evaluationCode: "technical_failure",
      outboxCode: "technical_failure",
    });
  }
  if (
    outcome.releaseId !== bundle.releaseId ||
    outcome.version !== bundle.version ||
    outcome.status !== bundle.status ||
    outcome.technicalUse !== bundle.technicalUse
  ) {
    throw new SafeRulesEngineFailure({
      evaluationCode: "technical_failure",
      outboxCode: "technical_failure",
    });
  }
  return Object.freeze({
    outcome,
    outcomeJson,
    outcomeHash,
    // Internal policy: even a valid technical outcome is not a public report and
    // always ends in manual review while legal approval/runtime enablement is absent.
    status: "manual_review_required",
  });
}

function dependencies(input: RulesEngineWorkerDependencies) {
  return {
    bundle: input.bundle ?? technicalLegalCoreConfigBundle,
    assertBundleAllowed: input.assertBundleAllowed ?? assertTechnicalLegalCoreAllowed,
    evaluate: input.evaluate ?? evaluateTechnicalLegalCore,
    claim: input.claim ?? claimOneScoringEvent,
    appendAudit: input.appendAudit ?? appendAuditEvent,
    compareAndSwapStatus: input.compareAndSwapStatus ?? compareAndSwapCaseStatus,
    loadLeaseTarget: input.loadLeaseTarget ?? loadScoringLeaseTargetForUpdate,
    insertEvaluation: input.insertEvaluation ?? insertRuleEvaluation,
    findEvaluation: input.findEvaluation ?? findRuleEvaluationBySourceForUpdate,
    completeEvaluation: input.completeEvaluation ?? completeRuleEvaluation,
    failEvaluation: input.failEvaluation ?? failRuleEvaluation,
    acknowledge: input.acknowledge ?? acknowledgeScoringEventInTransaction,
    failEvent: input.failEvent ?? failScoringEventInTransaction,
    retryEvent: input.retryEvent ?? retryScoringEventInTransaction,
  };
}

function deterministicEvaluationId(outboxEventId: string, rulesetHash: string): string {
  return `ruleeval_${sha256Hex(`${outboxEventId}:${rulesetHash}`).slice(0, 40)}`;
}

function freshNow(options: RulesEngineWorkerOptions): Date {
  const value = options.now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError("Invalid rules-engine worker clock");
  }
  return value;
}

function leaseFor(
  claim: ClaimedScoringEvent,
  options: RulesEngineWorkerOptions,
  now = freshNow(options),
): ScoringOutboxLeaseFence {
  return {
    outboxEventId: claim.outboxEvent.id,
    customerAccountId: claim.submission.customerAccountId,
    diagnosticCaseId: claim.submission.diagnosticCaseId,
    submissionId: claim.submission.id,
    leaseOwner: options.leaseOwner,
    leaseVersion: claim.outboxEvent.leaseVersion,
    now,
  };
}

function evaluationIdentity(
  claim: ClaimedScoringEvent,
  evaluationId: string,
  bundle: LegalCoreConfigBundle,
  rulesetHash: string,
  now: Date,
): InsertQuestionnaireRuleEvaluation {
  return {
    id: evaluationId,
    customerAccountId: claim.submission.customerAccountId,
    diagnosticCaseId: claim.submission.diagnosticCaseId,
    questionnaireSubmissionId: claim.submission.id,
    sourceOutboxEventId: claim.outboxEvent.id,
    submittedCaseStateVersion: claim.event.privacySafePayload.submittedCaseStateVersion,
    rulesetId: claim.submission.rulesetId,
    rulesetVersion: claim.submission.legalCoreVersion,
    rulesetHash: claim.submission.rulesetBundleHash,
    inputSnapshotHash: claim.submission.inputSnapshotHash,
    status: "pending",
    outcomeJson: null,
    outcomeHash: null,
    manualReviewRequired: false,
    failureCode: null,
    startedAt: now,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function sameIdentity(
  evaluation: QuestionnaireRuleEvaluation,
  identity: InsertQuestionnaireRuleEvaluation,
): boolean {
  return evaluation.customerAccountId === identity.customerAccountId &&
    evaluation.diagnosticCaseId === identity.diagnosticCaseId &&
    evaluation.questionnaireSubmissionId === identity.questionnaireSubmissionId &&
    evaluation.sourceOutboxEventId === identity.sourceOutboxEventId &&
    evaluation.submittedCaseStateVersion === identity.submittedCaseStateVersion &&
    evaluation.rulesetId === identity.rulesetId &&
    evaluation.rulesetVersion === identity.rulesetVersion &&
    evaluation.rulesetHash === identity.rulesetHash &&
    evaluation.inputSnapshotHash === identity.inputSnapshotHash;
}

function auditMetadata(identity: InsertQuestionnaireRuleEvaluation) {
  return {
    caseId: identity.diagnosticCaseId,
    submissionId: identity.questionnaireSubmissionId,
    sourceOutboxEventId: identity.sourceOutboxEventId,
    submittedCaseStateVersion: identity.submittedCaseStateVersion,
    rulesetId: identity.rulesetId,
    rulesetHash: identity.rulesetHash,
    inputSnapshotHash: identity.inputSnapshotHash,
    test: true as const,
  };
}

async function appendTransitionAudit(
  executor: R1Executor,
  appendAudit: typeof appendAuditEvent,
  input: {
    actorId: string;
    caseId: string;
    fromStatus: "submitted" | "scoring";
    toStatus: "scoring" | "manual_review_required" | "failed";
    stateVersion: number;
    correlationId: string;
    now: Date;
  },
): Promise<void> {
  await appendAudit(executor, {
    actorType: "service",
    actorId: input.actorId,
    aggregateType: "diagnostic_case",
    aggregateId: input.caseId,
    eventType: "diagnostic_case.status_changed",
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    outcome: "succeeded",
    reasonCode: input.toStatus === "failed" ? "system_failure" :
      input.toStatus === "manual_review_required" ? "manual_review" : "workflow_progression",
    requestId: input.correlationId,
    idempotencyKeyHash: sha256Hex(`rules-engine:${input.correlationId}:${input.fromStatus}:${input.toStatus}`),
    privacySafeMetadata: { stateVersion: input.stateVersion },
    createdAt: input.now,
  });
}

async function transitionExact(
  executor: R1Executor,
  deps: ReturnType<typeof dependencies>,
  input: {
    actorId: string;
    correlationId: string;
    caseId: string;
    customerAccountId: string;
    fromStatus: "submitted" | "scoring";
    toStatus: "scoring" | "manual_review_required" | "failed";
    expectedStateVersion: number;
    now: Date;
  },
): Promise<void> {
  const changed = await deps.compareAndSwapStatus(executor, {
    id: input.caseId,
    customerAccountId: input.customerAccountId,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    expectedStateVersion: input.expectedStateVersion,
    now: input.now,
  });
  if (!changed) {
    throw new SafeRulesEngineFailure({
      evaluationCode: "input_inconsistent",
      outboxCode: "persistence_conflict",
    });
  }
  await appendTransitionAudit(executor, deps.appendAudit, {
    actorId: input.actorId,
    correlationId: input.correlationId,
    caseId: input.caseId,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    stateVersion: input.expectedStateVersion + 1,
    now: input.now,
  });
}

function assertClaimMatchesLockedTarget(
  claim: ClaimedScoringEvent,
  target: NonNullable<Awaited<ReturnType<typeof loadScoringLeaseTargetForUpdate>>>,
  bundle: LegalCoreConfigBundle,
): void {
  const payload = claim.event.privacySafePayload;
  const submission = target.submission;
  if (
    target.outboxEvent.id !== claim.outboxEvent.id ||
    target.outboxEvent.leaseVersion !== claim.outboxEvent.leaseVersion ||
    submission.id !== claim.submission.id ||
    submission.customerAccountId !== claim.submission.customerAccountId ||
    submission.diagnosticCaseId !== claim.submission.diagnosticCaseId ||
    payload.caseId !== submission.diagnosticCaseId ||
    payload.submissionId !== submission.id ||
    payload.submissionVersion !== submission.submissionVersion ||
    payload.inputSnapshotHash !== submission.inputSnapshotHash ||
    payload.legalCoreReleaseId !== submission.legalCoreReleaseId ||
    payload.legalCoreVersion !== submission.legalCoreVersion ||
    payload.rulesetId !== submission.rulesetId ||
    payload.rulesetBundleHash !== submission.rulesetBundleHash ||
    submission.legalCoreReleaseId !== bundle.releaseId ||
    submission.legalCoreVersion !== bundle.version ||
    submission.rulesetId !== bundle.rules.rulesetId ||
    submission.rulesetBundleHash !== rulesetBundleHash(bundle) ||
    submission.questionnaireReleaseId !== bundle.questionnaire.releaseId ||
    submission.questionnaireVersion !== bundle.questionnaire.version ||
    submission.questionnaireContentHash !== bundle.questionnaire.contentHash ||
    !(
      (target.caseStatus === "submitted" &&
        target.caseStateVersion === payload.submittedCaseStateVersion) ||
      (target.caseStatus === "scoring" &&
        target.caseStateVersion === payload.submittedCaseStateVersion + 1) ||
      (target.caseStatus === "manual_review_required" &&
        target.caseStateVersion === payload.submittedCaseStateVersion + 2)
    )
  ) {
    throw new SafeRulesEngineFailure({
      evaluationCode: "input_inconsistent",
      outboxCode: "input_inconsistent",
    });
  }
}

function assertImmutableRulesetPin(
  claim: ClaimedScoringEvent,
  bundle: LegalCoreConfigBundle,
  loadedBundleHash: string,
): void {
  const payload = claim.event.privacySafePayload;
  const submission = claim.submission;
  if (
    submission.legalCoreReleaseId !== bundle.releaseId ||
    submission.legalCoreVersion !== bundle.version ||
    submission.rulesetId !== bundle.rules.rulesetId ||
    submission.rulesetBundleHash !== loadedBundleHash ||
    payload.legalCoreReleaseId !== submission.legalCoreReleaseId ||
    payload.legalCoreVersion !== submission.legalCoreVersion ||
    payload.rulesetId !== submission.rulesetId ||
    payload.rulesetBundleHash !== submission.rulesetBundleHash
  ) {
    throw new SafeRulesEngineFailure({
      evaluationCode: "configuration_invalid",
      outboxCode: "configuration_unavailable",
    });
  }
}

function asSafeFailure(error: unknown): SafeFailure | null {
  if (error instanceof SafeRulesEngineFailure) return error.failure;
  if (error instanceof LegalCoreConfigValidationError) {
    return { evaluationCode: "configuration_invalid", outboxCode: "configuration_unavailable" };
  }
  if (error instanceof RuleEvaluationPersistenceError || error instanceof ScoringOutboxPersistenceError) {
    return { evaluationCode: "input_inconsistent", outboxCode: "persistence_conflict" };
  }
  return null;
}

async function failClaimedJob(
  database: R1Database,
  claim: ClaimedScoringEvent,
  options: RulesEngineWorkerOptions,
  deps: ReturnType<typeof dependencies>,
  failure: SafeFailure,
  bundle: LegalCoreConfigBundle,
  rulesetHash: string,
  requestedEvaluationId: string,
): Promise<RulesEngineWorkerResult> {
  const actorId = options.serviceActorId ?? options.leaseOwner;
  try {
    return await database.transaction(async tx => {
      let lease = leaseFor(claim, options);
      const target = await deps.loadLeaseTarget(tx, lease);
      if (!target) throw new RulesEngineLeaseLostError();

      const identityNow = freshNow(options);
      const identity = evaluationIdentity(
        claim,
        requestedEvaluationId,
        bundle,
        rulesetHash,
        identityNow,
      );
      const existing = await deps.findEvaluation(tx, {
        sourceOutboxEventId: claim.outboxEvent.id,
        customerAccountId: claim.submission.customerAccountId,
        diagnosticCaseId: claim.submission.diagnosticCaseId,
        questionnaireSubmissionId: claim.submission.id,
      });
      let evaluation = existing;
      const identityMatches = !evaluation || sameIdentity(evaluation, identity);
      if (!identityMatches) {
        failure = { evaluationCode: "input_inconsistent", outboxCode: "persistence_conflict" };
      }
      if (!evaluation) {
        lease = leaseFor(claim, options);
        evaluation = await deps.insertEvaluation(tx, lease, identity);
        await deps.appendAudit(tx, {
          actorType: "service",
          actorId,
          aggregateType: "questionnaire_rule_evaluation",
          aggregateId: evaluation.id,
          eventType: "rules_engine.evaluation_started",
          outcome: "succeeded",
          toStatus: "pending",
          correlationId: claim.outboxEvent.eventId,
          privacySafeMetadata: auditMetadata(identity),
          createdAt: freshNow(options),
        });
      }
      if (identityMatches && evaluation.status === "pending") {
        lease = leaseFor(claim, options);
        const failed = await deps.failEvaluation(tx, {
          ...lease,
          evaluationId: evaluation.id,
          failureCode: failure.evaluationCode,
        });
        if (!failed) throw new RulesEngineLeaseLostError();
        await deps.appendAudit(tx, {
          actorType: "service",
          actorId,
          aggregateType: "questionnaire_rule_evaluation",
          aggregateId: evaluation.id,
          eventType: "rules_engine.evaluation_failed",
          outcome: "failed",
          fromStatus: "pending",
          toStatus: "failed",
          correlationId: claim.outboxEvent.eventId,
          reasonCode: failure.evaluationCode,
          privacySafeMetadata: auditMetadata(identity),
          createdAt: freshNow(options),
        });
      }

      if (
        target.caseStatus === "submitted" &&
        target.caseStateVersion === identity.submittedCaseStateVersion
      ) {
        const transitionNow = freshNow(options);
        await transitionExact(tx, deps, {
          actorId,
          correlationId: claim.outboxEvent.eventId,
          caseId: identity.diagnosticCaseId,
          customerAccountId: identity.customerAccountId,
          fromStatus: "submitted",
          toStatus: "failed",
          expectedStateVersion: identity.submittedCaseStateVersion,
          now: transitionNow,
        });
      } else if (
        target.caseStatus === "scoring" &&
        target.caseStateVersion === identity.submittedCaseStateVersion + 1
      ) {
        const transitionNow = freshNow(options);
        await transitionExact(tx, deps, {
          actorId,
          correlationId: claim.outboxEvent.eventId,
          caseId: identity.diagnosticCaseId,
          customerAccountId: identity.customerAccountId,
          fromStatus: "scoring",
          toStatus: "failed",
          expectedStateVersion: identity.submittedCaseStateVersion + 1,
          now: transitionNow,
        });
      }

      lease = leaseFor(claim, options);
      const eventFailed = await deps.failEvent(tx, {
        ...lease,
        errorCode: failure.outboxCode,
      });
      if (!eventFailed) throw new RulesEngineLeaseLostError();
      return { processed: true, status: "failed", evaluationId: evaluation.id } as const;
    });
  } catch (error) {
    if (error instanceof RulesEngineLeaseLostError) {
      return { processed: false, reason: "lease_lost" };
    }
    throw error;
  }
}

async function scheduleRetry(
  database: R1Database,
  claim: ClaimedScoringEvent,
  options: RulesEngineWorkerOptions,
  deps: ReturnType<typeof dependencies>,
): Promise<RulesEngineWorkerResult> {
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const retryNow = freshNow(options);
  const lease = leaseFor(claim, options, retryNow);
  const retried = await database.transaction(tx => deps.retryEvent(tx, {
    ...lease,
    nextAttemptAt: new Date(retryNow.getTime() + retryDelayMs),
    errorCode: "technical_failure",
  }));
  return retried
    ? { processed: true, status: "retry_scheduled" }
    : { processed: false, reason: "lease_lost" };
}

/**
 * Synchronously claims and commits one internal job. Scheduling is deliberately
 * outside this module; callers may invoke it from an existing trusted process.
 */
export async function processOneRulesEngineJob(
  database: R1Database,
  options: RulesEngineWorkerOptions,
  injected: RulesEngineWorkerDependencies = {},
): Promise<RulesEngineWorkerResult> {
  const deps = dependencies(injected);
  const leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(options.leaseOwner) ||
    (options.serviceActorId !== undefined &&
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(options.serviceActorId)) ||
    typeof options.now !== "function" ||
    !Number.isSafeInteger(leaseDurationMs) ||
    leaseDurationMs <= 0 ||
    !Number.isSafeInteger(maxAttempts) ||
    maxAttempts < 1 ||
    (options.retryDelayMs !== undefined &&
      (!Number.isSafeInteger(options.retryDelayMs) || options.retryDelayMs <= 0))
  ) {
    throw new TypeError("Invalid rules-engine worker options");
  }

  const claimNow = freshNow(options);
  const claim = await deps.claim(database, {
    leaseOwner: options.leaseOwner,
    now: claimNow,
    leaseExpiresAt: new Date(claimNow.getTime() + leaseDurationMs),
  });
  if (!claim) return { processed: false, reason: "empty" };
  if ("quarantined" in claim) return { processed: true, status: "failed" };

  const bundle = deps.bundle;
  const rulesetHash = rulesetBundleHash(bundle);
  const evaluationId = deterministicEvaluationId(
    claim.outboxEvent.id,
    claim.submission.rulesetBundleHash,
  );
  const actorId = options.serviceActorId ?? options.leaseOwner;
  let prepared: PreparedEvaluation;
  try {
    deps.assertBundleAllowed(bundle);
    assertImmutableRulesetPin(claim, bundle, rulesetHash);
    prepared = prepareEvaluation(claim.submission, bundle, deps.evaluate);
  } catch (error) {
    if (error instanceof RulesEngineLeaseLostError) {
      return { processed: false, reason: "lease_lost" };
    }
    const safeFailure = asSafeFailure(error);
    if (safeFailure) {
      return failClaimedJob(
        database,
        claim,
        options,
        deps,
        safeFailure,
        bundle,
        rulesetHash,
        evaluationId,
      );
    }
    if (claim.outboxEvent.attemptCount < maxAttempts) {
      return scheduleRetry(database, claim, options, deps);
    }
    return failClaimedJob(
      database,
      claim,
      options,
      deps,
      { evaluationCode: "retry_exhausted", outboxCode: "retry_exhausted" },
      bundle,
      rulesetHash,
      evaluationId,
    );
  }

  try {
    return await database.transaction(async tx => {
      let lease = leaseFor(claim, options);
      const target = await deps.loadLeaseTarget(tx, lease);
      if (!target) throw new RulesEngineLeaseLostError();
      assertClaimMatchesLockedTarget(claim, target, bundle);
      // Re-hash the locked DB value, not the row returned by the earlier claim.
      const lockedPrepared = prepareEvaluation(target.submission, bundle, deps.evaluate);
      if (
        lockedPrepared.outcomeHash !== prepared.outcomeHash ||
        canonicalSerialize(lockedPrepared.outcomeJson) !== canonicalSerialize(prepared.outcomeJson)
      ) {
        throw new SafeRulesEngineFailure({
          evaluationCode: "technical_failure",
          outboxCode: "technical_failure",
        });
      }

      const identity = evaluationIdentity(
        claim,
        evaluationId,
        bundle,
        rulesetHash,
        freshNow(options),
      );
      let evaluation = await deps.findEvaluation(tx, {
        sourceOutboxEventId: claim.outboxEvent.id,
        customerAccountId: claim.submission.customerAccountId,
        diagnosticCaseId: claim.submission.diagnosticCaseId,
        questionnaireSubmissionId: claim.submission.id,
      });
      if (evaluation && !sameIdentity(evaluation, identity)) {
        throw new SafeRulesEngineFailure({
          evaluationCode: "input_inconsistent",
          outboxCode: "persistence_conflict",
        });
      }
      if (evaluation?.status === "failed") {
        throw new SafeRulesEngineFailure({
          evaluationCode: "input_inconsistent",
          outboxCode: "persistence_conflict",
        });
      }
      if (evaluation && evaluation.status !== "pending") {
        if (
          evaluation.status !== lockedPrepared.status ||
          evaluation.outcomeHash !== lockedPrepared.outcomeHash ||
          canonicalSerialize(decodeJson(evaluation.outcomeJson) as CanonicalJsonValue) !==
            canonicalSerialize(lockedPrepared.outcomeJson)
        ) {
          throw new SafeRulesEngineFailure({
            evaluationCode: "input_inconsistent",
            outboxCode: "persistence_conflict",
          });
        }
        lease = leaseFor(claim, options);
        const acknowledged = await deps.acknowledge(tx, lease);
        return acknowledged
          ? { processed: true, status: evaluation.status, evaluationId: evaluation.id } as const
          : { processed: false, reason: "lease_lost" } as const;
      }

      if (!evaluation) {
        lease = leaseFor(claim, options);
        evaluation = await deps.insertEvaluation(tx, lease, identity);
        await deps.appendAudit(tx, {
          actorType: "service",
          actorId,
          aggregateType: "questionnaire_rule_evaluation",
          aggregateId: evaluation.id,
          eventType: "rules_engine.evaluation_started",
          outcome: "succeeded",
          toStatus: "pending",
          correlationId: claim.outboxEvent.eventId,
          privacySafeMetadata: auditMetadata(identity),
          createdAt: freshNow(options),
        });
      }

      if (target.caseStatus === "submitted") {
        const transitionNow = freshNow(options);
        await transitionExact(tx, deps, {
          actorId,
          correlationId: claim.outboxEvent.eventId,
          caseId: identity.diagnosticCaseId,
          customerAccountId: identity.customerAccountId,
          fromStatus: "submitted",
          toStatus: "scoring",
          expectedStateVersion: identity.submittedCaseStateVersion,
          now: transitionNow,
        });
      }
      lease = leaseFor(claim, options);
      const completed = await deps.completeEvaluation(tx, {
        ...lease,
        evaluationId: evaluation.id,
        status: lockedPrepared.status,
        outcomeJson: lockedPrepared.outcomeJson,
        outcomeHash: lockedPrepared.outcomeHash,
      });
      if (!completed) throw new RulesEngineLeaseLostError();

      await deps.appendAudit(tx, {
        actorType: "service",
        actorId,
        aggregateType: "questionnaire_rule_evaluation",
        aggregateId: evaluation.id,
        eventType: "rules_engine.evaluation_completed",
        outcome: "succeeded",
        fromStatus: "pending",
        toStatus: lockedPrepared.status,
        correlationId: claim.outboxEvent.eventId,
        privacySafeMetadata: {
          ...auditMetadata(identity),
          outcomeHash: lockedPrepared.outcomeHash,
          manualReviewRequired: true,
        },
        createdAt: freshNow(options),
      });

      const transitionNow = freshNow(options);
      await transitionExact(tx, deps, {
        actorId,
        correlationId: claim.outboxEvent.eventId,
        caseId: identity.diagnosticCaseId,
        customerAccountId: identity.customerAccountId,
        fromStatus: "scoring",
        toStatus: "manual_review_required",
        expectedStateVersion: identity.submittedCaseStateVersion + 1,
        now: transitionNow,
      });
      lease = leaseFor(claim, options);
      const acknowledged = await deps.acknowledge(tx, lease);
      if (!acknowledged) throw new RulesEngineLeaseLostError();
      return {
        processed: true,
        status: lockedPrepared.status,
        evaluationId: evaluation.id,
      } as const;
    });
  } catch (error) {
    if (error instanceof RulesEngineLeaseLostError) {
      return { processed: false, reason: "lease_lost" };
    }
    const safeFailure = asSafeFailure(error);
    if (safeFailure) {
      return failClaimedJob(
        database,
        claim,
        options,
        deps,
        safeFailure,
        bundle,
        rulesetHash,
        evaluationId,
      );
    }
    if (claim.outboxEvent.attemptCount < maxAttempts) {
      return scheduleRetry(database, claim, options, deps);
    }
    return failClaimedJob(
      database,
      claim,
      options,
      deps,
      { evaluationCode: "retry_exhausted", outboxCode: "retry_exhausted" },
      bundle,
      rulesetHash,
      evaluationId,
    );
  }
}
