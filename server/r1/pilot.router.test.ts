import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const mocks = vi.hoisted(() => ({
  listOwnedCases: vi.fn(),
  findOwnedCaseByPublicId: vi.fn(),
  appendAudit: vi.fn(),
}));

vi.mock("./database", () => ({ requireR1Database: vi.fn().mockResolvedValue({}) }));
vi.mock("./cases/caseRepository", () => ({
  listOwnedCases: mocks.listOwnedCases,
  findOwnedCaseByPublicId: mocks.findOwnedCaseByPublicId,
  toCaseDto: (row: unknown) => row,
}));
vi.mock("./audit/auditRepository", () => ({ appendAuditEvent: mocks.appendAudit }));

import { pilotRouter } from "./cases/router";

const originalEnv = { ...process.env };
const caseDto = {
  publicId: "case_public_identifier_01",
  status: "draft" as const,
  serviceTier: "base_diagnostic",
  stateVersion: 1,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

function context(input: {
  user?: TrpcContext["user"];
  customer?: TrpcContext["customer"];
  authorization?: string;
} = {}): TrpcContext {
  return {
    user: input.user ?? null,
    customer: input.customer ?? null,
    requestId: "request_pilot_router_test_01",
    req: {
      headers: input.authorization ? { authorization: input.authorization } : {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function enableSyntheticHarness() {
  process.env.NODE_ENV = "test";
  process.env.LEXY_R1_SYNTHETIC_TEST_MODE = "true";
  process.env.LEXY_R1_TEST_IDENTITY = "r1-harness";
  process.env.LEXY_R1_DATABASE_CLASS = "disposable_test";
  process.env.DATABASE_URL = "mysql://test:test@localhost/lexy_r1_test_router";
  process.env.LEXY_CUSTOMER_SESSION_SECRET = "customer-session-secret-32-bytes-minimum";
  process.env.JWT_SECRET = "separate-oauth-secret-32-bytes-minimum";
  process.env.LEXY_R1_EMAIL_TRANSPORT = "test";
  process.env.LEXY_R1_MAGIC_LINK_SECRET = "router-magic-secret-material-32-bytes";
  process.env.LEXY_R1_EMAIL_IDENTITY_PEPPER = "router-identity-pepper-material-32-bytes";
  process.env.LEXY_R1_RATE_LIMIT_PEPPER = "router-rate-pepper-material-32-bytes";
  process.env.LEXY_R1_PAYMENT_PROVIDER = "disabled";
  process.env.LEXY_R1_PROMO_VERIFIER = "router-promo-verifier-material-32-bytes";
  process.env.LEXY_R1_PROMO_VERIFIER_PEPPER = "router-promo-pepper-material-32-bytes";
  process.env.LEXY_R1_PROMO_CAMPAIGN_ID = "router_test_campaign";
}

describe("pilot router", () => {
  beforeEach(() => {
    enableSyntheticHarness();
    mocks.listOwnedCases.mockResolvedValue([caseDto]);
    mocks.findOwnedCaseByPublicId.mockResolvedValue({
      ...caseDto,
      id: "internal-id",
      customerAccountId: "acct-a",
    });
    mocks.appendAudit.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it("rejects OAuth users and Authorization headers when no customer exists", async () => {
    const caller = pilotRouter.createCaller(context({
      user: { role: "admin" } as TrpcContext["user"],
      authorization: "Bearer ignored",
    }));
    await expect(caller.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.cases.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("returns a minimal auth projection and owner-scopes repository calls", async () => {
    const customer = { accountId: "acct-a", sessionId: "sess-a" };
    const caller = pilotRouter.createCaller(context({ customer }));
    await expect(caller.me()).resolves.toEqual({ authenticated: true });
    await expect(caller.cases.list()).resolves.toEqual([caseDto]);
    await expect(caller.cases.get({ publicId: caseDto.publicId })).resolves.toMatchObject({
      publicId: caseDto.publicId,
    });
    expect(mocks.listOwnedCases).toHaveBeenCalledWith({}, "acct-a");
    expect(mocks.findOwnedCaseByPublicId).toHaveBeenCalledWith({}, "acct-a", caseDto.publicId);
  });

  it("does not mount a public synthetic writer", () => {
    const caller = pilotRouter.createCaller(context({
      customer: { accountId: "acct-a", sessionId: "sess-a" },
    }));
    expect(caller.cases).not.toHaveProperty("createSynthetic");
  });

  it("exposes only the exact safe promo availability decision", async () => {
    await expect(pilotRouter.createCaller(context()).status()).resolves.toEqual({
      available: true,
      mode: "synthetic",
      promoAccessAvailable: true,
    });

    process.env.LEXY_R1_PAYMENT_PROVIDER = "provider";
    await expect(pilotRouter.createCaller(context()).status()).resolves.toEqual({
      available: true,
      mode: "synthetic",
      promoAccessAvailable: false,
    });
  });

  it.each([false, true])("returns neutral NOT_FOUND after owner miss when audit fails=%s", async auditFails => {
    mocks.findOwnedCaseByPublicId.mockResolvedValue(null);
    if (auditFails) mocks.appendAudit.mockRejectedValue(new Error("audit unavailable"));
    const caller = pilotRouter.createCaller(context({
      customer: { accountId: "acct-a", sessionId: "sess-a" },
    }));

    await expect(caller.cases.get({ publicId: "other_owner_public_id_01" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Resource not found",
    });
    expect(mocks.appendAudit).toHaveBeenCalledWith({}, {
      actorType: "customer_session",
      actorId: "sess-a",
      aggregateType: "diagnostic_case",
      aggregateId: "unresolved_case",
      eventType: "diagnostic_case.owner_access_denied",
      outcome: "denied",
      reasonCode: "owner_scope_miss",
      requestId: "request_pilot_router_test_01",
      privacySafeMetadata: { resourceClass: "diagnostic_case" },
    });
    expect(JSON.stringify(mocks.appendAudit.mock.calls)).not.toContain("other_owner_public_id_01");
  });

  it("reports the closed gate without exposing environment or hash detail", async () => {
    process.env.LEXY_R1_SYNTHETIC_TEST_MODE = "false";
    process.env.LEXY_R1_APPROVED_BUNDLE_HASH = "must-not-leak";
    const result = await pilotRouter.createCaller(context()).status();
    expect(result).toEqual({
      available: false,
      mode: "closed",
      promoAccessAvailable: false,
    });
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });
});
