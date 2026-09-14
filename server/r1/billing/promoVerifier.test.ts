import { describe, expect, it } from "vitest";
import { verifyPromoValue } from "./promoVerifier";

const verifier = "promo-verifier-unit-test-value-32-bytes";
const pepper = "promo-verifier-unit-test-pepper-32-bytes";

describe("promo verifier", () => {
  it("accepts only the configured verifier under the dedicated pepper", () => {
    expect(verifyPromoValue(verifier, verifier, pepper)).toBe(true);
    expect(verifyPromoValue("wrong-value", verifier, pepper)).toBe(false);
    expect(verifyPromoValue(verifier, verifier, `${pepper}-different`)).toBe(true);
  });

  it.each(["", "x".repeat(513)])("rejects invalid incoming values", value => {
    expect(verifyPromoValue(value, verifier, pepper)).toBe(false);
  });

  it("fails closed for weak server configuration", () => {
    expect(verifyPromoValue(verifier, "short", pepper)).toBe(false);
    expect(verifyPromoValue(verifier, verifier, "short")).toBe(false);
  });
});
