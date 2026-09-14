import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  accessGrants,
  auditEvents,
  diagnosticCases,
  outboxEvents,
  paymentRecords,
  questionnaireDrafts,
  questionnaireRuleEvaluations,
  questionnaireSubmissions,
  tariffSnapshots,
} from "../../../drizzle/schema";
import { technicalQuestionnaireBundle } from "../questionnaire/configBundle";
import {
  saveQuestionnaireAnswer,
  submitQuestionnaire,
  type SaveQuestionnaireAnswerInput,
  type SubmitQuestionnaireInput,
} from "../questionnaire/questionnaireService";
import type { QuestionnaireAnswerInputDto } from "../../../shared/r1/questionnaire";
import { technicalLegalCoreConfigBundle } from "../scoring/core";
import {
  processOneRulesEngineJob,
  rulesetBundleHash,
} from "../scoring/rulesEngineWorker";
import {
  appendOutboxEvent,
  OutboxDedupeConflictError,
} from "../outbox/outboxRepository";
import {
  ACCOUNT_A,
  CASE_A,
  PUBLIC_A,
  RUN_PREFIX,
  SESSION_A,
  cleanRunData,
  db,
  seedOwners,
} from "./r1DbHarness";

const SUBMITTED_AT = new Date("2027-03-01T12:00:00.000Z");
const REPLAY_AT = new Date("2027-03-01T12:02:00.000Z");
const RAW_ANSWER = "PRIVATE_RULES_ENGINE_ANSWER";
const CORRUPT_HASH = "0".repeat(64);
const requestId = (label: string) => `${RUN_PREFIX}_${label}_request`;
const mutationId = (label: string) => `${RUN_PREFIX}_${label}_mutation`;

function decodeDbJson(value: unknown): unknown {
  return typeof value === "string" ? JSON.parse(value) as unknown : value;
}

function answerFor(questionId: string): QuestionnaireAnswerInputDto {
  const question = technicalQuestionnaireBundle.questionById[questionId]!;
  if (question.type === "text") return { kind: "text", text: RAW_ANSWER };
  if (questionId === "b1_q3") return { kind: "multi", optionIds: ["b2b_small"] };
  if (question.type === "single") return { kind: "single", optionId: question.options[0]!.id };
  if (question.type === "multi") return { kind: "multi", optionIds: [question.options[0]!.id] };
  throw new Error(`Unsupported questionnaire question ${questionId}`);
}

async function grantActiveAccess(label: string): Promise<void> {
  const database = await db();
  const tariffId = `${RUN_PREFIX}_rules_tariff_${label}`;
  const paymentId = `${RUN_PREFIX}_rules_payment_${label}`;
  await database.insert(tariffSnapshots).values({
    id: tariffId,
    tariffCode: "base_diagnostic",
    serviceTier: "base_diagnostic",
    provenanceStatus: "draft_test_only",
    catalogVersion: "r1-test",
    currency: "RUB",
    createdAt: SUBMITTED_AT,
  });
  await database.insert(paymentRecords).values({
    id: paymentId,
    customerAccountId: ACCOUNT_A,
    diagnosticCaseId: CASE_A,
    tariffSnapshotId: tariffId,
    tariffCode: "base_diagnostic",
    campaignId: "rules_engine_test",
    sourceType: "promo",
    status: "promo_granted",
    chargedAmount: 0,
    currency: "RUB",
    correlationId: `${RUN_PREFIX}_rules_correlation_${label}`,
    grantedAt: SUBMITTED_AT,
    createdAt: SUBMITTED_AT,
  });
  await database.insert(accessGrants).values({
    id: `${RUN_PREFIX}_rules_grant_${label}`,
    customerAccountId: ACCOUNT_A,
    diagnosticCaseId: CASE_A,
    paymentRecordId: paymentId,
    status: "active",
    grantedAt: SUBMITTED_AT,
    expiresAt: null,
    revokedAt: null,
    revocationReasonCode: null,
    createdAt: SUBMITTED_AT,
    updatedAt: SUBMITTED_AT,
  });
  await database.update(diagnosticCases).set({
    status: "access_granted",
    stateVersion: 2,
    updatedAt: SUBMITTED_AT,
  }).where(and(
    eq(diagnosticCases.id, CASE_A),
    eq(diagnosticCases.customerAccountId, ACCOUNT_A),
  ));
}

async function submitRealQuestionnaire(label: string) {
  let draftRevision = 0;
  for (const questionId of technicalQuestionnaireBundle.activeCoreQuestionIds) {
    const input: SaveQuestionnaireAnswerInput = {
      customerAccountId: ACCOUNT_A,
      customerSessionId: SESSION_A,
      requestId: requestId(`${label}_fill_${draftRevision}`),
      publicId: PUBLIC_A,
      questionId,
      value: answerFor(questionId),
      clientMutationId: mutationId(`${label}_fill_${draftRevision}`),
      expectedDraftRevision: draftRevision,
      now: SUBMITTED_AT,
    };
    const result = await saveQuestionnaireAnswer(input);
    expect(result.outcome).toBe("saved");
    draftRevision += 1;
  }

  const submitInput: SubmitQuestionnaireInput = {
    customerAccountId: ACCOUNT_A,
    customerSessionId: SESSION_A,
    requestId: requestId(`${label}_submit`),
    publicId: PUBLIC_A,
    idempotencyKey: mutationId(`${label}_submit`),
    now: SUBMITTED_AT,
  };
  const receipt = await submitQuestionnaire(submitInput);
  const database = await db();
  const submissions = await database.select().from(questionnaireSubmissions).where(
    and(
      eq(questionnaireSubmissions.customerAccountId, ACCOUNT_A),
      eq(questionnaireSubmissions.diagnosticCaseId, CASE_A),
    ),
  );
  expect(submissions).toHaveLength(1);
  const sourceEvents = await database.select().from(outboxEvents).where(
    and(
      eq(outboxEvents.aggregateId, submissions[0]!.id),
      eq(outboxEvents.eventType, "questionnaire.submitted_for_scoring"),
    ),
  );
  expect(sourceEvents).toHaveLength(1);
  return { draftRevision, receipt, submitInput, submission: submissions[0]!, sourceEvent: sourceEvents[0]! };
}

async function workerArtifacts(submissionId: string) {
  const database = await db();
  const [cases, drafts, submissions, evaluations, sourceEvents, audits, outboxes] = await Promise.all([
    database.select().from(diagnosticCases).where(eq(diagnosticCases.id, CASE_A)),
    database.select().from(questionnaireDrafts).where(eq(questionnaireDrafts.diagnosticCaseId, CASE_A)),
    database.select().from(questionnaireSubmissions).where(eq(questionnaireSubmissions.id, submissionId)),
    database.select().from(questionnaireRuleEvaluations).where(
      eq(questionnaireRuleEvaluations.questionnaireSubmissionId, submissionId),
    ),
    database.select().from(outboxEvents).where(
      and(
        eq(outboxEvents.aggregateId, submissionId),
        eq(outboxEvents.eventType, "questionnaire.submitted_for_scoring"),
      ),
    ),
    database.select().from(auditEvents),
    database.select().from(outboxEvents),
  ]);
  const relevantAggregateIds = new Set([
    CASE_A,
    submissionId,
    ...drafts.map(row => row.id),
    ...evaluations.map(row => row.id),
  ]);
  return {
    case: cases[0]!,
    submission: submissions[0]!,
    evaluations: evaluations.map(row => ({ ...row, outcomeJson: decodeDbJson(row.outcomeJson) })),
    sourceEvent: sourceEvents[0]!,
    audits: audits
      .filter(row => relevantAggregateIds.has(row.aggregateId))
      .map(row => ({ ...row, privacySafeMetadata: decodeDbJson(row.privacySafeMetadata) })),
    outboxes: outboxes
      .filter(row => relevantAggregateIds.has(row.aggregateId))
      .map(row => ({ ...row, privacySafePayload: decodeDbJson(row.privacySafePayload) })),
  };
}

function expectPrivacySafeMetadata(
  artifacts: Awaited<ReturnType<typeof workerArtifacts>>,
  resultText?: string,
): void {
  const metadata = JSON.stringify({
    audits: artifacts.audits.map(row => row.privacySafeMetadata),
    outboxes: artifacts.outboxes.map(row => row.privacySafePayload),
  });
  expect(metadata).not.toContain(RAW_ANSWER);
  expect(metadata).not.toContain("activeAnswers");
  expect(metadata).not.toContain("canonicalAnswers");
  expect(metadata).not.toContain("inputSnapshotJson");
  expect(metadata).not.toContain("outcomeJson");
  expect(metadata).not.toContain("recommendation");
  if (resultText) expect(metadata).not.toContain(resultText);
}

async function workerAuditCounts(evaluationId: string) {
  const database = await db();
  const audits = await database.select().from(auditEvents);
  return {
    evaluation: audits.filter(row =>
      row.aggregateId === evaluationId && row.eventType.startsWith("rules_engine.evaluation_")
    ).length,
    workerTransitions: audits.filter(row =>
      row.aggregateId === CASE_A &&
      row.eventType === "diagnostic_case.status_changed" &&
      (row.toStatus === "scoring" || row.toStatus === "manual_review_required")
    ).length,
  };
}

describe("Rules Engine worker real DB runtime", () => {
  beforeEach(async () => {
    await cleanRunData();
    await seedOwners();
    await grantActiveAccess("a");
  });

  afterAll(async () => {
    await cleanRunData();
  });

  it("persists one pinned evaluation, publishes safely, and reclaims an exact completed replay without duplicate effects", async () => {
    const seeded = await submitRealQuestionnaire("success");
    expect(seeded.receipt).toMatchObject({
      outcome: "saved",
      receipt: { status: "submitted", draftRevision: seeded.draftRevision },
    });
    expect(JSON.stringify(seeded.receipt)).not.toContain("recommendation");
    expect(JSON.stringify(seeded.receipt)).not.toContain("ruleset");

    const database = await db();
    await expect(processOneRulesEngineJob(database, {
      leaseOwner: "rules_engine_worker_a",
      serviceActorId: "rules_engine_service",
      now: () => SUBMITTED_AT,
    })).resolves.toMatchObject({ processed: true, status: "manual_review_required" });

    const completed = await workerArtifacts(seeded.submission.id);
    expect(completed.evaluations).toHaveLength(1);
    const evaluation = completed.evaluations[0]!;
    expect(evaluation).toMatchObject({
      customerAccountId: ACCOUNT_A,
      diagnosticCaseId: CASE_A,
      questionnaireSubmissionId: seeded.submission.id,
      sourceOutboxEventId: seeded.sourceEvent.id,
      submittedCaseStateVersion: 4,
      rulesetId: technicalLegalCoreConfigBundle.rules.rulesetId,
      rulesetVersion: technicalLegalCoreConfigBundle.version,
      rulesetHash: rulesetBundleHash(technicalLegalCoreConfigBundle),
      inputSnapshotHash: seeded.submission.inputSnapshotHash,
      status: "manual_review_required",
      manualReviewRequired: true,
      failureCode: null,
    });
    expect(evaluation.outcomeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(evaluation.outcomeJson).toMatchObject({
      kind: "evaluated",
      configuration: {
        rulesetId: technicalLegalCoreConfigBundle.rules.rulesetId,
        contentHashes: technicalLegalCoreConfigBundle.contentHashes,
      },
    });
    expect(completed.sourceEvent).toMatchObject({
      status: "published",
      attemptCount: 1,
      leaseVersion: 1,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastErrorCode: null,
    });
    expect(completed.sourceEvent.publishedAt).not.toBeNull();
    expect(completed.case).toMatchObject({ status: "manual_review_required", stateVersion: 6 });

    const productCode = (evaluation.outcomeJson as {
      recommendation?: { productCode?: string };
    }).recommendation?.productCode;
    expect(productCode).toBeTruthy();
    expectPrivacySafeMetadata(completed, productCode);

    const replayReceipt = await submitQuestionnaire({ ...seeded.submitInput, now: REPLAY_AT });
    expect(replayReceipt).toEqual(seeded.receipt);
    expect(JSON.stringify(replayReceipt)).not.toContain(productCode);
    expect(JSON.stringify(replayReceipt)).not.toContain("evaluation");

    const countsBeforeReplay = await workerAuditCounts(evaluation.id);
    expect(countsBeforeReplay).toEqual({ evaluation: 2, workerTransitions: 2 });

    // Model an at-least-once redelivery whose prior lease expired after the
    // completed transaction became durable. The real claim path must reclaim it.
    await database.update(outboxEvents).set({
      status: "processing",
      leaseOwner: "expired_rules_worker",
      leaseExpiresAt: new Date(REPLAY_AT.getTime() - 1_000),
      publishedAt: null,
      updatedAt: new Date(REPLAY_AT.getTime() - 1_000),
    }).where(eq(outboxEvents.id, seeded.sourceEvent.id));

    await expect(processOneRulesEngineJob(database, {
      leaseOwner: "rules_engine_worker_replay",
      serviceActorId: "rules_engine_service",
      now: () => REPLAY_AT,
    })).resolves.toEqual({
      processed: true,
      status: "manual_review_required",
      evaluationId: evaluation.id,
    });

    const replayed = await workerArtifacts(seeded.submission.id);
    expect(replayed.evaluations).toHaveLength(1);
    expect(replayed.evaluations[0]).toEqual(evaluation);
    expect(replayed.case).toMatchObject({ status: "manual_review_required", stateVersion: 6 });
    expect(replayed.sourceEvent).toMatchObject({
      status: "published",
      attemptCount: 2,
      leaseVersion: 2,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastErrorCode: null,
    });
    expect(await workerAuditCounts(evaluation.id)).toEqual(countsBeforeReplay);
    expectPrivacySafeMetadata(replayed, productCode);
  }, 30_000);

  it("fails closed when the stored input snapshot hash is corrupt and exposes only safe codes", async () => {
    const seeded = await submitRealQuestionnaire("corrupt");
    const database = await db();
    await database.update(questionnaireSubmissions).set({
      inputSnapshotHash: CORRUPT_HASH,
    }).where(eq(questionnaireSubmissions.id, seeded.submission.id));

    await expect(processOneRulesEngineJob(database, {
      leaseOwner: "rules_engine_worker_corrupt",
      serviceActorId: "rules_engine_service",
      now: () => SUBMITTED_AT,
    })).resolves.toMatchObject({ processed: true, status: "failed" });

    const failed = await workerArtifacts(seeded.submission.id);
    expect(failed.evaluations).toHaveLength(1);
    expect(failed.evaluations[0]).toMatchObject({
      sourceOutboxEventId: seeded.sourceEvent.id,
      inputSnapshotHash: CORRUPT_HASH,
      status: "failed",
      outcomeJson: null,
      outcomeHash: null,
      manualReviewRequired: false,
      failureCode: "input_inconsistent",
    });
    expect(failed.sourceEvent).toMatchObject({
      status: "failed",
      attemptCount: 1,
      leaseVersion: 1,
      leaseOwner: null,
      leaseExpiresAt: null,
      publishedAt: null,
      lastErrorCode: "input_inconsistent",
    });
    expect(failed.case).toMatchObject({ status: "failed", stateVersion: 5 });

    const failureAudits = failed.audits.filter(row =>
      row.aggregateId === failed.evaluations[0]!.id ||
      (row.aggregateId === CASE_A && row.toStatus === "failed")
    );
    expect(failureAudits.map(row => row.reasonCode).filter(Boolean).sort()).toEqual([
      "input_inconsistent",
      "system_failure",
    ]);
    expectPrivacySafeMetadata(failed);
    const serializedFailureSurfaces = JSON.stringify({
      evaluationFailureCode: failed.evaluations[0]!.failureCode,
      outboxErrorCode: failed.sourceEvent.lastErrorCode,
      auditReasonCodes: failureAudits.map(row => row.reasonCode),
    });
    expect(serializedFailureSurfaces).not.toContain(RAW_ANSWER);
    expect(serializedFailureSurfaces).not.toContain("hash mismatch");
  }, 30_000);

  it("quarantines an older malformed scoring event and leaves the next valid submission claimable", async () => {
    const seeded = await submitRealQuestionnaire("poison_then_valid");
    const database = await db();
    const poisonId = `${RUN_PREFIX}_rules_poison_outbox`;
    const poisonCreatedAt = new Date(SUBMITTED_AT.getTime() - 1_000);
    await database.insert(outboxEvents).values({
      id: poisonId,
      eventId: `${RUN_PREFIX}_rules_poison_event`,
      dedupeKey: `${RUN_PREFIX}_rules_poison_dedupe`,
      aggregateType: "questionnaire_submission",
      aggregateId: `${RUN_PREFIX}_missing_submission`,
      eventType: "questionnaire.submitted_for_scoring",
      privacySafePayload: { malformed: true } as never,
      status: "pending",
      attemptCount: 0,
      leaseVersion: 0,
      createdAt: poisonCreatedAt,
      updatedAt: poisonCreatedAt,
    });

    await expect(processOneRulesEngineJob(database, {
      leaseOwner: "rules_engine_worker_poison",
      serviceActorId: "rules_engine_service",
      now: () => SUBMITTED_AT,
    })).resolves.toEqual({ processed: true, status: "failed" });

    const poisonedRows = await database.select().from(outboxEvents).where(eq(outboxEvents.id, poisonId));
    expect(poisonedRows).toHaveLength(1);
    expect(poisonedRows[0]).toMatchObject({
      status: "failed",
      attemptCount: 1,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastErrorCode: "input_inconsistent",
    });
    expect(JSON.stringify(poisonedRows[0])).not.toContain("PRIVATE_RULES_ENGINE_ANSWER");

    await expect(processOneRulesEngineJob(database, {
      leaseOwner: "rules_engine_worker_after_poison",
      serviceActorId: "rules_engine_service",
      now: () => SUBMITTED_AT,
    })).resolves.toMatchObject({ processed: true, status: "manual_review_required" });
    const valid = await workerArtifacts(seeded.submission.id);
    expect(valid.evaluations).toHaveLength(1);
    expect(valid.sourceEvent.status).toBe("published");
  }, 30_000);

  it("allows only identical scoring dedupe while ordinary outbox collisions still reject", async () => {
    const seeded = await submitRealQuestionnaire("dedupe");
    const database = await db();
    const scoringEvent = {
      aggregateType: "questionnaire_submission" as const,
      aggregateId: seeded.submission.id,
      eventType: "questionnaire.submitted_for_scoring" as const,
      privacySafePayload: {
        caseId: CASE_A,
        submissionId: seeded.submission.id,
        submissionVersion: 1 as const,
        inputSnapshotHash: seeded.submission.inputSnapshotHash,
        submittedCaseStateVersion: 4,
        legalCoreReleaseId: seeded.submission.legalCoreReleaseId,
        legalCoreVersion: seeded.submission.legalCoreVersion,
        rulesetId: seeded.submission.rulesetId,
        rulesetBundleHash: seeded.submission.rulesetBundleHash,
        test: true as const,
      },
      createdAt: SUBMITTED_AT,
    };

    await database.transaction(tx => appendOutboxEvent(tx, scoringEvent));
    const afterExactReplay = await database.select().from(outboxEvents).where(
      eq(outboxEvents.dedupeKey, `questionnaire-submission:${seeded.submission.id}:v1`),
    );
    expect(afterExactReplay).toHaveLength(1);

    await expect(database.transaction(tx => appendOutboxEvent(tx, {
      ...scoringEvent,
      privacySafePayload: { ...scoringEvent.privacySafePayload, inputSnapshotHash: "0".repeat(64) },
    }))).rejects.toBeInstanceOf(OutboxDedupeConflictError);

    const ordinaryCollision = {
      aggregateType: "diagnostic_case" as const,
      aggregateId: CASE_A,
      eventType: "diagnostic_case.status_changed" as const,
      privacySafePayload: {
        caseId: CASE_A,
        stateVersion: 4,
        status: "submitted" as const,
      },
      createdAt: SUBMITTED_AT,
    };
    await expect(database.transaction(tx => appendOutboxEvent(tx, ordinaryCollision))).rejects.toBeTruthy();
  }, 30_000);
});
