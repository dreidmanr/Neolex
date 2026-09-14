import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  OutboxEvent,
  QuestionnaireRuleEvaluation,
  QuestionnaireSubmission,
} from "../../../drizzle/schema";
import { buildQuestionnaireSnapshot } from "../questionnaire/canonicalSnapshot";
import { technicalQuestionnaireBundle } from "../questionnaire/configBundle";
import { deriveQuestionnaireState } from "../questionnaire/visibility";
import { canonicalSerialize, sha256Hex } from "../questionnaire/canonicalJson";
import {
  evaluateTechnicalLegalCore,
  technicalLegalCoreConfigBundle,
} from "./core";
import {
  processOneRulesEngineJob,
  rulesetBundleHash,
  type RulesEngineWorkerDependencies,
} from "./rulesEngineWorker";

const NOW = new Date("2026-09-14T12:00:00.000Z");
const ACCOUNT_ID = "account_rules_worker_01";
const CASE_ID = "case_rules_worker_01";
const SUBMISSION_ID = "submission_rules_worker_01";
const OUTBOX_ID = "outbox_rules_worker_01";
const EVENT_ID = "event_rules_worker_01";
const DRAFT_ID = "draft_rules_worker_01";
const LEASE_OWNER = "rules_worker_01";
const SUBMITTED_VERSION = 4;
const TX = { marker: "rules-engine-transaction" };

function fixtureAnswers(file: string): Record<string, string | readonly string[]> {
  const parsed = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "fixtures/legal-core/v1", file), "utf8"),
  ) as { canonicalAnswers: Record<string, string | readonly string[]> };
  return parsed.canonicalAnswers;
}

function canonicalAnswers(values: Record<string, string | readonly string[]>) {
  const answers: Record<string, { kind: "single"; optionId: string } |
    { kind: "multi"; optionIds: readonly string[] } |
    { kind: "text"; text: string }> = {};
  for (const [questionId, value] of Object.entries(values)) {
    const question = technicalQuestionnaireBundle.questionById[questionId]!;
    answers[questionId] = question.type === "text"
      ? { kind: "text", text: value as string }
      : question.type === "multi"
        ? { kind: "multi", optionIds: value as readonly string[] }
        : { kind: "single", optionId: value as string };
  }
  return answers;
}

function submission(file = "01-clean-b2b-saas.json"): QuestionnaireSubmission {
  const answers = canonicalAnswers(fixtureAnswers(file));
  const state = deriveQuestionnaireState(technicalQuestionnaireBundle, answers);
  const snapshot = buildQuestionnaireSnapshot(
    technicalQuestionnaireBundle,
    state,
    answers,
    33,
  );
  return {
    id: SUBMISSION_ID,
    customerAccountId: ACCOUNT_ID,
    diagnosticCaseId: CASE_ID,
    questionnaireDraftId: DRAFT_ID,
    submissionVersion: 1,
    questionnaireReleaseId: technicalQuestionnaireBundle.releaseId,
    questionnaireVersion: technicalQuestionnaireBundle.version,
    questionnaireContentHash: technicalQuestionnaireBundle.contentHash,
    legalCoreReleaseId: technicalLegalCoreConfigBundle.releaseId,
    legalCoreVersion: technicalLegalCoreConfigBundle.version,
    rulesetId: technicalLegalCoreConfigBundle.rules.rulesetId,
    rulesetBundleHash: rulesetBundleHash(technicalLegalCoreConfigBundle),
    visibleQuestionIds: [...snapshot.visibleQuestionIds],
    visibleSetHash: snapshot.visibleSetHash,
    manualFollowUpRequired: state.manualFollowUpRequired,
    manualFollowUpTriggerIds: [...snapshot.manualFollowUpTriggerIds],
    inputSnapshotJson: JSON.parse(snapshot.snapshotJson),
    inputSnapshotHash: snapshot.inputSnapshotHash,
    submittedAt: NOW,
    createdAt: NOW,
  };
}

function outbox(rowSubmission: QuestionnaireSubmission, attemptCount = 1): OutboxEvent {
  return {
    id: OUTBOX_ID,
    eventId: EVENT_ID,
    dedupeKey: `questionnaire-submission:${SUBMISSION_ID}:v1`,
    aggregateType: "questionnaire_submission",
    aggregateId: SUBMISSION_ID,
    eventType: "questionnaire.submitted_for_scoring",
    privacySafePayload: {
      caseId: CASE_ID,
      submissionId: SUBMISSION_ID,
      submissionVersion: 1,
      inputSnapshotHash: rowSubmission.inputSnapshotHash,
      submittedCaseStateVersion: SUBMITTED_VERSION,
      legalCoreReleaseId: rowSubmission.legalCoreReleaseId,
      legalCoreVersion: rowSubmission.legalCoreVersion,
      rulesetId: rowSubmission.rulesetId,
      rulesetBundleHash: rowSubmission.rulesetBundleHash,
      test: true,
    },
    status: "processing",
    attemptCount,
    leaseOwner: LEASE_OWNER,
    leaseVersion: 1,
    leaseExpiresAt: new Date(NOW.getTime() + 60_000),
    nextAttemptAt: null,
    lastAttemptAt: NOW,
    publishedAt: null,
    lastErrorCode: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function evaluationFromInsert(value: Record<string, unknown>): QuestionnaireRuleEvaluation {
  return value as unknown as QuestionnaireRuleEvaluation;
}

function harness(input: {
  rowSubmission?: QuestionnaireSubmission;
  caseStatus?: "submitted" | "scoring" | "manual_review_required";
  caseStateVersion?: number;
  existingEvaluation?: QuestionnaireRuleEvaluation | null;
  attemptCount?: number;
  evaluate?: RulesEngineWorkerDependencies["evaluate"];
} = {}) {
  const rowSubmission = input.rowSubmission ?? submission();
  const outboxEvent = outbox(rowSubmission, input.attemptCount);
  const claim = {
    outboxEvent,
    submission: rowSubmission,
    event: {
      aggregateType: "questionnaire_submission" as const,
      aggregateId: SUBMISSION_ID,
      eventType: "questionnaire.submitted_for_scoring" as const,
      privacySafePayload: outboxEvent.privacySafePayload as {
        caseId: string;
        submissionId: string;
        submissionVersion: 1;
        inputSnapshotHash: string;
        submittedCaseStateVersion: number;
        legalCoreReleaseId: string;
        legalCoreVersion: string;
        rulesetId: string;
        rulesetBundleHash: string;
        test: true;
      },
      createdAt: NOW,
    },
  };
  const transaction = vi.fn(async callback => callback(TX));
  const mocks = {
    claim: vi.fn().mockResolvedValue(claim),
    assertBundleAllowed: vi.fn(),
    evaluate: vi.fn(input.evaluate ?? evaluateTechnicalLegalCore),
    loadLeaseTarget: vi.fn().mockResolvedValue({
      outboxEvent,
      submission: rowSubmission,
      caseStatus: input.caseStatus ?? "submitted",
      caseStateVersion: input.caseStateVersion ?? SUBMITTED_VERSION,
    }),
    findEvaluation: vi.fn().mockResolvedValue(input.existingEvaluation ?? null),
    insertEvaluation: vi.fn(async (_tx, _lease, value) => evaluationFromInsert(value)),
    completeEvaluation: vi.fn().mockResolvedValue(true),
    failEvaluation: vi.fn().mockResolvedValue(true),
    compareAndSwapStatus: vi.fn().mockResolvedValue(true),
    appendAudit: vi.fn().mockResolvedValue(undefined),
    acknowledge: vi.fn().mockResolvedValue(true),
    failEvent: vi.fn().mockResolvedValue(true),
    retryEvent: vi.fn().mockResolvedValue(true),
  };
  const dependencies: RulesEngineWorkerDependencies = {
    ...mocks,
    bundle: technicalLegalCoreConfigBundle,
  };
  return { database: { transaction } as any, mocks, claim, dependencies };
}

function pendingEvaluation(rowSubmission: QuestionnaireSubmission): QuestionnaireRuleEvaluation {
  return {
    id: `ruleeval_${"1".repeat(40)}`,
    customerAccountId: ACCOUNT_ID,
    diagnosticCaseId: CASE_ID,
    questionnaireSubmissionId: SUBMISSION_ID,
    sourceOutboxEventId: OUTBOX_ID,
    submittedCaseStateVersion: SUBMITTED_VERSION,
    rulesetId: technicalLegalCoreConfigBundle.rules.rulesetId,
    rulesetVersion: technicalLegalCoreConfigBundle.version,
    rulesetHash: rulesetBundleHash(technicalLegalCoreConfigBundle),
    inputSnapshotHash: rowSubmission.inputSnapshotHash,
    status: "pending",
    outcomeJson: null,
    outcomeHash: null,
    manualReviewRequired: false,
    failureCode: null,
    startedAt: NOW,
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const OPTIONS = { leaseOwner: LEASE_OWNER, now: () => NOW, serviceActorId: "rules_engine_service" };

describe("processOneRulesEngineJob", () => {
  beforeEach(() => vi.clearAllMocks());

  it("atomically evaluates immutable answers and moves submitted -> scoring -> manual review", async () => {
    const { database, mocks, dependencies } = harness();

    await expect(processOneRulesEngineJob(database, OPTIONS, dependencies)).resolves.toMatchObject({
      processed: true,
      status: "manual_review_required",
    });

    expect(mocks.evaluate).toHaveBeenCalledTimes(2);
    expect(mocks.insertEvaluation).toHaveBeenCalledOnce();
    expect(mocks.completeEvaluation).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        status: "manual_review_required",
        outcomeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    const outcome = mocks.completeEvaluation.mock.calls[0]![1].outcomeJson;
    expect(outcome).toMatchObject({
      kind: "evaluated",
      configuration: {
        rulesetId: "rules_v1",
        mappingId: "recommendation_mapping_v1",
        contentHashes: technicalLegalCoreConfigBundle.contentHashes,
      },
    });
    expect(mocks.compareAndSwapStatus.mock.calls.map(call => call[1])).toMatchObject([
      { fromStatus: "submitted", toStatus: "scoring", expectedStateVersion: 4 },
      { fromStatus: "scoring", toStatus: "manual_review_required", expectedStateVersion: 5 },
    ]);
    expect(mocks.acknowledge).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ leaseOwner: LEASE_OWNER, leaseVersion: 1, now: NOW }),
    );
    const serializedAudits = JSON.stringify(mocks.appendAudit.mock.calls);
    expect(serializedAudits).not.toContain("Эталонный цифровой продукт");
    expect(serializedAudits).not.toContain("canonicalAnswers");
  });

  it("stores validation-only outcome with recommendation null and never emits a report", async () => {
    const rowSubmission = submission("12-incomplete-questionnaire.json");
    const { database, mocks, dependencies } = harness({ rowSubmission });

    await expect(processOneRulesEngineJob(database, OPTIONS, dependencies)).resolves.toMatchObject({
      processed: true,
      status: "manual_review_required",
    });
    const persisted = mocks.completeEvaluation.mock.calls[0]![1];
    expect(persisted.outcomeJson).toMatchObject({
      kind: "validation",
      validation: { valid: false, blocksRecommendation: true },
      recommendation: null,
    });
    expect(JSON.stringify(persisted.outcomeJson)).not.toContain("report");
  });

  it("fails closed on immutable snapshot hash mismatch using only safe failure codes", async () => {
    const valid = submission();
    const rowSubmission = { ...valid, inputSnapshotHash: "0".repeat(64) };
    const { database, mocks, dependencies } = harness({ rowSubmission });

    await expect(processOneRulesEngineJob(database, OPTIONS, dependencies)).resolves.toMatchObject({
      processed: true,
      status: "failed",
    });
    expect(mocks.completeEvaluation).not.toHaveBeenCalled();
    expect(mocks.failEvaluation).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ failureCode: "input_inconsistent" }),
    );
    expect(mocks.failEvent).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ errorCode: "input_inconsistent" }),
    );
    expect(mocks.compareAndSwapStatus).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ fromStatus: "submitted", toStatus: "failed", expectedStateVersion: 4 }),
    );
    expect(JSON.stringify(mocks.appendAudit.mock.calls)).not.toContain("Эталонный цифровой продукт");
  });

  it("terminally rejects a pinned ruleset bundle mismatch before evaluation", async () => {
    const rowSubmission = { ...submission(), rulesetBundleHash: "0".repeat(64) };
    const { database, mocks, dependencies } = harness({ rowSubmission });

    await expect(processOneRulesEngineJob(database, OPTIONS, dependencies)).resolves.toMatchObject({
      processed: true,
      status: "failed",
    });
    expect(mocks.evaluate).not.toHaveBeenCalled();
    expect(mocks.failEvaluation).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ failureCode: "configuration_invalid" }),
    );
    expect(mocks.failEvent).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ errorCode: "configuration_unavailable" }),
    );
  });

  it("acknowledges an exact completed evaluation replay without recreating side effects", async () => {
    const rowSubmission = submission();
    const expectedOutcome = evaluateTechnicalLegalCore({
      canonicalAnswers: (rowSubmission.inputSnapshotJson as any).activeAnswers,
      previousVisibleQuestionIds: rowSubmission.visibleQuestionIds as string[],
    });
    const outcomeJson = JSON.parse(canonicalSerialize(expectedOutcome as any));
    const existing = {
      ...pendingEvaluation(rowSubmission),
      status: "manual_review_required" as const,
      outcomeJson,
      outcomeHash: sha256Hex(canonicalSerialize(outcomeJson)),
      manualReviewRequired: true,
      completedAt: NOW,
    };
    const { database, mocks, dependencies } = harness({
      rowSubmission,
      caseStatus: "manual_review_required",
      caseStateVersion: SUBMITTED_VERSION + 2,
      existingEvaluation: existing,
    });

    await expect(processOneRulesEngineJob(database, OPTIONS, dependencies)).resolves.toMatchObject({
      processed: true,
      status: "manual_review_required",
      evaluationId: existing.id,
    });
    expect(mocks.insertEvaluation).not.toHaveBeenCalled();
    expect(mocks.completeEvaluation).not.toHaveBeenCalled();
    expect(mocks.compareAndSwapStatus).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.acknowledge).toHaveBeenCalledOnce();
  });

  it("returns lease_lost and does not write when the fenced reload is absent", async () => {
    const { database, mocks, dependencies } = harness();
    mocks.loadLeaseTarget.mockResolvedValue(null);

    await expect(processOneRulesEngineJob(database, OPTIONS, dependencies)).resolves.toEqual({
      processed: false,
      reason: "lease_lost",
    });
    expect(mocks.insertEvaluation).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.acknowledge).not.toHaveBeenCalled();
  });

  it("uses a fresh clock for terminal fencing and refuses completion after lease expiry", async () => {
    const { database, mocks, dependencies } = harness();
    const expired = new Date(NOW.getTime() + 60_001);
    let call = 0;
    mocks.completeEvaluation.mockImplementation(async (_tx, input) =>
      input.now.getTime() < NOW.getTime() + 60_000
    );

    await expect(processOneRulesEngineJob(database, {
      ...OPTIONS,
      now: () => call++ < 6 ? NOW : expired,
    }, dependencies)).resolves.toEqual({ processed: false, reason: "lease_lost" });
    expect(mocks.completeEvaluation).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ now: expired }),
    );
    expect(mocks.acknowledge).not.toHaveBeenCalled();
  });

  it("rejects an invalid service actor before claiming", async () => {
    const { database, mocks, dependencies } = harness();
    await expect(processOneRulesEngineJob(database, {
      ...OPTIONS,
      serviceActorId: "invalid actor",
    }, dependencies)).rejects.toThrow(TypeError);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("retries an unexpected transient error before the bounded attempt limit", async () => {
    const { database, mocks, dependencies } = harness({
      evaluate: (() => { throw new Error("transient internal detail"); }) as any,
      attemptCount: 1,
    });

    await expect(processOneRulesEngineJob(
      database,
      { ...OPTIONS, maxAttempts: 3, retryDelayMs: 7_000 },
      dependencies,
    )).resolves.toEqual({ processed: true, status: "retry_scheduled" });
    expect(mocks.retryEvent).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        errorCode: "technical_failure",
        nextAttemptAt: new Date(NOW.getTime() + 7_000),
      }),
    );
    expect(JSON.stringify(mocks.retryEvent.mock.calls)).not.toContain("transient internal detail");
    expect(mocks.insertEvaluation).not.toHaveBeenCalled();
  });
});
