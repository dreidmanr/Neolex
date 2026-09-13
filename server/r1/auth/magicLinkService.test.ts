import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertGate: vi.fn(),
  requireDb: vi.fn(),
  takeRateLimit: vi.fn(),
  findIdentity: vi.fn(),
  hasDedupe: vi.fn(),
  revoke: vi.fn(),
  insertToken: vi.fn(),
  insertDelivery: vi.fn(),
  appendAudit: vi.fn(),
  appendOutbox: vi.fn(),
  findConsumable: vi.fn(),
  insertSession: vi.fn(),
  consumeToken: vi.fn(),
}));

vi.mock("../../_core/env", () => ({
  ENV: {
    emailIdentityPepper: "email-pepper-unit-test-aaaaaaaaaaaaaaaa",
    rateLimitPepper: "rate-pepper-unit-test-bbbbbbbbbbbbbbbbb",
    magicLinkSecret: "magic-secret-unit-test-cccccccccccccccc",
  },
}));
vi.mock("../releaseGate", () => ({ assertMagicLinkTestAllowed: mocks.assertGate }));
vi.mock("../database", () => ({ requireR1Database: mocks.requireDb }));
vi.mock("./rateLimitStore", async importOriginal => ({
  ...(await importOriginal<typeof import("./rateLimitStore")>()),
  takeMagicLinkRateLimit: mocks.takeRateLimit,
}));
vi.mock("./customerAccountRepository", async importOriginal => ({
  ...(await importOriginal<typeof import("./customerAccountRepository")>()),
  findActiveEmailIdentityByHash: mocks.findIdentity,
}));
vi.mock("../email/emailDeliveryRepository", () => ({
  hasEmailDeliveryDedupeKey: mocks.hasDedupe,
  insertEmailDelivery: mocks.insertDelivery,
}));
vi.mock("./magicLinkRepository", () => ({
  revokeActiveMagicLinks: mocks.revoke,
  insertMagicLinkToken: mocks.insertToken,
  findConsumableMagicLinkByHash: mocks.findConsumable,
  consumeMagicLinkToken: mocks.consumeToken,
}));
vi.mock("./customerSessionService", () => ({ insertNewCustomerSession: mocks.insertSession }));
vi.mock("../audit/auditRepository", () => ({ appendAuditEvent: mocks.appendAudit }));
vi.mock("../outbox/outboxRepository", () => ({ appendOutboxEvent: mocks.appendOutbox }));

import { consumeMagicLink, requestMagicLink } from "./magicLinkService";
import { deriveMagicLinkVerifier, hashMagicLinkVerifier } from "./magicLinkToken";

const tx = { unit: "transaction" };
const now = new Date("2026-01-01T00:01:00.000Z");
const requestId = "request_magic_link_unit_01";
const transaction = vi.fn(async (callback: (executor: unknown) => unknown) => callback(tx));

describe("magicLinkService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireDb.mockResolvedValue({ transaction });
    mocks.takeRateLimit.mockResolvedValue({
      allowed: true,
      count: 1,
      windowStartedAt: new Date("2026-01-01T00:00:00.000Z"),
      windowMillis: Date.parse("2026-01-01T00:00:00.000Z"),
    });
    mocks.findIdentity.mockResolvedValue({
      account: { id: "account-1", status: "active" },
      identity: { id: "identity-1", status: "active" },
    });
    mocks.hasDedupe.mockResolvedValue(false);
    mocks.revoke.mockResolvedValue(undefined);
    mocks.insertToken.mockResolvedValue(undefined);
    mocks.insertDelivery.mockResolvedValue(undefined);
    mocks.appendAudit.mockResolvedValue(undefined);
    mocks.appendOutbox.mockResolvedValue(undefined);
  });

  it.each(["", "not-an-email", "unknown@example.test"]) (
    "returns the same accepted response without public auto-provision for %j",
    async email => {
      if (email === "unknown@example.test") mocks.findIdentity.mockResolvedValue(null);
      await expect(requestMagicLink(email, requestId, now)).resolves.toEqual({ accepted: true });
      expect(JSON.stringify(await requestMagicLink(email, requestId, now))).toBe('{"accepted":true}');
      expect(mocks.insertToken).not.toHaveBeenCalled();
    },
  );

  it("checks deterministic delivery dedupe before revoking or issuing", async () => {
    mocks.hasDedupe.mockResolvedValue(true);

    await expect(requestMagicLink("known@example.test", requestId, now)).resolves.toEqual({
      accepted: true,
    });
    expect(mocks.hasDedupe).toHaveBeenCalledWith(
      tx,
      `magic-link-delivery:identity-1:${Date.parse("2026-01-01T00:00:00.000Z")}:v1`,
    );
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.insertToken).not.toHaveBeenCalled();
    expect(mocks.insertDelivery).not.toHaveBeenCalled();
  });

  it("keeps persistence/configuration failures neutral after the explicit gate", async () => {
    mocks.requireDb.mockRejectedValue(new Error("private persistence endpoint"));
    const result = await requestMagicLink("known@example.test", requestId, now);
    expect(result).toEqual({ accepted: true });
    expect(JSON.stringify(result)).not.toContain("persistence");
  });

  it("keeps the gate failure as the only request precondition error", async () => {
    mocks.assertGate.mockImplementationOnce(() => {
      throw new Error("Pilot is unavailable");
    });
    await expect(requestMagicLink("known@example.test", requestId, now)).rejects.toThrow(
      "Pilot is unavailable",
    );
    expect(mocks.requireDb).not.toHaveBeenCalled();
  });

  it("inserts a session inside the transaction then forces rollback on a consume race loser", async () => {
    const tokenId = "magic-token-1";
    const rawToken = deriveMagicLinkVerifier(tokenId, "magic-secret-unit-test-cccccccccccccccc");
    mocks.findConsumable.mockResolvedValue({
      accountId: "account-1",
      token: {
        id: tokenId,
        tokenHash: hashMagicLinkVerifier(rawToken, "magic-secret-unit-test-cccccccccccccccc"),
        tokenKeyVersion: 1,
        correlationId: "correlation-1",
      },
    });
    mocks.insertSession.mockResolvedValue({
      id: "session-1",
      rawToken: "raw-session-token",
      expiresAt: new Date(now.getTime() + 8 * 60 * 60 * 1000),
    });
    mocks.consumeToken.mockResolvedValue(false);

    await expect(consumeMagicLink(rawToken, requestId, now)).resolves.toEqual({ consumed: false });
    expect(mocks.insertSession).toHaveBeenCalledWith(tx, "account-1", now);
    expect(mocks.consumeToken).toHaveBeenCalledWith(tx, {
      tokenId,
      sessionId: "session-1",
      now,
    });
    expect(mocks.appendAudit).not.toHaveBeenCalled();
  });
});
