import { describe, expect, it } from "vitest";
import { isPromoAccessTestAllowed } from "./releaseGate";

const valid = {
  NODE_ENV: "test", LEXY_R1_SYNTHETIC_TEST_MODE: "true", LEXY_R1_TEST_IDENTITY: "r1-harness",
  LEXY_R1_DATABASE_CLASS: "disposable_test", DATABASE_URL: "mysql://u:p@localhost/lexy_r1_test_gate",
  LEXY_CUSTOMER_SESSION_SECRET: "customer-session-secret-32-bytes-minimum",
  JWT_SECRET: "oauth-authority-secret-32-bytes-minimum",
  LEXY_R1_EMAIL_TRANSPORT: "test", LEXY_R1_MAGIC_LINK_SECRET: "magic-secret-material-32-bytes-minimum",
  LEXY_R1_EMAIL_IDENTITY_PEPPER: "identity-pepper-material-32-bytes-minimum",
  LEXY_R1_RATE_LIMIT_PEPPER: "rate-pepper-material-32-bytes-minimum",
  LEXY_R1_PAYMENT_PROVIDER: "disabled", LEXY_R1_PROMO_VERIFIER: "promo-verifier-value-32-bytes-minimum",
  LEXY_R1_PROMO_VERIFIER_PEPPER: "promo-verifier-pepper-32-bytes-minimum",
  LEXY_R1_PROMO_CAMPAIGN_ID: "r1_test_campaign",
} satisfies NodeJS.ProcessEnv;

describe("R1 promo access gate", () => {
  it("accepts only the complete synthetic/Magic Link profile with provider disabled", () => {
    expect(isPromoAccessTestAllowed(valid)).toBe(true);
  });
  it.each([undefined, "", "DISABLED", "test", "none", "provider"])("rejects provider %j", provider => {
    expect(isPromoAccessTestAllowed({ ...valid, LEXY_R1_PAYMENT_PROVIDER: provider })).toBe(false);
  });
  it.each(["JWT_SECRET", "LEXY_CUSTOMER_SESSION_SECRET", "LEXY_R1_MAGIC_LINK_SECRET", "LEXY_R1_EMAIL_IDENTITY_PEPPER", "LEXY_R1_RATE_LIMIT_PEPPER"] as const)("rejects verifier reuse with %s", name => {
    expect(isPromoAccessTestAllowed({ ...valid, LEXY_R1_PROMO_VERIFIER: valid[name] })).toBe(false);
  });
  it.each(["JWT_SECRET", "LEXY_CUSTOMER_SESSION_SECRET", "LEXY_R1_MAGIC_LINK_SECRET", "LEXY_R1_EMAIL_IDENTITY_PEPPER", "LEXY_R1_RATE_LIMIT_PEPPER"] as const)("rejects pepper reuse with %s", name => {
    expect(isPromoAccessTestAllowed({ ...valid, LEXY_R1_PROMO_VERIFIER_PEPPER: valid[name] })).toBe(false);
  });
  it.each([
    { LEXY_R1_PROMO_VERIFIER: undefined }, { LEXY_R1_PROMO_VERIFIER: "short" },
    { LEXY_R1_PROMO_VERIFIER_PEPPER: undefined }, { LEXY_R1_PROMO_VERIFIER_PEPPER: "short" },
    { LEXY_R1_PROMO_VERIFIER: valid.LEXY_R1_PROMO_VERIFIER_PEPPER },
    { LEXY_R1_PROMO_CAMPAIGN_ID: undefined }, { LEXY_R1_PROMO_CAMPAIGN_ID: "bad/value" },
    { LEXY_R1_EMAIL_TRANSPORT: "smtp" }, { LEXY_R1_SYNTHETIC_TEST_MODE: "false" },
  ])("rejects missing, reused, unsafe, and non-Magic-Link profiles %#", override => {
    expect(isPromoAccessTestAllowed({ ...valid, ...override })).toBe(false);
  });
});
