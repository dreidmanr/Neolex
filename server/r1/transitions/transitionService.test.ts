import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  claim: vi.fn(),
  complete: vi.fn(),
  findOwned: vi.fn(),
  compareAndSwap: vi.fn(),
  appendAudit: vi.fn(),
  appendOutbox: vi.fn(),
  assertTechnical: vi.fn(),
}));

vi.mock("../../_core/env", () => ({
  ENV: { customerSessionSecret: "transition-test-secret-at-least-32-bytes" },
}));
vi.mock("../database", () => ({
  requireR1Database: vi.fn().mockResolvedValue({ transaction: mocks.transaction }),
}));
vi.mock("../idempotency/idempotencyRepository", () => ({
  claimIdempotencyRecord: mocks.claim,
  completeIdempotencyRecord: mocks.complete,
}));
vi.mock("../cases/caseRepository", () => ({
  findOwnedCaseById: mocks.findOwned,
  compareAndSwapCaseStatus: mocks.compareAndSwap,
}));
vi.mock("../audit/auditRepository", () => ({ appendAuditEvent: mocks.appendAudit }));
vi.mock("../outbox/outboxRepository", () => ({ appendOutboxEvent: mocks.appendOutbox }));
vi.mock("../releaseGate", () => ({ assertTechnicalPilotAllowed: mocks.assertTechnical }));

import {
  assertAllowedCaseTransition,
  isAllowedCaseTransition,
  transitionCase,
} from "./transitionService";

const tx = { marker: "transition-transaction" };
const input = {
  caseId: "case_internal_identifier_01",
  customerAccountId: "customer_account_identifier_01",
  actorType: "customer_session" as const,
  actorId: "customer_session_identifier_01",
  fromStatus: "draft" as const,
  toStatus: "access_granted" as const,
  expectedStateVersion: 1,
  reasonCode: "workflow_progression" as const,
  idempotencyKey: "raw-idempotency-key-never-persist",
  requestId: "request_transition_test_01",
};

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "idempotency_record_01",
    customerAccountId: input.customerAccountId,
    scope: "pilot.case.transition",
    idempotencyKey: "hashed-key",
    requestHash: "replaced-by-mock",
    status: "pending",
    responseJson: null,
    expiresAt: new Date("2020-01-01T00:00:00Z"),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function caseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: input.caseId,
    publicId: "case_public_identifier_01",
    customerAccountId: input.customerAccountId,
    serviceTier: "base_diagnostic",
    status: input.fromStatus,
    stateVersion: input.expectedStateVersion,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function claimCurrent(overrides: Record<string, unknown> = {}, claimed = true) {
  mocks.claim.mockImplementation(async (_tx, identity, requestHash) => ({
    record: record({ idempotencyKey: identity.keyHash, requestHash, ...overrides }),
    claimed,
  }));
}

const allowed = [
  ["draft", "access_granted"], ["access_granted", "in_progress"],
  ["in_progress", "submitted"], ["submitted", "scoring"],
  ["scoring", "report_ready"], ["scoring", "manual_review_required"],
  ["scoring", "failed"], ["manual_review_required", "report_ready"],
  ["manual_review_required", "failed"], ["report_ready", "archived"],
  ["failed", "archived"],
] as const;
const forbidden = [
  ["draft", "report_ready"], ["in_progress", "scoring"],
  ["report_ready", "in_progress"], ["archived", "draft"], ["scoring", "archived"],
] as const;

describe("Release 1 case transition policy", () => {
  it.each(allowed)("allows %s -> %s", (from, to) => {
    expect(isAllowedCaseTransition(from, to)).toBe(true);
    expect(() => assertAllowedCaseTransition(from, to)).not.toThrow();
  });

  it.each(forbidden)("rejects %s -> %s", (from, to) => {
    expect(isAllowedCaseTransition(from, to)).toBe(false);
    expect(() => assertAllowedCaseTransition(from, to)).toThrow(
      expect.objectContaining({ code: "CONFLICT" }),
    );
  });
});

describe("transitionCase transaction and idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async callback => callback(tx));
    claimCurrent();
    mocks.findOwned.mockResolvedValue(caseRow());
    mocks.compareAndSwap.mockResolvedValue(true);
    mocks.appendAudit.mockResolvedValue(undefined);
    mocks.appendOutbox.mockResolvedValue(undefined);
    mocks.complete.mockResolvedValue(undefined);
  });

  it("claims, owner-checks, CAS-updates, audits, emits, then completes in one transaction", async () => {
    await expect(transitionCase(input)).resolves.toEqual({
      status: "access_granted",
      stateVersion: 2,
    });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    for (const mock of [mocks.claim, mocks.findOwned, mocks.compareAndSwap, mocks.appendAudit, mocks.appendOutbox, mocks.complete]) {
      expect(mock.mock.calls[0]?.[0]).toBe(tx);
    }
    expect(mocks.claim.mock.invocationCallOrder[0]).toBeLessThan(mocks.findOwned.mock.invocationCallOrder[0]!);
    expect(mocks.findOwned.mock.invocationCallOrder[0]).toBeLessThan(mocks.compareAndSwap.mock.invocationCallOrder[0]!);
    expect(mocks.compareAndSwap.mock.invocationCallOrder[0]).toBeLessThan(mocks.appendAudit.mock.invocationCallOrder[0]!);
    expect(mocks.appendAudit.mock.invocationCallOrder[0]).toBeLessThan(mocks.appendOutbox.mock.invocationCallOrder[0]!);
    expect(mocks.appendOutbox.mock.invocationCallOrder[0]).toBeLessThan(mocks.complete.mock.invocationCallOrder[0]!);
    const identity = mocks.claim.mock.calls[0]?.[1];
    const requestHash = mocks.claim.mock.calls[0]?.[2];
    expect(identity.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(requestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(mocks.claim.mock.calls)).not.toContain(input.idempotencyKey);
  });

  it("replays a completed same-key same-command response without side effects", async () => {
    claimCurrent({ status: "completed", responseJson: { status: "access_granted", stateVersion: 2 } }, false);
    await expect(transitionCase(input)).resolves.toEqual({ status: "access_granted", stateVersion: 2 });
    expect(mocks.findOwned).not.toHaveBeenCalled();
    expect(mocks.compareAndSwap).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("rejects the same key with a different canonical command hash", async () => {
    mocks.claim.mockResolvedValue({ record: record({ requestHash: "0".repeat(64) }), claimed: false });
    await expect(transitionCase(input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.findOwned).not.toHaveBeenCalled();
  });

  it.each([
    ["pending", new Date("2099-01-01T00:00:00Z")],
    ["pending expired", new Date("2020-01-01T00:00:00Z")],
    ["failed", new Date("2020-01-01T00:00:00Z")],
  ])("never reuses %s keys; expiry is cleanup-only", async (status, expiresAt) => {
    claimCurrent({ status: status.startsWith("pending") ? "pending" : "failed", expiresAt }, false);
    await expect(transitionCase(input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.findOwned).not.toHaveBeenCalled();
  });

  it("rejects stale state before CAS side effects", async () => {
    mocks.findOwned.mockResolvedValue(caseRow({ stateVersion: 2 }));
    await expect(transitionCase(input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.compareAndSwap).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
  });

  it("rejects a lost CAS race before audit/outbox", async () => {
    mocks.compareAndSwap.mockResolvedValue(false);
    await expect(transitionCase(input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it("rejects the transaction on audit failure and does not continue", async () => {
    mocks.appendAudit.mockRejectedValue(new Error("audit failure"));
    await expect(transitionCase(input)).rejects.toThrow("audit failure");
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("rejects the transaction on outbox failure and does not complete", async () => {
    mocks.appendOutbox.mockRejectedValue(new Error("outbox failure"));
    await expect(transitionCase(input)).rejects.toThrow("outbox failure");
    expect(mocks.appendAudit).toHaveBeenCalledOnce();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("rejects the transaction on completion CAS failure", async () => {
    mocks.complete.mockRejectedValue(new Error("completion lost pending ownership"));
    await expect(transitionCase(input)).rejects.toThrow("completion lost pending ownership");
    expect(mocks.appendAudit).toHaveBeenCalledOnce();
    expect(mocks.appendOutbox).toHaveBeenCalledOnce();
    expect(mocks.complete).toHaveBeenCalledOnce();
  });
});
