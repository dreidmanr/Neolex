import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  findSession: vi.fn(),
}));

vi.mock("../_core/env", () => ({
  ENV: { customerSessionSecret: "customer-secret" },
}));
vi.mock("../_core/sdk", () => ({
  sdk: { authenticateRequest: mocks.authenticateRequest },
}));
vi.mock("./auth/customerSessionRepository", () => ({
  findActiveCustomerSessionByTokenHash: mocks.findSession,
}));

import {
  createContext,
  CUSTOMER_SESSION_COOKIE_NAME,
} from "../_core/context";
import type { TrpcContext } from "../_core/context";

function options(headers: Record<string, string>) {
  return {
    req: { headers } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("customer authentication separation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateRequest.mockResolvedValue({ id: 7, role: "admin" });
    mocks.findSession.mockResolvedValue({ accountId: "acct-1", sessionId: "sess-1" });
  });

  it("does not turn Authorization or an OAuth user into a customer", async () => {
    const ctx = await createContext(options({
      authorization: "Bearer legacy-token",
      "x-request-id": "client-controlled-request-id",
    }));
    expect(ctx.user).toMatchObject({ id: 7, role: "admin" });
    expect(ctx.customer).toBeNull();
    expect(ctx.requestId).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(ctx.requestId).not.toBe("client-controlled-request-id");
    expect(mocks.findSession).not.toHaveBeenCalled();
  });

  it("reads only the dedicated cookie and passes only its HMAC to persistence", async () => {
    const raw = "raw-customer-credential";
    const expectedHash = createHmac("sha256", "customer-secret")
      .update(raw)
      .digest("hex");
    const ctx = await createContext(
      options({
        authorization: "Bearer ignored",
        cookie: `app_session_id=admin; ${CUSTOMER_SESSION_COOKIE_NAME}=${raw}`,
      }),
    );
    expect(mocks.findSession).toHaveBeenCalledWith(expectedHash);
    expect(mocks.findSession).not.toHaveBeenCalledWith(raw);
    expect(ctx.customer).toEqual({ accountId: "acct-1", sessionId: "sess-1" });
  });
});
