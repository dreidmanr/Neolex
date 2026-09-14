import { describe, expect, it } from "vitest";
import type {
  QuestionnaireAnswerRevision,
  QuestionnaireDraft,
} from "../../../drizzle/schema";
import { buildQuestionnaireProjection } from "./questionnaireService";
import {
  effectiveAnswersFromRevisionRows,
  QuestionnairePersistenceError,
} from "./questionnaireRepository";
import { technicalQuestionnaireBundle as bundle } from "./configBundle";
import { deriveQuestionnaireState } from "./visibility";

const now = new Date("2027-01-01T00:00:00.000Z");

function draft(overrides: Partial<QuestionnaireDraft> = {}): QuestionnaireDraft {
  const state = deriveQuestionnaireState(bundle, {});
  return {
    id: "qdraft_unit_01",
    customerAccountId: "account_unit_01",
    diagnosticCaseId: "case_unit_01",
    questionnaireReleaseId: bundle.releaseId,
    questionnaireVersion: bundle.version,
    questionnaireContentHash: bundle.contentHash,
    status: "open",
    draftRevision: 2,
    currentQuestionId: "b8_q1",
    visibleQuestionIds: [...state.visibleQuestionIds],
    visibleSetHash: state.visibleSetHash,
    manualFollowUpRequired: false,
    manualFollowUpTriggerIds: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function revision(
  overrides: Partial<QuestionnaireAnswerRevision> = {},
): QuestionnaireAnswerRevision {
  return {
    id: "qanswer_unit_01",
    customerAccountId: "account_unit_01",
    diagnosticCaseId: "case_unit_01",
    questionnaireDraftId: "qdraft_unit_01",
    questionId: "b1_q1",
    draftRevision: 1,
    valueJson: { kind: "text", text: "canonical" },
    answerState: "active",
    source: "customer",
    clientMutationIdHash: "a".repeat(64),
    deactivationReasonCode: null,
    createdAt: now,
    ...overrides,
  };
}

describe("Questionnaire v2 server projection and immutable revisions", () => {
  it("chooses the greatest revision, decodes MariaDB JSON strings, and suppresses inactive values", () => {
    const rows = [
      revision({
        id: "qanswer_unit_03",
        draftRevision: 2,
        valueJson: null,
        answerState: "inactive",
        source: "system_branch_recompute",
        deactivationReasonCode: "branch_no_longer_visible",
      }),
      revision({
        id: "qanswer_unit_02",
        questionId: "b1_q2",
        draftRevision: 2,
        valueJson: JSON.stringify({ kind: "single", optionId: "saas" }),
      }),
      revision(),
    ];
    expect(effectiveAnswersFromRevisionRows(bundle, draft(), rows)).toEqual({
      b1_q2: { kind: "single", optionId: "saas" },
    });
  });

  it("fails closed on noncanonical, cross-scope, or malformed inactive persistence", () => {
    expect(() => effectiveAnswersFromRevisionRows(bundle, draft(), [
      revision({ valueJson: { kind: "text", text: " padded " } }),
    ])).toThrow(QuestionnairePersistenceError);
    expect(() => effectiveAnswersFromRevisionRows(bundle, draft(), [
      revision({ diagnosticCaseId: "case_other_01" }),
    ])).toThrow(QuestionnairePersistenceError);
    expect(() => effectiveAnswersFromRevisionRows(bundle, draft(), [
      revision({ answerState: "inactive", valueJson: null }),
    ])).toThrow(QuestionnairePersistenceError);
  });

  it("projects only safe visible questions and answers and never leaks hidden cursor IDs or bundle hashes", () => {
    const answers = {
      b1_q1: { kind: "text", text: "safe client value" } as const,
    };
    const state = deriveQuestionnaireState(bundle, answers);
    const projection = buildQuestionnaireProjection(
      "public_questionnaire_unit_01",
      draft({
        currentQuestionId: "b8_q1",
        visibleQuestionIds: [...state.visibleQuestionIds],
        visibleSetHash: state.visibleSetHash,
      }),
      bundle,
      answers,
      state,
    );

    expect(projection.visibleQuestionCount).toBe(33);
    expect(projection.currentQuestionId).toBe("b1_q2");
    expect(projection.answers).toEqual({ b1_q1: { kind: "text", text: "safe client value" } });
    expect(projection.visibleQuestions[0]).toEqual(expect.objectContaining({
      id: "b1_q1",
      input: "text",
      required: true,
    }));
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain(bundle.contentHash);
    expect(serialized).not.toContain("manualFollowUpTriggerIds");
    expect(serialized).not.toContain("qdraft_unit_01");
    expect(serialized).not.toContain("b8_q1");
  });
});
