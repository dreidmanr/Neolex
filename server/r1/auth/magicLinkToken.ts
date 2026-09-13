import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** A magic-link verifier is exactly 256 bits encoded without base64 padding. */
export const MAGIC_LINK_VERIFIER_BYTES = 32;
export const MAGIC_LINK_VERIFIER_ENCODING = "base64url" as const;
export const MAGIC_LINK_VERIFIER_LENGTH = 43;
export const MAGIC_LINK_SECRET_MINIMUM_LENGTH = 32;

const VERIFIER_DERIVATION_DOMAIN = "lexy:r1:magic-link:verifier:v1\u0000";
const VERIFIER_HASH_DOMAIN = "lexy:r1:magic-link:verifier-hash:v1\u0000";
const SHA256_HEX = /^[a-f0-9]{64}$/;

export type MagicLinkVerifierMetadata = Readonly<{
  byteLength: typeof MAGIC_LINK_VERIFIER_BYTES;
  encoding: typeof MAGIC_LINK_VERIFIER_ENCODING;
  length: typeof MAGIC_LINK_VERIFIER_LENGTH;
}>;

export class InvalidMagicLinkSecretError extends Error {
  constructor() {
    // Do not include the candidate secret in an error that might be surfaced.
    super(
      "A dedicated magic-link secret of at least 32 characters is required"
    );
    this.name = "InvalidMagicLinkSecretError";
  }
}

/**
 * Produces a 256-bit random verifier. The returned value is intended to be
 * short-lived/transient and must not be logged or persisted in raw form.
 */
export function generateMagicLinkToken(): string {
  return randomBytes(MAGIC_LINK_VERIFIER_BYTES).toString(
    MAGIC_LINK_VERIFIER_ENCODING
  );
}

/** Explicit alias for code that names the sensitive value a raw verifier. */
export const generateMagicLinkRawVerifier = generateMagicLinkToken;

/**
 * Returns non-sensitive fixed facts about generated values. It intentionally
 * carries no generated verifier, so it is safe to serialize for diagnostics.
 */
export function getMagicLinkVerifierMetadata(): MagicLinkVerifierMetadata {
  return Object.freeze({
    byteLength: MAGIC_LINK_VERIFIER_BYTES,
    encoding: MAGIC_LINK_VERIFIER_ENCODING,
    length: MAGIC_LINK_VERIFIER_LENGTH,
  });
}

/**
 * Derives the URL fragment verifier for a public opaque token id. A service may
 * create and persist its own opaque id, then derive this value only in memory.
 */
export function deriveMagicLinkVerifier(
  tokenId: string,
  secret: string
): string {
  assertOpaqueTokenId(tokenId);
  assertMagicLinkSecret(secret);

  return createHmac("sha256", secret)
    .update(VERIFIER_DERIVATION_DOMAIN)
    .update(tokenId, "utf8")
    .digest(MAGIC_LINK_VERIFIER_ENCODING);
}

/**
 * Produces the value suitable for storage. The distinct HMAC domain prevents a
 * stored hash from being interchangeable with a derived URL verifier.
 */
export function hashMagicLinkVerifier(
  rawVerifier: string,
  secret: string
): string {
  assertRawVerifier(rawVerifier);
  assertMagicLinkSecret(secret);

  return createHmac("sha256", secret)
    .update(VERIFIER_HASH_DOMAIN)
    .update(rawVerifier, "utf8")
    .digest("hex");
}

/**
 * Compares a candidate to a stored SHA-256 HMAC without a short-circuiting
 * value comparison. Invalid candidate/hash encodings return false; an invalid
 * secret remains a configuration error and is rejected.
 */
export function verifyMagicLinkVerifier(
  rawVerifier: string,
  storedHash: string,
  secret: string
): boolean {
  assertMagicLinkSecret(secret);

  if (
    typeof rawVerifier !== "string" ||
    rawVerifier.length === 0 ||
    !isStoredHash(storedHash)
  ) {
    return false;
  }

  const expectedHash = hashMagicLinkVerifier(rawVerifier, secret);
  return timingSafeEqual(
    Buffer.from(expectedHash, "hex"),
    Buffer.from(storedHash, "hex")
  );
}

/** Rejects absent or weak configuration without ever exposing the candidate. */
export function assertMagicLinkSecret(
  secret: string
): asserts secret is string {
  if (
    typeof secret !== "string" ||
    secret.length < MAGIC_LINK_SECRET_MINIMUM_LENGTH
  ) {
    throw new InvalidMagicLinkSecretError();
  }
}

function assertOpaqueTokenId(tokenId: string): asserts tokenId is string {
  if (typeof tokenId !== "string" || tokenId.length === 0) {
    throw new Error("A magic-link token id is required");
  }
}

function assertRawVerifier(rawVerifier: string): asserts rawVerifier is string {
  if (typeof rawVerifier !== "string" || rawVerifier.length === 0) {
    throw new Error("A magic-link verifier is required");
  }
}

function isStoredHash(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX.test(value);
}
