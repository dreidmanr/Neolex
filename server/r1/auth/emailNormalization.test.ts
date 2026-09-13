import { describe, expect, it } from "vitest";
import {
  EMAIL_NORMALIZATION_VERSION,
  InvalidEmailAddressError,
  normalizeEmail,
  normalizeEmailWithVersion,
} from "./emailNormalization";

describe("R1 email normalization v1", () => {
  it("preserves the ASCII local part verbatim and lowercases only the domain", () => {
    expect(normalizeEmail("Case.Sensitive+tag@ExAmPlE.COM")).toBe(
      "Case.Sensitive+tag@example.com"
    );
    expect(normalizeEmail("first.last+tag@EXAMPLE.COM")).toBe(
      "first.last+tag@example.com"
    );
  });

  it("converts a valid IDNA domain to its lower-case ASCII representation", () => {
    expect(normalizeEmail("User@BÜCHER.example")).toBe(
      "User@xn--bcher-kva.example"
    );
  });

  it("returns an explicit immutable normalization-policy version", () => {
    const normalized = normalizeEmailWithVersion("Local@EXAMPLE.COM");

    expect(normalized).toEqual({
      value: "Local@example.com",
      version: EMAIL_NORMALIZATION_VERSION,
    });
    expect(Object.isFrozen(normalized)).toBe(true);
  });

  it.each([
    "",
    "plain-address",
    "@example.com",
    "local@",
    "local@@example.com",
    "local@example@com",
    " local@example.com",
    "local@example.com ",
    "local part@example.com",
    "local\tpart@example.com",
    "local\npart@example.com",
    "local\u0000part@example.com",
    "local\u200Bpart@example.com",
    "üser@example.com",
    "user@example..com",
    "user@-example.com",
    "user@example-.com",
    "user@exa_mple.com",
  ])("rejects unsafe or malformed input without echoing it: %j", input => {
    expect(() => normalizeEmail(input)).toThrow(InvalidEmailAddressError);
    try {
      normalizeEmail(input);
    } catch (error) {
      if (input.length > 0) {
        expect((error as Error).message).not.toContain(input);
      }
    }
  });
});
