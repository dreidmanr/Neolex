import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  accessGrants,
  auditEvents,
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
} from "../../../drizzle/schema";
import type { QuestionnaireAnswerInputDto } from "../../../shared/r1/questionnaire";
import { TARIFF_CATALOG_VERSION } from "../billing/tariffService";
import { getDocumentRegistryForValidation } from "../legal/documentRegistry";
import {
  canonicalSha256,
  type CanonicalJsonValue,
} from "../questionnaire/canonicalJson";
import { technicalQuestionnaireBundle } from "../questionnaire/configBundle";
import {
  saveQuestionnaireAnswer,
  submitQuestionnaire,
  type SaveQuestionnaireAnswerInput,
} from "../questionnaire/questionnaireService";
import { deriveReportViewModel } from "../reports/reportViewModel";
import {
  initializeReportForCompletedEvaluation,
  type CompletedEvaluationClaim,
} from "../reports/reportGenerationService";
import {
  claimOneReportSnapshot,
  completeReportSnapshot,
  failReportSnapshot,
  loadReadyReportSnapshotByPublicCase,
  loadReportSnapshot,
  supersedeReadyReportSnapshot,
} from "../reports/reportSnapshotRepository";
import { validateReportSchema } from "../reports/reportSchemaValidator";
import type { ValidatedReportSnapshot } from "../reports/types";
import { processOneReportJob } from "../reports/reportWorker";
import { processOneRulesEngineJob } from "../scoring/rulesEngineWorker";
import {
  ACCOUNT_A,
  ACCOUNT_B,
  CASE_A,
  CASE_B,
  PUBLIC_A,
  RUN_PREFIX,
  SESSION_A,
  cleanRunData,
  db,
  seedOwners,
} from "./r1DbHarness";

const ACCESS_AT = new Date("2027-03-01T11:50:00.000Z");
const SUBMITTED_AT = new Date("2027-03-01T12:00:00.000Z");
const INITIALIZED_AT = new Date("2027-03-01T12:01:00.000Z");
const FIRST_LEASE_EXPIRES_AT = new Date("2027-03-01T12:01:01.000Z");
const WORKER_AT = new Date("2027-03-01T12:02:00.000Z");
const REPLAY_AT = new Date("2027-03-01T12:03:00.000Z");
const RAW_ANSWER = "PRIVATE_REPORT_ANSWER_MUST_NOT_ESCAPE";

const requestId = (label: string) => `${RUN_PREFIX}_${label}_request`;
const mutationId = (label: string) => `${RUN_PREFIX}_${label}_mutation`;

function decodeDbJson(value: unknown): unknown {
  return typeof value === "string" ? (JSON.parse(value) as unknown) : value;
}

function answerFor(questionId: string): QuestionnaireAnswerInputDto {
  const question = technicalQuestionnaireBundle.questionById[questionId]!;
  if (question.type === "text") return { kind: "text", text: RAW_ANSWER };
  if (questionId === "b1_q3")
    return { kind: "multi", optionIds: ["b2b_small"] };
  if (question.type === "single")
    return { kind: "single", optionId: question.options[0]!.id };
  if (question.type === "multi")
    return { kind: "multi", optionIds: [question.options[0]!.id] };
  throw new Error(`Unsupported questionnaire question ${questionId}`);
}

async function seedPromoAccessAndExactConsents(label: string): Promise<void> {
  const database = await db();
  const tariffId = `${RUN_PREFIX}_report_tariff_${label}`;
  const paymentId = `${RUN_PREFIX}_report_payment_${label}`;
  await database.insert(tariffSnapshots).values({
    id: tariffId,
    tariffCode: "lexy-advanced-diagnostic",
    serviceTier: "lexy-advanced-diagnostic",
    provenanceStatus: "draft_test_only",
    catalogVersion: TARIFF_CATALOG_VERSION,
    currency: "RUB",
    createdAt: ACCESS_AT,
  });
  await database.insert(paymentRecords).values({
    id: paymentId,
    customerAccountId: ACCOUNT_A,
    diagnosticCaseId: CASE_A,
    tariffSnapshotId: tariffId,
    tariffCode: "lexy-advanced-diagnostic",
    campaignId: `report_${label}`,
    sourceType: "promo",
    status: "promo_granted",
    chargedAmount: 0,
    currency: "RUB",
    correlationId: `${RUN_PREFIX}_report_correlation_${label}`,
    grantedAt: ACCESS_AT,
    createdAt: ACCESS_AT,
  });
  await database.insert(accessGrants).values({
    id: `${RUN_PREFIX}_report_grant_${label}`,
    customerAccountId: ACCOUNT_A,
    diagnosticCaseId: CASE_A,
    paymentRecordId: paymentId,
    status: "active",
    grantedAt: ACCESS_AT,
    expiresAt: null,
    revokedAt: null,
    revocationReasonCode: null,
    createdAt: ACCESS_AT,
    updatedAt: ACCESS_AT,
  });
  await database.insert(caseConsents).values(
    getDocumentRegistryForValidation()
      .filter(document => document.required)
      .map(document => ({
        id: `${RUN_PREFIX}_consent_${document.consentType}_${label}`,
        customerAccountId: ACCOUNT_A,
        diagnosticCaseId: CASE_A,
        documentId: document.documentId,
        documentVersion: document.documentVersion,
        contentHash: document.contentHash,
        consentType: document.consentType,
        accepted: true,
        actorCustomerSessionId: SESSION_A,
        acceptedAt: ACCESS_AT,
        createdAt: ACCESS_AT,
      }))
  );
  await database
    .update(diagnosticCases)
    .set({
      status: "access_granted",
      stateVersion: 2,
      updatedAt: ACCESS_AT,
    })
    .where(
      and(
        eq(diagnosticCases.id, CASE_A),
        eq(diagnosticCases.customerAccountId, ACCOUNT_A)
      )
    );
}

async function submitActualQuestionnaire(label: string) {
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
    const saved = await saveQuestionnaireAnswer(input);
    expect(saved.outcome).toBe("saved");
    draftRevision += 1;
  }

  const receipt = await submitQuestionnaire({
    customerAccountId: ACCOUNT_A,
    customerSessionId: SESSION_A,
    requestId: requestId(`${label}_submit`),
    publicId: PUBLIC_A,
    idempotencyKey: mutationId(`${label}_submit`),
    now: SUBMITTED_AT,
  });
  expect(receipt).toMatchObject({
    outcome: "saved",
    receipt: { status: "submitted", draftRevision },
  });

  const database = await db();
  const submissions = await database
    .select()
    .from(questionnaireSubmissions)
    .where(
      and(
        eq(questionnaireSubmissions.customerAccountId, ACCOUNT_A),
        eq(questionnaireSubmissions.diagnosticCaseId, CASE_A)
      )
    );
  expect(submissions).toHaveLength(1);
  const sourceEvents = await database
    .select()
    .from(outboxEvents)
    .where(
      and(
        eq(outboxEvents.aggregateId, submissions[0]!.id),
        eq(outboxEvents.eventType, "questionnaire.submitted_for_scoring")
      )
    );
  expect(sourceEvents).toHaveLength(1);
  return { submission: submissions[0]!, sourceEvent: sourceEvents[0]! };
}

async function seedFulfilledReportSource(label: string) {
  await seedPromoAccessAndExactConsents(label);
  const questionnaire = await submitActualQuestionnaire(label);
  const database = await db();
  await expect(
    processOneRulesEngineJob(database, {
      leaseOwner: `rules_report_${label}`,
      serviceActorId: "rules_report_service",
      now: () => SUBMITTED_AT,
    })
  ).resolves.toMatchObject({
    processed: true,
    status: "manual_review_required",
  });

  const [
    cases,
    drafts,
    revisions,
    evaluations,
    sourceEvents,
    payments,
    grants,
    consents,
  ] = await Promise.all([
    database
      .select()
      .from(diagnosticCases)
      .where(eq(diagnosticCases.id, CASE_A)),
    database
      .select()
      .from(questionnaireDrafts)
      .where(eq(questionnaireDrafts.diagnosticCaseId, CASE_A)),
    database
      .select()
      .from(questionnaireAnswerRevisions)
      .where(eq(questionnaireAnswerRevisions.diagnosticCaseId, CASE_A)),
    database
      .select()
      .from(questionnaireRuleEvaluations)
      .where(
        eq(
          questionnaireRuleEvaluations.questionnaireSubmissionId,
          questionnaire.submission.id
        )
      ),
    database
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.id, questionnaire.sourceEvent.id)),
    database
      .select()
      .from(paymentRecords)
      .where(eq(paymentRecords.diagnosticCaseId, CASE_A)),
    database
      .select()
      .from(accessGrants)
      .where(eq(accessGrants.diagnosticCaseId, CASE_A)),
    database
      .select()
      .from(caseConsents)
      .where(eq(caseConsents.diagnosticCaseId, CASE_A)),
  ]);

  expect(cases[0]).toMatchObject({
    customerAccountId: ACCOUNT_A,
    status: "manual_review_required",
    stateVersion: 6,
  });
  expect(drafts).toHaveLength(1);
  expect(drafts[0]).toMatchObject({
    customerAccountId: ACCOUNT_A,
    status: "submitted",
    draftRevision: technicalQuestionnaireBundle.activeCoreQuestionIds.length,
  });
  expect(revisions).toHaveLength(
    technicalQuestionnaireBundle.activeCoreQuestionIds.length
  );
  expect(payments).toHaveLength(1);
  expect(payments[0]).toMatchObject({
    status: "promo_granted",
    chargedAmount: 0,
  });
  expect(grants).toHaveLength(1);
  expect(grants[0]).toMatchObject({ status: "active", revokedAt: null });
  expect(consents).toHaveLength(
    getDocumentRegistryForValidation().filter(document => document.required)
      .length
  );
  expect(consents.every(consent => consent.accepted)).toBe(true);
  expect(evaluations).toHaveLength(1);
  expect(evaluations[0]).toMatchObject({
    customerAccountId: ACCOUNT_A,
    diagnosticCaseId: CASE_A,
    questionnaireSubmissionId: questionnaire.submission.id,
    sourceOutboxEventId: questionnaire.sourceEvent.id,
    status: "manual_review_required",
    manualReviewRequired: true,
    failureCode: null,
  });
  expect(evaluations[0]!.outcomeJson).not.toBeNull();
  expect(evaluations[0]!.outcomeHash).toMatch(/^[a-f0-9]{64}$/);
  expect(sourceEvents).toHaveLength(1);
  expect(sourceEvents[0]).toMatchObject({
    status: "published",
    leaseOwner: null,
    leaseExpiresAt: null,
    lastErrorCode: null,
  });

  const claim: CompletedEvaluationClaim = {
    customerAccountId: ACCOUNT_A,
    diagnosticCaseId: CASE_A,
    questionnaireSubmissionId: questionnaire.submission.id,
    questionnaireRuleEvaluationId: evaluations[0]!.id,
    sourceOutboxEventId: questionnaire.sourceEvent.id,
  };
  return {
    claim,
    draft: drafts[0]!,
    evaluation: evaluations[0]!,
    payment: payments[0]!,
    submission: questionnaire.submission,
    sourceEvent: sourceEvents[0]!,
  };
}

async function expectRawAnswerOutsidePublicSurfaces(input: {
  snapshotId: string;
  draftId: string;
  submissionId: string;
  evaluationId: string;
}): Promise<void> {
  const database = await db();
  const snapshots = await database
    .select()
    .from(reportSnapshots)
    .where(eq(reportSnapshots.id, input.snapshotId));
  expect(snapshots).toHaveLength(1);
  const { payloadJson: _internalPayload, ...snapshotMetadata } = snapshots[0]!;
  const aggregateIds = [
    CASE_A,
    input.snapshotId,
    input.draftId,
    input.submissionId,
    input.evaluationId,
  ];
  const [audits, outboxes] = await Promise.all([
    database
      .select()
      .from(auditEvents)
      .where(inArray(auditEvents.aggregateId, aggregateIds)),
    database
      .select()
      .from(outboxEvents)
      .where(inArray(outboxEvents.aggregateId, aggregateIds)),
  ]);
  const publicOperationalSurfaces = JSON.stringify({
    snapshotMetadata,
    audits: audits.map(row => row.privacySafeMetadata),
    outboxes: outboxes.map(row => row.privacySafePayload),
  });
  expect(publicOperationalSurfaces).not.toContain(RAW_ANSWER);
  expect(publicOperationalSurfaces).not.toContain("activeAnswers");
  expect(publicOperationalSurfaces).not.toContain("canonicalAnswers");
  expect(publicOperationalSurfaces).not.toContain("inputSnapshotJson");
  expect(publicOperationalSurfaces).not.toContain("outcomeJson");
}

async function singleSnapshot(snapshotId: string) {
  const database = await db();
  const rows = await database
    .select()
    .from(reportSnapshots)
    .where(eq(reportSnapshots.id, snapshotId));
  expect(rows).toHaveLength(1);
  return { ...rows[0]!, payloadJson: decodeDbJson(rows[0]!.payloadJson) };
}

describe("Report snapshot worker real DB runtime", () => {
  beforeEach(async () => {
    await cleanRunData();
    await seedOwners();
  });

  afterAll(async () => {
    await cleanRunData();
  });

  it("builds one schema-valid ready snapshot from the fulfilled owner-bound graph and preserves fences, replay idempotency, terminal values, and public privacy", async () => {
    const source = await seedFulfilledReportSource("ready");
    const database = await db();

    const initialized = await Promise.all([
      initializeReportForCompletedEvaluation(
        database,
        source.claim,
        INITIALIZED_AT
      ),
      initializeReportForCompletedEvaluation(
        database,
        source.claim,
        INITIALIZED_AT
      ),
    ]);
    expect(initialized[0]).toEqual(initialized[1]);
    expect(initialized[0]).toMatchObject({
      customerAccountId: ACCOUNT_A,
      diagnosticCaseId: CASE_A,
      status: "pending",
      attemptCount: 0,
      payloadJson: null,
      failureCode: null,
    });
    expect(
      await database
        .select()
        .from(reportSnapshots)
        .where(
          eq(
            reportSnapshots.questionnaireRuleEvaluationId,
            source.evaluation.id
          )
        )
    ).toHaveLength(1);

    await expect(
      loadReportSnapshot(database, {
        reportSnapshotId: initialized[0]!.id,
        customerAccountId: ACCOUNT_B,
        diagnosticCaseId: CASE_B,
      })
    ).resolves.toBeNull();

    const firstLease = await claimOneReportSnapshot(database, {
      leaseOwner: "report_owner_a",
      now: INITIALIZED_AT,
      leaseExpiresAt: FIRST_LEASE_EXPIRES_AT,
    });
    expect(firstLease).toMatchObject({
      id: initialized[0]!.id,
      status: "processing",
      leaseOwner: "report_owner_a",
      leaseVersion: 1,
      attemptCount: 1,
    });
    const impossiblePayload = {
      shouldNotPersist: true,
    } satisfies CanonicalJsonValue;
    const impossibleHash = canonicalSha256(impossiblePayload);
    const wrongOwnerFence = {
      reportSnapshotId: initialized[0]!.id,
      customerAccountId: ACCOUNT_B,
      diagnosticCaseId: CASE_B,
      leaseOwner: "report_owner_a",
      leaseVersion: 1,
      now: INITIALIZED_AT,
    };
    await expect(
      completeReportSnapshot(database, {
        ...wrongOwnerFence,
        payloadJson: impossiblePayload,
        payloadHash: impossibleHash,
        contentHash: impossibleHash,
      })
    ).resolves.toBe(false);
    await expect(
      failReportSnapshot(database, {
        ...wrongOwnerFence,
        failureCode: "technical_failure",
      })
    ).resolves.toBe(false);
    expect(
      await loadReportSnapshot(database, {
        reportSnapshotId: initialized[0]!.id,
        customerAccountId: ACCOUNT_A,
        diagnosticCaseId: CASE_A,
      })
    ).toMatchObject({
      status: "processing",
      leaseVersion: 1,
      payloadJson: null,
    });

    const concurrentResults = await Promise.all([
      processOneReportJob(database, {
        leaseOwner: "report_worker_one",
        now: () => WORKER_AT,
      }),
      processOneReportJob(database, {
        leaseOwner: "report_worker_two",
        now: () => WORKER_AT,
      }),
    ]);
    expect(concurrentResults.filter(result => result.processed)).toHaveLength(
      1
    );
    expect(concurrentResults.find(result => result.processed)).toMatchObject({
      processed: true,
      status: "ready",
      reportSnapshotId: initialized[0]!.id,
    });
    expect(concurrentResults.find(result => !result.processed)).toEqual({
      processed: false,
      reason: "empty",
    });
    await expect(
      processOneReportJob(database, {
        leaseOwner: "report_worker_replay",
        now: () => REPLAY_AT,
      })
    ).resolves.toEqual({ processed: false, reason: "empty" });

    const ready = await singleSnapshot(initialized[0]!.id);
    expect(ready).toMatchObject({
      status: "ready",
      readySlot: 1,
      leaseOwner: null,
      leaseVersion: 2,
      leaseExpiresAt: null,
      attemptCount: 2,
      failureCode: null,
    });
    expect(ready.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(ready.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(ready.payloadJson).not.toBeNull();
    expect(validateReportSchema(ready.payloadJson)).toEqual([]);
    expect(canonicalSha256(ready.payloadJson as CanonicalJsonValue)).toBe(
      ready.payloadHash
    );

    const payloadText = JSON.stringify(ready.payloadJson);
    expect(payloadText).toContain(RAW_ANSWER);
    const publicView = deriveReportViewModel(
      ready.payloadJson as ValidatedReportSnapshot
    );
    const publicText = JSON.stringify(publicView);
    expect(publicText).not.toContain(RAW_ANSWER);
    expect(publicText).not.toContain("canonicalAnswers");
    expect(publicText).not.toContain("paymentRecordId");
    expect(publicText).not.toContain("accessGrantId");
    await expectRawAnswerOutsidePublicSurfaces({
      snapshotId: ready.id,
      draftId: source.draft.id,
      submissionId: source.submission.id,
      evaluationId: source.evaluation.id,
    });

    await expect(
      loadReadyReportSnapshotByPublicCase(database, {
        customerAccountId: ACCOUNT_B,
        casePublicId: PUBLIC_A,
      })
    ).resolves.toBeNull();
    await expect(
      loadReadyReportSnapshotByPublicCase(database, {
        customerAccountId: ACCOUNT_A,
        casePublicId: PUBLIC_A,
      })
    ).resolves.toMatchObject({ id: ready.id, status: "ready" });
    await expect(
      supersedeReadyReportSnapshot(database, {
        reportSnapshotId: ready.id,
        customerAccountId: ACCOUNT_B,
        diagnosticCaseId: CASE_B,
      })
    ).resolves.toBe(false);

    const terminalFence = {
      reportSnapshotId: ready.id,
      customerAccountId: ACCOUNT_A,
      diagnosticCaseId: CASE_A,
      leaseOwner: "report_worker_replay",
      leaseVersion: ready.leaseVersion,
      now: REPLAY_AT,
    };
    await expect(
      failReportSnapshot(database, {
        ...terminalFence,
        failureCode: "technical_failure",
      })
    ).resolves.toBe(false);
    await expect(
      completeReportSnapshot(database, {
        ...terminalFence,
        payloadJson: impossiblePayload,
        payloadHash: impossibleHash,
        contentHash: impossibleHash,
      })
    ).resolves.toBe(false);
    expect(await singleSnapshot(ready.id)).toEqual(ready);
  }, 60_000);

  it("terminally classifies a revoked source graph without a ready payload and cannot replay or mutate the failed value", async () => {
    const source = await seedFulfilledReportSource("failed");
    const database = await db();
    const initialized = await initializeReportForCompletedEvaluation(
      database,
      source.claim,
      INITIALIZED_AT
    );
    await database
      .update(accessGrants)
      .set({
        status: "revoked",
        revokedAt: INITIALIZED_AT,
        revocationReasonCode: "integration_source_revoked",
        updatedAt: INITIALIZED_AT,
      })
      .where(
        and(
          eq(accessGrants.customerAccountId, ACCOUNT_A),
          eq(accessGrants.diagnosticCaseId, CASE_A),
          eq(accessGrants.paymentRecordId, source.payment.id)
        )
      );

    await expect(
      processOneReportJob(database, {
        leaseOwner: "report_worker_failed",
        now: () => WORKER_AT,
      })
    ).resolves.toEqual({
      processed: true,
      status: "failed",
      reportSnapshotId: initialized.id,
      failureCode: "payment_access_invalid",
    });
    const failed = await singleSnapshot(initialized.id);
    expect(failed).toMatchObject({
      status: "failed",
      readySlot: null,
      leaseOwner: null,
      leaseVersion: 1,
      leaseExpiresAt: null,
      attemptCount: 1,
      payloadJson: null,
      payloadHash: null,
      contentHash: null,
      failureCode: "payment_access_invalid",
    });
    await expect(
      loadReadyReportSnapshotByPublicCase(database, {
        customerAccountId: ACCOUNT_A,
        casePublicId: PUBLIC_A,
      })
    ).resolves.toBeNull();
    await expect(
      processOneReportJob(database, {
        leaseOwner: "report_worker_failed_replay",
        now: () => REPLAY_AT,
      })
    ).resolves.toEqual({ processed: false, reason: "empty" });

    const replacementPayload = {
      forbiddenReplacement: true,
    } satisfies CanonicalJsonValue;
    const replacementHash = canonicalSha256(replacementPayload);
    const terminalFence = {
      reportSnapshotId: failed.id,
      customerAccountId: ACCOUNT_A,
      diagnosticCaseId: CASE_A,
      leaseOwner: "report_worker_failed",
      leaseVersion: failed.leaseVersion,
      now: REPLAY_AT,
    };
    await expect(
      completeReportSnapshot(database, {
        ...terminalFence,
        payloadJson: replacementPayload,
        payloadHash: replacementHash,
        contentHash: replacementHash,
      })
    ).resolves.toBe(false);
    await expect(
      failReportSnapshot(database, {
        ...terminalFence,
        failureCode: "technical_failure",
      })
    ).resolves.toBe(false);
    expect(await singleSnapshot(failed.id)).toEqual(failed);
    expect(
      await database
        .select()
        .from(reportSnapshots)
        .where(
          eq(
            reportSnapshots.questionnaireRuleEvaluationId,
            source.evaluation.id
          )
        )
    ).toHaveLength(1);
    await expectRawAnswerOutsidePublicSurfaces({
      snapshotId: failed.id,
      draftId: source.draft.id,
      submissionId: source.submission.id,
      evaluationId: source.evaluation.id,
    });
  }, 60_000);
});
