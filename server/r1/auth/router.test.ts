import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../../_core/context";
import {
  CUSTOMER_SESSION_COOKIE_NAME,
  getCustomerSessionClearCookieOptions,
} from "../../_core/cookies";

const mocks = vi.hoisted(() => ({
  requestMagicLink: vi.fn(),
  revokeCurrentCustomerSession: vi.fn(),
}));

vi.mock("./magicLinkService", () => ({
  requestMagicLink: mocks.requestMagicLink,
}));
vi.mock("./customerSessionService", () => ({
  revokeCurrentCustomerSession: mocks.revokeCurrentCustomerSession,
}));

import { customerAuthRouter } from "./router";

const originalEnv = { ...process.env };

function context(input: {
  user?: TrpcContext["user"];
  customer?: TrpcContext["customer"];
} = {}): TrpcContext {
  return {
    user: input.user ?? null,
    customer: input.customer ?? null,
    requestId: "request_auth_router_test_01",
    req: { headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("customer auth router", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.LEXY_R1_SYNTHETIC_TEST_MODE = "true";
    process.env.LEXY_R1_TEST_IDENTITY = "r1-harness";
    process.env.LEXY_R1_DATABASE_CLASS = "disposable_test";
    process.env.DATABASE_URL = "mysql://test:test@localhost/lexy_r1_test_auth_router";
    process.env.LEXY_CUSTOMER_SESSION_SECRET = "customer-session-secret-32-bytes-minimum";
    process.env.JWT_SECRET = "separate-oauth-secret-32-bytes-minimum";
    mocks.requestMagicLink.mockResolvedValue({ accepted: true });
    mocks.revokeCurrentCustomerSession.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it.each(["person@example.test", "not an email", ""]) (
    "always returns the exact neutral request response for a valid policy input %j",
    async email => {
      const ctx = context();
      await expect(
        customerAuthRouter.createCaller(ctx).requestMagicLink({ email }),
      ).resolves.toEqual({ accepted: true });
      expect(mocks.requestMagicLink).toHaveBeenCalledWith(email, ctx.requestId);
    },
  );

  it("enforces only the input length policy at the router boundary", async () => {
    const caller = customerAuthRouter.createCaller(context());
    await expect(caller.requestMagicLink({ email: "x".repeat(255) })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(mocks.requestMagicLink).not.toHaveBeenCalled();
  });

  it("does not accept OAuth identity in place of a customer session", async () => {
    const caller = customerAuthRouter.createCaller(context({
      user: { id: 1, role: "admin" } as TrpcContext["user"],
    }));
    await expect(caller.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.logout()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("fails closed for auth.me when a customer exists but the pilot gate is closed", async () => {
    process.env.LEXY_R1_SYNTHETIC_TEST_MODE = "false";
    const caller = customerAuthRouter.createCaller(context({
      user: { id: 1, role: "admin" } as TrpcContext["user"],
      customer: { accountId: "account-1", sessionId: "session-1" },
    }));

    await expect(caller.me()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Pilot is unavailable",
    });
    expect(mocks.revokeCurrentCustomerSession).not.toHaveBeenCalled();
  });

  it("permits the exact synthetic gate and revokes only the current own session", async () => {
    const ctx = context({ customer: { accountId: "account-1", sessionId: "session-1" } });
    const caller = customerAuthRouter.createCaller(ctx);

    await expect(caller.me()).resolves.toEqual({ authenticated: true });
    await expect(caller.logout()).resolves.toEqual({ authenticated: false });
    expect(mocks.revokeCurrentCustomerSession).toHaveBeenCalledWith({
      accountId: "account-1",
      sessionId: "session-1",
      requestId: ctx.requestId,
    });
    expect(ctx.res.clearCookie).toHaveBeenCalledWith(
      CUSTOMER_SESSION_COOKIE_NAME,
      getCustomerSessionClearCookieOptions(),
    );
  });

  it("still clears the exact customer cookie if persistence fails", async () => {
    mocks.revokeCurrentCustomerSession.mockRejectedValue(new Error("private persistence detail"));
    const ctx = context({ customer: { accountId: "account-1", sessionId: "session-1" } });

    await expect(customerAuthRouter.createCaller(ctx).logout()).rejects.toThrow();
    expect(ctx.res.clearCookie).toHaveBeenCalledWith(
      CUSTOMER_SESSION_COOKIE_NAME,
      getCustomerSessionClearCookieOptions(),
    );
  });
});
