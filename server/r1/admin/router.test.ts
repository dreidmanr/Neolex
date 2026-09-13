import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../../_core/context";

const mocks = vi.hoisted(() => ({ listCases: vi.fn(), appendAudit: vi.fn() }));

vi.mock("../database", () => ({ requireR1Database: vi.fn().mockResolvedValue({}) }));
vi.mock("../cases/caseRepository", () => ({ listCasesForAdmin: mocks.listCases }));
vi.mock("../audit/auditRepository", () => ({ appendAuditEvent: mocks.appendAudit }));

import { pilotAdminRouter } from "./router";

const originalEnv = { ...process.env };
const now = new Date("2026-01-01T00:00:00Z");

function context(role: "admin" | "user" | null): TrpcContext {
  return {
    user: role === null ? null : ({ id: 7, role } as TrpcContext["user"]),
    customer: null,
    requestId: "request_admin_router_test_01",
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function enableSyntheticHarness() {
  process.env.NODE_ENV = "test";
  process.env.LEXY_R1_SYNTHETIC_TEST_MODE = "true";
  process.env.LEXY_R1_TEST_IDENTITY = "r1-harness";
  process.env.LEXY_R1_DATABASE_CLASS = "disposable_test";
  process.env.DATABASE_URL = "mysql://test:test@localhost/lexy_r1_test_admin";
  process.env.LEXY_CUSTOMER_SESSION_SECRET = "customer-session-secret-32-bytes-minimum";
  process.env.JWT_SECRET = "separate-oauth-secret-32-bytes-minimum";
}

describe("pilotAdmin.diagnostics.list", () => {
  beforeEach(() => {
    enableSyntheticHarness();
    mocks.listCases.mockResolvedValue([{
      publicId: "case_public_identifier_01",
      status: "draft",
      tier: "base_diagnostic",
      riskCategory: null,
      escalationStatus: null,
      reportStatus: null,
      createdAt: now,
      updatedAt: now,
    }]);
    mocks.appendAudit.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it.each([false, true])("audits role denial and never grants when audit fails=%s", async auditFails => {
    if (auditFails) mocks.appendAudit.mockRejectedValue(new Error("audit unavailable"));
    const caller = pilotAdminRouter.createCaller(context("user"));
    await expect(caller.diagnostics.list({ purposeCode: "support", limit: 10 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.appendAudit).toHaveBeenCalledWith({}, expect.objectContaining({
      eventType: "diagnostic_case.admin_role_denied",
      reasonCode: "admin_role_required",
      requestId: "request_admin_router_test_01",
    }));
    expect(mocks.listCases).not.toHaveBeenCalled();
  });

  it.each([false, true])("audits purpose denial and preserves safe denial when audit fails=%s", async auditFails => {
    if (auditFails) mocks.appendAudit.mockRejectedValue(new Error("audit unavailable"));
    const caller = pilotAdminRouter.createCaller(context("admin"));
    await expect(caller.diagnostics.list({ purposeCode: "curiosity", limit: 10 })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Approved administrative purpose is required",
    });
    expect(mocks.appendAudit).toHaveBeenCalledWith({}, expect.objectContaining({
      eventType: "diagnostic_case.admin_purpose_denied",
      reasonCode: "approved_purpose_required",
      requestId: "request_admin_router_test_01",
    }));
    expect(JSON.stringify(mocks.appendAudit.mock.calls)).not.toContain("curiosity");
    expect(mocks.listCases).not.toHaveBeenCalled();
  });

  it("returns minimal fields plus requestId and audits an allowlisted read", async () => {
    const result = await pilotAdminRouter.createCaller(context("admin")).diagnostics.list({
      purposeCode: "pilot_quality_review",
      limit: 10,
    });
    expect(result.requestId).toBe("request_admin_router_test_01");
    expect(result.items[0]).toEqual({
      publicId: "case_public_identifier_01",
      status: "draft",
      tier: "base_diagnostic",
      riskCategory: null,
      escalationStatus: null,
      reportStatus: null,
      createdAt: now,
      updatedAt: now,
    });
    expect(result.items[0]).not.toHaveProperty("id");
    expect(result.items[0]).not.toHaveProperty("customerAccountId");
    expect(mocks.appendAudit).toHaveBeenCalledWith({}, expect.objectContaining({
      eventType: "diagnostic_case.admin_listed",
      requestId: "request_admin_router_test_01",
    }));
  });
});
