import {
  canonicalSerialize,
  sha256Hex,
  type CanonicalJsonValue,
} from "../questionnaire/canonicalJson";

function isPlainObject(value: unknown): value is Record<string, CanonicalJsonValue> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function decodeCanonicalReportPayload(value: unknown): CanonicalJsonValue | null {
  let decoded = value;
  if (typeof decoded === "string") {
    try {
      decoded = JSON.parse(decoded) as unknown;
    } catch {
      return null;
    }
  }
  if (!isPlainObject(decoded)) return null;
  try {
    canonicalSerialize(decoded);
  } catch {
    return null;
  }
  return decoded;
}

/**
 * Content hash contract: SHA-256 of the RFC8785-style canonical report object
 * after removing only `checksums.snapshotPayloadSha256`. The persisted payload
 * hash separately covers the complete canonical object including that value.
 */
export function reportContentSha256(payload: CanonicalJsonValue): string {
  const clone = JSON.parse(canonicalSerialize(payload)) as Record<string, CanonicalJsonValue>;
  const checksums = clone.checksums;
  if (!isPlainObject(checksums)) {
    throw new TypeError("Report checksums must be an object");
  }
  const mutableChecksums = { ...checksums } as Record<string, CanonicalJsonValue>;
  delete mutableChecksums.snapshotPayloadSha256;
  clone.checksums = mutableChecksums;
  return sha256Hex(canonicalSerialize(clone));
}

export function verifyReadyReportIntegrity(
  payloadValue: unknown,
  payloadHash: string | null,
  contentHash: string | null,
): CanonicalJsonValue | null {
  const payload = decodeCanonicalReportPayload(payloadValue);
  if (!payload || payloadHash === null || contentHash === null) return null;
  try {
    const completePayloadHash = sha256Hex(canonicalSerialize(payload));
    const computedContentHash = reportContentSha256(payload);
    const root = payload as Record<string, CanonicalJsonValue>;
    const checksums = root.checksums;
    if (!isPlainObject(checksums)) return null;
    return completePayloadHash === payloadHash &&
        computedContentHash === contentHash &&
        checksums.snapshotPayloadSha256 === contentHash
      ? payload
      : null;
  } catch {
    return null;
  }
}

export function isCanonicalJsonObject(
  value: CanonicalJsonValue,
): value is Readonly<Record<string, CanonicalJsonValue>> {
  return isPlainObject(value);
}
