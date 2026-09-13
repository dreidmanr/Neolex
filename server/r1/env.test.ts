import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe("R1 customer session secret separation", () => {
  it("does not fall back to JWT_SECRET", async () => {
    process.env.JWT_SECRET = "oauth-secret-that-must-not-authenticate-customers";
    delete process.env.LEXY_CUSTOMER_SESSION_SECRET;
    vi.resetModules();
    const { ENV } = await import("../_core/env");
    expect(ENV.cookieSecret).toBe(process.env.JWT_SECRET);
    expect(ENV.customerSessionSecret).toBe("");
  });

  it("uses only the dedicated customer secret", async () => {
    process.env.JWT_SECRET = "oauth-secret";
    process.env.LEXY_CUSTOMER_SESSION_SECRET = "dedicated-customer-secret";
    vi.resetModules();
    const { ENV } = await import("../_core/env");
    expect(ENV.customerSessionSecret).toBe("dedicated-customer-secret");
  });
});
