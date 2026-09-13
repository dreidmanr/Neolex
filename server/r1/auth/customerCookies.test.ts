import { describe, expect, it } from "vitest";
import {
  CUSTOMER_SESSION_COOKIE_NAME,
  getCustomerSessionClearCookieOptions,
  getCustomerSessionCookieOptions,
} from "../../_core/cookies";

describe("customer session cookies", () => {
  it("uses a host-only secure HttpOnly SameSite=Lax root cookie", () => {
    const expiresAt = new Date("2026-01-01T08:00:00.000Z");
    expect(CUSTOMER_SESSION_COOKIE_NAME).toBe("__Host-lexy-customer-session");
    expect(getCustomerSessionCookieOptions(expiresAt)).toEqual({
      expires: expiresAt,
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
    expect(getCustomerSessionCookieOptions(expiresAt)).not.toHaveProperty("domain");
  });

  it("clears with exact security and scope parity", () => {
    const clear = getCustomerSessionClearCookieOptions();
    const set = getCustomerSessionCookieOptions(new Date("2026-01-01T08:00:00.000Z"));
    expect(clear).toEqual({
      ...set,
      expires: new Date(0),
    });
  });
});
