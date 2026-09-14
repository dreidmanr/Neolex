import { createHash } from "node:crypto";

export type CanonicalJsonPrimitive = string | number | boolean | null;
export type CanonicalJsonValue =
  | CanonicalJsonPrimitive
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

function serializeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new TypeError("Canonical JSON does not support non-finite numbers");
  }
  return JSON.stringify(value);
}

/**
 * Deterministic JSON serialization for JSON-compatible values. Object keys are
 * sorted recursively; arrays retain their semantic order; unsupported values
 * and non-finite numbers fail closed.
 */
export function canonicalSerialize(value: CanonicalJsonValue): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") return serializeNumber(value);
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalSerialize(item)).join(",")}]`;
  }
  if (typeof value !== "object") {
    throw new TypeError("Value is not JSON-compatible");
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Canonical JSON only supports plain objects");
  }

  const objectValue = value as { readonly [key: string]: CanonicalJsonValue };
  const entries = Object.keys(objectValue)
    .sort()
    .map(key => {
      const child = objectValue[key];
      if (child === undefined) {
        throw new TypeError("Canonical JSON does not support undefined");
      }
      return `${JSON.stringify(key)}:${canonicalSerialize(child)}`;
    });
  return `{${entries.join(",")}}`;
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalSha256(value: CanonicalJsonValue): string {
  return sha256Hex(canonicalSerialize(value));
}
