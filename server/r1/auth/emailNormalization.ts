import { domainToASCII } from "node:url";

/**
 * Version marker for the deliberately conservative email canonicalization rules
 * in this module. Persist this value beside a normalized address if a future
 * schema needs to distinguish normalization policies.
 */
export const EMAIL_NORMALIZATION_VERSION = "v1" as const;

export type VersionedNormalizedEmail = Readonly<{
  value: string;
  version: typeof EMAIL_NORMALIZATION_VERSION;
}>;

export class InvalidEmailAddressError extends Error {
  constructor() {
    // Never interpolate the supplied address: callers may surface this error.
    super("Invalid email address");
    this.name = "InvalidEmailAddressError";
  }
}

const WHITESPACE = /\s/;
const FORMAT_CHARACTERS = new Set([0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]);
const ASCII_DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Normalizes an address under the R1 v1 policy.
 *
 * The local part is intentionally not case-folded or alias-rewritten. The
 * domain is converted to IDNA ASCII and lowercased only after it has passed a
 * hostname-like validation. This is not an RFC 5322 parser; its narrow policy
 * is intentional for an authentication identifier.
 */
export function normalizeEmail(input: string): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    hasForbiddenCharacters(input)
  ) {
    throw new InvalidEmailAddressError();
  }

  const firstAt = input.indexOf("@");
  if (
    firstAt <= 0 ||
    firstAt !== input.lastIndexOf("@") ||
    firstAt === input.length - 1
  ) {
    throw new InvalidEmailAddressError();
  }

  const localPart = input.slice(0, firstAt);
  const suppliedDomain = input.slice(firstAt + 1);
  if (!isPrintableAscii(localPart)) {
    throw new InvalidEmailAddressError();
  }

  const asciiDomain = domainToASCII(suppliedDomain).toLowerCase();
  if (!isValidIdnaAsciiDomain(asciiDomain)) {
    throw new InvalidEmailAddressError();
  }

  return `${localPart}@${asciiDomain}`;
}

/** A descriptive alias for consumers that prefer address-specific naming. */
export const normalizeEmailAddress = normalizeEmail;

/** Returns the normalized value together with the policy version that created it. */
export function normalizeEmailWithVersion(
  input: string
): VersionedNormalizedEmail {
  return Object.freeze({
    value: normalizeEmail(input),
    version: EMAIL_NORMALIZATION_VERSION,
  });
}

function hasForbiddenCharacters(value: string): boolean {
  if (WHITESPACE.test(value)) {
    return true;
  }

  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);
    if (
      codePoint <= 0x1f ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      FORMAT_CHARACTERS.has(codePoint)
    ) {
      return true;
    }
  }

  return false;
}

function isPrintableAscii(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);
    if (codePoint < 0x21 || codePoint > 0x7e) {
      return false;
    }
  }
  return true;
}

function isValidIdnaAsciiDomain(domain: string): boolean {
  if (domain.length === 0 || domain.length > 253 || !isAscii(domain)) {
    return false;
  }

  const labels = domain.split(".");
  return (
    labels.length > 0 && labels.every(label => ASCII_DOMAIN_LABEL.test(label))
  );
}

function isAscii(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 0x7f) {
      return false;
    }
  }
  return true;
}
