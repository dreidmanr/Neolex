import { describe, expect, it } from "vitest";
import type { AccessGrantCandidate } from "./accessPolicy";
import { isActiveOwnedAccessGrant } from "./accessPolicy";

const now = new Date("2026-01-01T00:00:00.000Z");

function candidate(overrides: {
  grant?: Partial<AccessGrantCandidate["grant"]>;
  payment?: Partial<AccessGrantCandidate["payment"]>;
} = {}): AccessGrantCandidate {
  return {
    grant: {
      id: "grant_01", customerAccountId: "account_a", diagnosticCaseId: "case_a",
      paymentRecordId: "payment_01", status: "active", grantedAt: now,
      expiresAt: null, revokedAt: null, revocationReasonCode: null,
      createdAt: now, updatedAt: now, ...overrides.grant,
    },
    payment: {
      id: "payment_01", customerAccountId: "account_a", diagnosticCaseId: "case_a",
      tariffSnapshotId: "tariff_01", tariffCode: "lexy-advanced-diagnostic",
      campaignId: "r1_test_campaign", sourceType: "promo", status: "promo_granted",
      chargedAmount: 0, currency: "RUB", correlationId: "correlation_01",
      grantedAt: now, createdAt: now, ...overrides.payment,
    },
  };
}

describe("active owned access grant policy", () => {
  it("accepts an unrevoked active owned grant backed by the matching payment", () => {
    expect(isActiveOwnedAccessGrant("account_a", "case_a", candidate(), now)).toBe(true);
  });

  it.each([
    ["missing", null],
    ["non-owner", candidate({ grant: { customerAccountId: "account_b" } })],
    ["wrong case", candidate({ grant: { diagnosticCaseId: "case_b" } })],
    ["revoked status", candidate({ grant: { status: "revoked", revokedAt: now } })],
    ["revoked timestamp", candidate({ grant: { revokedAt: now } })],
    ["expired", candidate({ grant: { expiresAt: new Date(now.getTime() - 1) } })],
    ["payment mismatch", candidate({ payment: { id: "payment_02" } })],
    ["payment owner mismatch", candidate({ payment: { customerAccountId: "account_b" } })],
  ] as const)("denies %s", (_label, value) => {
    expect(isActiveOwnedAccessGrant("account_a", "case_a", value, now)).toBe(false);
  });
});
