import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  accessGrants,
  auditEvents,
  diagnosticCases,
  idempotencyRecords,
  outboxEvents,
  paymentRecords,
  questionnaireAnswerRevisions,
  questionnaireDrafts,
  questionnaireSubmissions,
  tariffSnapshots,
} from "../../../drizzle/schema";
import { pilotRouter } from "../cases/router";
import { technicalQuestionnaireBundle as bundle } from "../questionnaire/configBundle";
import {
  saveQuestionnaireAnswer,
  submitQuestionnaire,
  type SaveQuestionnaireAnswerInput,
} from "../questionnaire/questionnaireService";
import type { QuestionnaireAnswerInputDto } from "../../../shared/r1/questionnaire";
import {
  ACCOUNT_A,
  ACCOUNT_B,
  CASE_A,
  CASE_B,
  PUBLIC_A,
  PUBLIC_B,
  RUN_PREFIX,
  SESSION_A,
  SESSION_B,
  cleanRunData,
  context,
  db,
  seedOwners,
} from "./r1DbHarness";

const NOW = new Date("2027-03-01T12:00:00.000Z");
const requestId = (label: string) => `${RUN_PREFIX}_${label}_request`;
const mutationId = (label: string) => `${RUN_PREFIX}_${label}_mutation`;

function decodeDbJson(value: unknown): unknown {
  return typeof value === "string" ? JSON.parse(value) as unknown : value;
}

async function grant(accountId: string, caseId: string, label: string): Promise<string> {
  const database = await db();
  const tariffId = `${RUN_PREFIX}_tariff_${label}`;
  const paymentId = `${RUN_PREFIX}_payment_${label}`;
  const grantId = `${RUN_PREFIX}_grant_${label}`;
  await database.insert(tariffSnapshots).values({
    id: tariffId,
    tariffCode: "base_diagnostic",
    serviceTier: "base_diagnostic",
    provenanceStatus: "draft_test_only",
    catalogVersion: "r1-test",
    currency: "RUB",
    createdAt: NOW,
  });
  await database.insert(paymentRecords).values({
    id: paymentId,
    customerAccountId: accountId,
    diagnosticCaseId: caseId,
    tariffSnapshotId: tariffId,
    tariffCode: "base_diagnostic",
    campaignId: "questionnaire_test",
    sourceType: "promo",
    status: "promo_granted",
    chargedAmount: 0,
    currency: "RUB",
    correlationId: `${RUN_PREFIX}_correlation_${label}`,
    grantedAt: NOW,
    createdAt: NOW,
  });
  await database.insert(accessGrants).values({
    id: grantId,
    customerAccountId: accountId,
    diagnosticCaseId: caseId,
    paymentRecordId: paymentId,
    status: "active",
    grantedAt: NOW,
    expiresAt: null,
    revokedAt: null,
    revocationReasonCode: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await database.update(diagnosticCases).set({ status: "access_granted", stateVersion: 2 }).where(
    and(eq(diagnosticCases.id, caseId), eq(diagnosticCases.customerAccountId, accountId)),
  );
  return grantId;
}

function callerA(label: string) {
  return pilotRouter.createCaller(context({
    customer: { accountId: ACCOUNT_A, sessionId: SESSION_A },
    requestId: requestId(label),
  }));
}

function saveInput(
  label: string,
  questionId: string,
  value: QuestionnaireAnswerInputDto,
  expectedDraftRevision: number,
): SaveQuestionnaireAnswerInput {
  return {
    customerAccountId: ACCOUNT_A,
    customerSessionId: SESSION_A,
    requestId: requestId(label),
    publicId: PUBLIC_A,
    questionId,
    value,
    clientMutationId: mutationId(label),
    expectedDraftRevision,
    now: NOW,
  };
}

async function artifacts() {
  const database = await db();
  const [cases, drafts, revisions, submissions, idempotency, audits, outboxes] = await Promise.all([
    database.select().from(diagnosticCases).where(eq(diagnosticCases.id, CASE_A)),
    database.select().from(questionnaireDrafts).where(eq(questionnaireDrafts.diagnosticCaseId, CASE_A)),
    database.select().from(questionnaireAnswerRevisions).where(eq(questionnaireAnswerRevisions.diagnosticCaseId, CASE_A)),
    database.select().from(questionnaireSubmissions).where(eq(questionnaireSubmissions.diagnosticCaseId, CASE_A)),
    database.select().from(idempotencyRecords).where(eq(idempotencyRecords.customerAccountId, ACCOUNT_A)),
    database.select().from(auditEvents),
    database.select().from(outboxEvents),
  ]);
  return {
    case: cases[0],
    drafts,
    revisions,
    submissions: submissions.map(row => ({
      ...row,
      inputSnapshotJson: decodeDbJson(row.inputSnapshotJson),
    })),
    idempotency,
    audits: audits
      .filter(row => row.aggregateId === CASE_A || drafts.some(draft => draft.id === row.aggregateId))
      .map(row => ({ ...row, privacySafeMetadata: decodeDbJson(row.privacySafeMetadata) })),
    outboxes: outboxes
      .filter(row => row.aggregateId === CASE_A || submissions.some(submission => submission.id === row.aggregateId))
      .map(row => ({ ...row, privacySafePayload: decodeDbJson(row.privacySafePayload) })),
  };
}

function firstValidAnswer(questionId: string): QuestionnaireAnswerInputDto {
  const question = bundle.questionById[questionId]!;
  if (question.type === "text") return { kind: "text", text: `answer-${questionId}` };
  if (questionId === "b1_q3") {
    return { kind: "multi", optionIds: ["b2b_small"] };
  }
  if (question.type === "single") return { kind: "single", optionId: question.options[0]!.id };
  if (question.type === "multi") return { kind: "multi", optionIds: [question.options[0]!.id] };
  throw new Error(`Unsupported question ${questionId}`);
}

describe("Questionnaire v2 real DB runtime", () => {
  beforeEach(async () => {
    await cleanRunData();
    await seedOwners();
    await grant(ACCOUNT_A, CASE_A, "a");
    await grant(ACCOUNT_B, CASE_B, "b");
  });

  afterAll(async () => {
    await cleanRunData();
  });

  it("creates one pinned 33-core draft and returns only its safe projection", async () => {
    const caller = callerA("initial");
    const first = await caller.cases.getDraft({ publicId: PUBLIC_A });
    const second = await caller.cases.getDraft({ publicId: PUBLIC_A });
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      publicId: PUBLIC_A,
      status: "open",
      draftRevision: 0,
      visibleQuestionCount: 33,
      activeAnsweredCount: 0,
      requiredActiveCount: 33,
      currentQuestionId: "b1_q1",
    });
    const facts = await artifacts();
    expect(facts.drafts).toHaveLength(1);
    expect(facts.drafts[0]).toMatchObject({
      questionnaireReleaseId: bundle.releaseId,
      questionnaireVersion: bundle.version,
      questionnaireContentHash: bundle.contentHash,
      draftRevision: 0,
    });
    const serialized = JSON.stringify(first);
    expect(serialized).not.toContain(bundle.contentHash);
    expect(serialized).not.toContain("manualFollowUpTriggerIds");
  });

  it("returns neutral NOT_FOUND for cross-owner, revoked, expired, and missing grants", async () => {
    const caller = callerA("denials");
    await expect(caller.cases.getDraft({ publicId: PUBLIC_B })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const database = await db();
    await database.update(accessGrants).set({ status: "revoked", revokedAt: NOW }).where(
      eq(accessGrants.diagnosticCaseId, CASE_A),
    );
    await expect(caller.cases.getDraft({ publicId: PUBLIC_A })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await database.update(accessGrants).set({
      status: "active",
      revokedAt: null,
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    }).where(eq(accessGrants.diagnosticCaseId, CASE_A));
    await expect(caller.cases.getDraft({ publicId: PUBLIC_A })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await database.delete(accessGrants).where(eq(accessGrants.diagnosticCaseId, CASE_A));
    await expect(caller.cases.getDraft({ publicId: PUBLIC_A })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("saves idempotently, transitions once, returns structured stale conflict, and persists no raw value/key in events/idempotency", async () => {
    const input = saveInput("save_replay", "b1_q1", { kind: "text", text: "private raw value" }, 0);
    const first = await saveQuestionnaireAnswer(input);
    const replay = await saveQuestionnaireAnswer(input);
    expect(first).toEqual(replay);
    expect(first).toMatchObject({ outcome: "saved", questionnaire: { draftRevision: 1 } });

    await expect(saveQuestionnaireAnswer({
      ...input,
      value: { kind: "text", text: "different" },
    })).rejects.toMatchObject({ code: "CONFLICT" });
    const stale = await saveQuestionnaireAnswer(saveInput(
      "save_stale",
      "b1_q2",
      { kind: "single", optionId: "saas" },
      0,
    ));
    expect(stale).toMatchObject({ outcome: "conflict", questionnaire: { draftRevision: 1 } });

    const facts = await artifacts();
    expect(facts.case).toMatchObject({ status: "in_progress", stateVersion: 3 });
    expect(facts.revisions).toHaveLength(1);
    expect(facts.idempotency).toHaveLength(1);
    expect(facts.audits.filter(row => row.eventType === "questionnaire.answer_saved")).toHaveLength(1);
    expect(facts.outboxes.filter(row =>
      row.eventType === "diagnostic_case.status_changed" &&
      (row.privacySafePayload as { status?: unknown }).status === "in_progress"
    )).toHaveLength(1);
    const serializedArtifacts = JSON.stringify({
      idempotency: facts.idempotency.map(row => row.responseJson),
      audits: facts.audits,
      outboxes: facts.outboxes,
    });
    expect(serializedArtifacts).not.toContain("private raw value");
    expect(serializedArtifacts).not.toContain(input.clientMutationId);
  });

  it("allows one winner in a two-save stale race and rolls back audit dependency failures", async () => {
    const results = await Promise.all([
      saveQuestionnaireAnswer(saveInput("race_a", "b1_q1", { kind: "text", text: "alpha" }, 0)),
      saveQuestionnaireAnswer(saveInput("race_b", "b1_q2", { kind: "single", optionId: "saas" }, 0)),
    ]);
    expect(results.filter(result => result.outcome === "saved")).toHaveLength(1);
    expect(results.filter(result => result.outcome === "conflict")).toHaveLength(1);
    expect((await artifacts()).revisions).toHaveLength(1);

    await cleanRunData();
    await seedOwners();
    await grant(ACCOUNT_A, CASE_A, "rollback");
    const database = await db();
    const sentinel = "SENTINEL_RAW_ANSWER_AND_FAILURE";
    await expect(saveQuestionnaireAnswer(
      saveInput("audit_failure", "b1_q1", { kind: "text", text: "rollback" }, 0),
      {
        requireDatabase: async () => database,
        appendAuditEvent: async () => { throw new Error(sentinel); },
        appendOutboxEvent: async () => undefined,
      },
    )).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Questionnaire is unavailable",
    });
    const rolledBack = await artifacts();
    expect(rolledBack.case).toMatchObject({ status: "access_granted", stateVersion: 2 });
    expect(rolledBack.drafts).toHaveLength(0);
    expect(rolledBack.revisions).toHaveLength(0);
    expect(rolledBack.idempotency).toHaveLength(0);
  });

  it("deactivates hidden branch answers and never restores stale values when the branch reopens", async () => {
    await saveQuestionnaireAnswer(saveInput("branch_open", "b1_q3", { kind: "multi", optionIds: ["b2c"] }, 0));
    await saveQuestionnaireAnswer(saveInput("branch_q1", "b8_q1", { kind: "single", optionId: "yes" }, 1));
    await saveQuestionnaireAnswer(saveInput("branch_q3", "b8_q3", { kind: "single", optionId: "yes" }, 2));
    const closed = await saveQuestionnaireAnswer(saveInput(
      "branch_close",
      "b1_q3",
      { kind: "multi", optionIds: ["mixed"] },
      3,
    ));
    expect(closed.questionnaire.visibleQuestions.map(question => question.id)).not.toContain("b8_q1");
    expect(closed.questionnaire.answers).not.toHaveProperty("b8_q1");

    const reopened = await saveQuestionnaireAnswer(saveInput(
      "branch_reopen",
      "b1_q3",
      { kind: "multi", optionIds: ["b2c"] },
      4,
    ));
    expect(reopened.questionnaire.visibleQuestions.map(question => question.id)).toContain("b8_q1");
    expect(reopened.questionnaire.answers).not.toHaveProperty("b8_q1");
    const facts = await artifacts();
    const suppressed = facts.revisions.filter(row => row.source === "system_branch_recompute");
    expect(suppressed.map(row => row.questionId).sort()).toEqual(["b8_q1", "b8_q3"]);
    expect(suppressed.every(row => row.answerState === "inactive" && row.valueJson === null)).toBe(true);
  });

  it("submits from persisted answers only, emits one scoring event, replays safely, and denies post-submit mutation", async () => {
    let draftRevision = 0;
    for (const questionId of bundle.activeCoreQuestionIds) {
      const saved = await saveQuestionnaireAnswer(saveInput(
        `fill_${draftRevision}`,
        questionId,
        firstValidAnswer(questionId),
        draftRevision,
      ));
      expect(saved.outcome).toBe("saved");
      draftRevision += 1;
    }
    const submitInput = {
      customerAccountId: ACCOUNT_A,
      customerSessionId: SESSION_A,
      requestId: requestId("submit"),
      publicId: PUBLIC_A,
      idempotencyKey: mutationId("submit"),
      now: NOW,
    };
    const submitted = await submitQuestionnaire(submitInput);
    const replay = await submitQuestionnaire(submitInput);
    expect(submitted).toEqual(replay);
    expect(submitted).toMatchObject({
      outcome: "saved",
      receipt: { status: "submitted", draftRevision },
    });
    expect(JSON.stringify(submitted)).not.toContain("answer-b1_q1");

    const facts = await artifacts();
    expect(facts.case).toMatchObject({ status: "submitted", stateVersion: 4 });
    expect(facts.submissions).toHaveLength(1);
    expect(facts.outboxes.filter(row => row.eventType === "questionnaire.submitted_for_scoring")).toHaveLength(1);
    const snapshot = facts.submissions[0]!.inputSnapshotJson as { activeAnswers?: Record<string, unknown> };
    expect(Object.keys(snapshot.activeAnswers ?? {})).toHaveLength(33);
    expect(snapshot.activeAnswers).not.toHaveProperty("b12_q2");

    await expect(saveQuestionnaireAnswer(saveInput(
      "post_submit",
      "b1_q1",
      { kind: "text", text: "late" },
      draftRevision,
    ))).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(submitQuestionnaire({
      ...submitInput,
      idempotencyKey: mutationId("submit_other"),
    })).rejects.toMatchObject({ code: "CONFLICT" });
  }, 30_000);
});
