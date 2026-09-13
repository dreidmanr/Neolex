import { describe, expect, it } from "vitest";
import {
  outboxDedupeKey,
  parseAuditEnvelope,
  parseAuditEvent,
  parseOutboxEnvelope,
  parseOutboxEvent,
} from "./contracts";

const now = new Date("2026-01-01T00:00:00Z");
const audit = {
  actorType: "customer_session" as const,
  actorId: "customer_session_01",
  aggregateType: "diagnostic_case" as const,
  aggregateId: "case_internal_01",
  eventType: "diagnostic_case.synthetic_created" as const,
  outcome: "succeeded" as const,
  toStatus: "draft" as const,
  requestId: "request_event_contract_01",
  idempotencyKeyHash: "a".repeat(64),
  privacySafeMetadata: {
    serviceTier: "base_diagnostic" as const,
    stateVersion: 1,
    synthetic: true as const,
  },
};
const outbox = {
  aggregateType: "diagnostic_case" as const,
  aggregateId: "case_internal_01",
  eventType: "diagnostic_case.synthetic_created" as const,
  privacySafePayload: {
    caseId: "case_internal_01",
    stateVersion: 1,
    synthetic: true as const,
  },
};
const magicLinkAudit = {
  actorType: "service" as const, actorId: "magic_link_issuer",
  aggregateType: "magic_link_token" as const, aggregateId: "magic_token_01",
  eventType: "auth.magic_link_issued" as const, outcome: "succeeded" as const,
  toStatus: "active" as const, requestId: "request_magic_contract_01",
  correlationId: "correlation_01",
  privacySafeMetadata: { identityId: "identity_01", keyVersion: 1, test: true as const, rateLimitCount: 1 },
};
const magicLinkOutbox = {
  aggregateType: "email_delivery" as const, aggregateId: "delivery_01",
  eventType: "auth.magic_link_delivery_queued" as const,
  privacySafePayload: {
    deliveryId: "delivery_01", tokenId: "magic_token_01", identityId: "identity_01",
    keyVersion: 1, windowMillis: 1767225600000, test: true as const,
  },
};

describe("R1 event-specific contracts", () => {
  it("accepts only the exact current synthetic audit/outbox shape", () => {
    expect(parseAuditEvent(audit)).toEqual(audit);
    expect(parseOutboxEvent(outbox)).toEqual(outbox);
    expect(outboxDedupeKey(outbox)).toBe("case-created:case_internal_01:v1");
  });

  it("accepts only exact privacy-safe Magic Link audit/outbox values", () => {
    expect(parseAuditEvent(magicLinkAudit)).toEqual(magicLinkAudit);
    expect(parseOutboxEvent(magicLinkOutbox)).toEqual(magicLinkOutbox);
    expect(outboxDedupeKey(magicLinkOutbox)).toBe("magic-link-delivery:identity_01:1767225600000:v1");
  });

  it.each([
    ["email", { email: "person.test" }],
    ["raw token", { rawToken: "opaque-token" }],
    ["token hash", { tokenHash: "a".repeat(64) }],
    ["url", { url: "https://secret.test/#token" }],
    ["cookie", { cookie: "session=value" }],
    ["bearer", { bearer: "Bearer opaque-token" }],
    ["arbitrary field", { note: "not allowlisted" }],
  ])("rejects %s injection in every Magic Link event payload", (_label, extra) => {
    expect(() => parseAuditEvent({
      ...magicLinkAudit,
      privacySafeMetadata: { ...magicLinkAudit.privacySafeMetadata, ...extra },
    })).toThrow();
    expect(() => parseOutboxEvent({
      ...magicLinkOutbox,
      privacySafePayload: { ...magicLinkOutbox.privacySafePayload, ...extra },
    })).toThrow();
  });

  it.each([
    ["random high-entropy value", { reference: "Nq3v7bX9Lm2Kp8Rt4Ws6Yz1Aa5Cc0DdE" }],
    ["phone", { note: "+1-202-555-0187" }],
    ["name/free text", { note: "Jane Customer called support" }],
    ["nested arrays", { nested: [["unsafe"]] }],
    ["email", { note: "person@example.test" }],
    ["url", { note: "https://secret.test/path" }],
    ["bearer", { note: "Bearer opaque-secret" }],
    ["cookie", { cookie: "session=value" }],
    ["raw token", { rawToken: "opaque-secret" }],
    ["answer", { answer: "private response" }],
  ])("rejects %s under a neutral/arbitrary metadata shape", (_label, extra) => {
    expect(() => parseAuditEvent({
      ...audit,
      privacySafeMetadata: { ...audit.privacySafeMetadata, ...extra },
    })).toThrow();
  });

  it("rejects unsafe audit envelope identifiers and event types", () => {
    expect(() => parseAuditEnvelope({ ...audit, id: "https://unsafe.test", createdAt: now })).toThrow();
    expect(() => parseAuditEnvelope({ ...audit, id: "audit_01", eventType: "arbitrary.event", createdAt: now })).toThrow();
    expect(() => parseAuditEnvelope({ ...audit, id: "audit_01", aggregateId: "Bearer token", createdAt: now })).toThrow();
  });

  it("rejects arbitrary/nested outbox payload and mismatched aggregate IDs", () => {
    expect(() => parseOutboxEvent({
      ...outbox,
      privacySafePayload: { ...outbox.privacySafePayload, nested: [["unsafe"]] },
    })).toThrow();
    expect(() => parseOutboxEvent({
      ...outbox,
      privacySafePayload: { ...outbox.privacySafePayload, caseId: "another_case" },
    })).toThrow(/identifiers differ/);
  });

  it("rejects unsafe eventType, aggregate ID, and dedupe key in the full outbox envelope", () => {
    const envelope = {
      ...outbox,
      id: "outbox_01",
      eventId: "event_01",
      dedupeKey: "case-created:case_internal_01:v1",
      status: "pending",
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    expect(parseOutboxEnvelope(envelope)).toMatchObject({ dedupeKey: envelope.dedupeKey });
    expect(() => parseOutboxEnvelope({ ...envelope, eventType: "unsafe.event" })).toThrow();
    expect(() => parseOutboxEnvelope({ ...envelope, aggregateId: "https://unsafe.test" })).toThrow();
    expect(() => parseOutboxEnvelope({ ...envelope, dedupeKey: "Bearer raw-token" })).toThrow();
    expect(() => parseOutboxEnvelope({ ...envelope, dedupeKey: "case-created:other_case:v1" })).toThrow();
  });
});
