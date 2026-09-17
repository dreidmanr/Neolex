import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  claim: vi.fn(),
  complete: vi.fn(),
  insertCase: vi.fn(),
  appendAudit: vi.fn(),
  appendOutbox: vi.fn(),
  assertSynthetic: vi.fn(),
}));

vi.mock("../../_core/env", () => ({
  ENV: { customerSessionSecret: "test-secret" },
}));
vi.mock("../database", () => ({
  requireR1Database: vi.fn().mockResolvedValue({ transaction: mocks.transaction }),
}));
vi.mock("../idempotency/idempotencyRepository", () => ({
  claimIdempotencyRecord: mocks.claim,
  completeIdempotencyRecord: mocks.complete,
}));
vi.mock("../audit/auditRepository", () => ({
  appendAuditEvent: mocks.appendAudit,
}));
vi.mock("../outbox/outboxRepository", () => ({
  appendOutboxEvent: mocks.appendOutbox,
}));
vi.mock("../releaseGate", () => ({
  assertSyntheticTestAllowed: mocks.assertSynthetic,
}));
vi.mock("./caseRepository", () => ({
  insertCase: mocks.insertCase,
  toCaseDto: (row: Record<string, unknown>) => ({
    publicId: row.publicId,
    status: row.status,
    serviceTier: row.serviceTier,
    stateVersion: row.stateVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }),
}));

import { createSyntheticCase } from "./caseService";

const tx = { marker: "transaction" };
const input = {
  customerAccountId: "acct-a",
  customerSessionId: "sess-a",
  serviceTier: "lexy-advanced-diagnostic" as const,
  idempotencyKey: "raw-key-must-not-persist",
  requestId: "request_case_service_test_01",
};

function idempotencyRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "idem-id",
    customerAccountId: "acct-a",
    scope: "pilot.case.create_synthetic",
    idempotencyKey: "hashed-key",
    requestHash: "will-be-replaced",
    status: "pending",
    responseJson: null,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("createSyntheticCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async callback => callback(tx));
    mocks.insertCase.mockResolvedValue(undefined);
    mocks.appendAudit.mockResolvedValue(undefined);
    mocks.appendOutbox.mockResolvedValue(undefined);
    mocks.complete.mockResolvedValue(undefined);
  });

  it("writes idempotency, case, audit, outbox, and completed response in one transaction", async () => {
    mocks.claim.mockImplementation(async (_tx, identity, requestHash) => ({
      record: idempotencyRecord({
        idempotencyKey: identity.keyHash,
        requestHash,
      }),
      claimed: true,
    }));

    const result = await createSyntheticCase(input);

    expect(mocks.assertSynthetic).toHaveBeenCalledOnce();
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.insertCase).toHaveBeenCalledOnce();
    expect(mocks.appendAudit).toHaveBeenCalledOnce();
    expect(mocks.appendOutbox).toHaveBeenCalledOnce();
    expect(mocks.complete).toHaveBeenCalledOnce();
    expect(result).not.toHaveProperty("id");
    const identity = mocks.claim.mock.calls[0]?.[1];
    expect(identity.keyHash).not.toBe(input.idempotencyKey);
    expect(JSON.stringify(mocks.claim.mock.calls)).not.toContain(input.idempotencyKey);
  });

  it("returns a completed response without creating duplicate side effects", async () => {
    mocks.claim.mockImplementation(async (_tx, identity, requestHash) => ({
      record: idempotencyRecord({
        idempotencyKey: identity.keyHash,
        requestHash,
        status: "completed",
        responseJson: {
          publicId: "existing_case_public_01",
          status: "draft",
          serviceTier: "lexy-advanced-diagnostic",
          stateVersion: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
      claimed: false,
    }));

    const result = await createSyntheticCase(input);
    expect(result.publicId).toBe("existing_case_public_01");
    expect(mocks.insertCase).not.toHaveBeenCalled();
    expect(mocks.appendAudit).not.toHaveBeenCalled();
    expect(mocks.appendOutbox).not.toHaveBeenCalled();
  });

  it("returns conflict when the same key has a different request hash", async () => {
    mocks.claim.mockResolvedValue({
      record: idempotencyRecord({ requestHash: "different-request-hash" }),
      claimed: false,
    });

    await expect(createSyntheticCase(input)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(mocks.insertCase).not.toHaveBeenCalled();
  });
});
