import { describe, expect, it } from "vitest";
import { outboxDedupeKey, parseAuditEvent, parseOutboxEvent } from "./contracts";

const facts = {
  paymentId: "payment_01", caseId: "case_01", grantId: "grant_01",
  tariffCode: "base_diagnostic" as const, chargedAmount: 0 as const,
  currency: "RUB" as const, campaignId: "r1_test_campaign", test: true as const,
};
const audit = {
  actorType: "customer_session" as const, actorId: "session_01",
  aggregateType: "payment_record" as const, aggregateId: "payment_01",
  eventType: "billing.promo_granted" as const, outcome: "succeeded" as const,
  toStatus: "promo_granted" as const, requestId: "request_promo_contract_01",
  correlationId: "correlation_01", idempotencyKeyHash: "b".repeat(64),
  privacySafeMetadata: facts,
};
const outbox = {
  aggregateType: "payment_record" as const, aggregateId: "payment_01",
  eventType: "billing.promo_granted" as const, privacySafePayload: facts,
};

describe("promo event contracts", () => {
  it("accepts only the exact safe facts and payment-scoped dedupe grammar", () => {
    expect(parseAuditEvent(audit)).toEqual(audit);
    expect(parseOutboxEvent(outbox)).toEqual(outbox);
    expect(outboxDedupeKey(outbox)).toBe("promo-payment:payment_01:v1");
    expect(() => parseOutboxEvent({ ...outbox, aggregateId: "payment_02" })).toThrow(/identifiers differ/);
  });
  it.each([
    ["promo", { promoValue: "raw-promo" }], ["verifier", { verifier: "configured-value" }],
    ["hash", { promoHash: "a".repeat(64) }], ["email", { email: "person@example.test" }],
    ["legal body", { legalBody: "prose" }], ["URL", { url: "https://secret.test/legal" }],
  ])("rejects forbidden %s facts", (_label, extra) => {
    expect(() => parseAuditEvent({ ...audit, privacySafeMetadata: { ...facts, ...extra } })).toThrow();
    expect(() => parseOutboxEvent({ ...outbox, privacySafePayload: { ...facts, ...extra } })).toThrow();
  });
});
