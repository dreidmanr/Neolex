import { nanoid } from "nanoid";

const KIND_PATTERN = /^[a-z][a-z0-9_]{1,15}$/;

/**
 * Creates an opaque identifier that is safe for R1 event envelopes.
 * The stable alphanumeric prefix avoids nanoid's leading `-`/`_` edge case.
 */
export function newR1Id(kind: string, size = 20): string {
  if (!KIND_PATTERN.test(kind) || size < 12 || size > 40) {
    throw new Error("Invalid R1 identifier configuration");
  }
  return `${kind}_${nanoid(size)}`;
}
