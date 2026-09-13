import { describe, expect, it } from "vitest";
import {
  deriveMagicLinkVerifier,
  generateMagicLinkToken,
  getMagicLinkVerifierMetadata,
  hashMagicLinkVerifier,
  InvalidMagicLinkSecretError,
  MAGIC_LINK_VERIFIER_BYTES,
  verifyMagicLinkVerifier,
} from "./magicLinkToken";

const SECRET_A = "magic-link-secret-A-must-have-at-least-32-chars";
const SECRET_B = "magic-link-secret-B-must-have-at-least-32-chars";
const RAW_VERIFIER = "sensitive-raw-verifier-value";

describe("R1 magic-link token primitives", () => {
  it("generates independent URL-safe base64url values representing 256 random bits", () => {
    const tokens = new Set(
      Array.from({ length: 32 }, () => generateMagicLinkToken())
    );

    expect(tokens).toHaveLength(32);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, "base64url")).toHaveLength(
        MAGIC_LINK_VERIFIER_BYTES
      );
    }
  });

  it("exposes only non-sensitive serialization-safe token metadata", () => {
    const raw = generateMagicLinkToken();
    const serialized = JSON.stringify(getMagicLinkVerifierMetadata());

    expect(serialized).not.toContain(raw);
    expect(getMagicLinkVerifierMetadata()).toEqual({
      byteLength: 32,
      encoding: "base64url",
      length: 43,
    });
  });

  it("derives deterministic verifiers that are bound to both opaque id and dedicated secret", () => {
    const first = deriveMagicLinkVerifier("ml_opaque_id_01", SECRET_A);

    expect(deriveMagicLinkVerifier("ml_opaque_id_01", SECRET_A)).toBe(first);
    expect(deriveMagicLinkVerifier("ml_opaque_id_02", SECRET_A)).not.toBe(
      first
    );
    expect(deriveMagicLinkVerifier("ml_opaque_id_01", SECRET_B)).not.toBe(
      first
    );
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("uses a distinct storage hash domain, never serializes raw input in hash output", () => {
    const hash = hashMagicLinkVerifier(RAW_VERIFIER, SECRET_A);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(RAW_VERIFIER);
    expect(hash).not.toBe(deriveMagicLinkVerifier(RAW_VERIFIER, SECRET_A));
  });

  it("accepts only the correct verifier and handles malformed stored values safely", () => {
    const hash = hashMagicLinkVerifier(RAW_VERIFIER, SECRET_A);

    expect(verifyMagicLinkVerifier(RAW_VERIFIER, hash, SECRET_A)).toBe(true);
    expect(
      verifyMagicLinkVerifier(`${RAW_VERIFIER}-wrong`, hash, SECRET_A)
    ).toBe(false);
    expect(
      verifyMagicLinkVerifier(RAW_VERIFIER, hash.replace(/^./, "0"), SECRET_A)
    ).toBe(false);
    expect(verifyMagicLinkVerifier(RAW_VERIFIER, "not-a-hash", SECRET_A)).toBe(
      false
    );
    expect(
      verifyMagicLinkVerifier(RAW_VERIFIER, "A".repeat(64), SECRET_A)
    ).toBe(false);
  });

  it.each(["", "short", "1234567890123456789012345678901", undefined])(
    "rejects missing or weak secrets without echoing them",
    secret => {
      expect(() =>
        deriveMagicLinkVerifier("opaque-id", secret as string)
      ).toThrow(InvalidMagicLinkSecretError);
      expect(() => hashMagicLinkVerifier("raw", secret as string)).toThrow(
        InvalidMagicLinkSecretError
      );
      expect(() =>
        verifyMagicLinkVerifier("raw", "0".repeat(64), secret as string)
      ).toThrow(InvalidMagicLinkSecretError);
    }
  );

  it("rejects absent token ids and verifier inputs", () => {
    expect(() => deriveMagicLinkVerifier("", SECRET_A)).toThrow("token id");
    expect(() => hashMagicLinkVerifier("", SECRET_A)).toThrow("verifier");
  });
});
