import { describe, expect, it } from "vitest";
import { outboxDedupeKey, parseAuditEvent, parseOutboxEvent } from "./contracts";

const saveAudit = {
  actorType: "customer_session" as const,
  actorId: "session_questionnaire_01",
  aggregateType: "questionnaire_draft" as const,
  aggregateId: "qdraft_questionnaire_01",
  eventType: "questionnaire.answer_saved" as const,
  outcome: "succeeded" as const,
  requestId: "request_questionnaire_save_01",
  idempotencyKeyHash: "a".repeat(64),
  privacySafeMetadata: {
    caseId: "case_questionnaire_01",
    questionId: "b1_q1",
    draftRevision: 1,
    visibleSetHash: "b".repeat(64),
    activeAnsweredCount: 1,
    requiredActiveCount: 33,
    manualFollowUpRequired: false,
    test: true as const,
  },
};

const submitAudit = {
  actorType: "customer_session" as const,
  actorId: "session_questionnaire_01",
  aggregateType: "questionnaire_draft" as const,
  aggregateId: "qdraft_questionnaire_01",
  eventType: "questionnaire.submitted" as const,
  outcome: "succeeded" as const,
  requestId: "request_questionnaire_submit_01",
  idempotencyKeyHash: "c".repeat(64),
  privacySafeMetadata: {
    caseId: "case_questionnaire_01",
    submissionId: "qsubmit_questionnaire_01",
    submissionVersion: 1 as const,
    inputSnapshotHash: "d".repeat(64),
    activeAnsweredCount: 33,
    requiredActiveCount: 33,
    manualFollowUpRequired: false,
    test: true as const,
  },
};

const scoringOutbox = {
  aggregateType: "questionnaire_submission" as const,
  aggregateId: "qsubmit_questionnaire_01",
  eventType: "questionnaire.submitted_for_scoring" as const,
  privacySafePayload: {
    caseId: "case_questionnaire_01",
    submissionId: "qsubmit_questionnaire_01",
    submissionVersion: 1 as const,
    inputSnapshotHash: "d".repeat(64),
    test: true as const,
  },
};

const deniedAudit = {
  actorType: "customer_session" as const,
  actorId: "session_questionnaire_01",
  aggregateType: "diagnostic_case" as const,
  aggregateId: "unresolved_case" as const,
  eventType: "questionnaire.access_denied" as const,
  outcome: "denied" as const,
  reasonCode: "owner_or_entitlement_miss" as const,
  requestId: "request_questionnaire_deny_01",
  privacySafeMetadata: {
    resourceClass: "questionnaire" as const,
    action: "get_draft" as const,
  },
};

describe("questionnaire event contracts", () => {
  it("accepts the exact safe save/submission audit facts and scoring outbox", () => {
    expect(parseAuditEvent(saveAudit)).toEqual(saveAudit);
    expect(parseAuditEvent(submitAudit)).toEqual(submitAudit);
    expect(parseAuditEvent(deniedAudit)).toEqual(deniedAudit);
    expect(parseOutboxEvent(scoringOutbox)).toEqual(scoringOutbox);
    expect(outboxDedupeKey(scoringOutbox)).toBe(
      "questionnaire-submission:qsubmit_questionnaire_01:v1",
    );
  });

  it.each([
    ["raw answer", { answer: { kind: "text", text: "private" } }],
    ["text", { text: "private response" }],
    ["raw client mutation", { clientMutationId: "raw-mutation-id" }],
    ["token", { token: "raw-token" }],
    ["answer value", { value: "private" }],
  ])("rejects %s from all questionnaire event payloads", (_label, extra) => {
    expect(() => parseAuditEvent({
      ...saveAudit,
      privacySafeMetadata: { ...saveAudit.privacySafeMetadata, ...extra },
    })).toThrow();
    expect(() => parseAuditEvent({
      ...submitAudit,
      privacySafeMetadata: { ...submitAudit.privacySafeMetadata, ...extra },
    })).toThrow();
    expect(() => parseOutboxEvent({
      ...scoringOutbox,
      privacySafePayload: { ...scoringOutbox.privacySafePayload, ...extra },
    })).toThrow();
  });

  it("rejects aggregate mismatch and non-v1 submissions", () => {
    expect(() => parseOutboxEvent({
      ...scoringOutbox,
      aggregateId: "qsubmit_other_01",
    })).toThrow(/identifiers differ/);
    expect(() => parseOutboxEvent({
      ...scoringOutbox,
      privacySafePayload: { ...scoringOutbox.privacySafePayload, submissionVersion: 2 },
    })).toThrow();
  });
});
