import { and, eq, isNull, lt, or } from "drizzle-orm";
import { createHash } from "node:crypto";
import { r1DocumentManifests, r1DocumentTextArtifacts, type R1DocumentTextArtifact } from "../../../drizzle/schema";
import { storageGetSignedUrl, storagePut } from "../../storage";
import type { R1Database } from "../database";
import { extractDocumentText, type DocumentExtractionResult } from "./documentExtractor";
import { applyDocumentExtractionResult } from "./documentRepository";

export const DOCUMENT_EXTRACTOR_VERSION = "r2-local-extractor-v1" as const;
export const DOCUMENT_MAX_ATTEMPTS = 3;
export const DOCUMENT_LEASE_MS = 60_000;

export async function enqueueDocumentExtraction(
  db: R1Database,
  input: { documentManifestId: string; customerAccountId: string; diagnosticCaseId: string; now?: Date },
): Promise<R1DocumentTextArtifact> {
  const now = input.now ?? new Date();
  const existing = await db.select().from(r1DocumentTextArtifacts).where(and(
    eq(r1DocumentTextArtifacts.documentManifestId, input.documentManifestId),
    eq(r1DocumentTextArtifacts.extractorVersion, DOCUMENT_EXTRACTOR_VERSION),
    eq(r1DocumentTextArtifacts.customerAccountId, input.customerAccountId),
    eq(r1DocumentTextArtifacts.diagnosticCaseId, input.diagnosticCaseId),
  )).limit(1);
  if (existing[0]) return existing[0];
  const id = `txt_${createHash("sha256").update(`${input.documentManifestId}:${DOCUMENT_EXTRACTOR_VERSION}`).digest("hex").slice(0, 40)}`;
  await db.insert(r1DocumentTextArtifacts).values({
    id,
    documentManifestId: input.documentManifestId,
    customerAccountId: input.customerAccountId,
    diagnosticCaseId: input.diagnosticCaseId,
    extractorVersion: DOCUMENT_EXTRACTOR_VERSION,
    status: "queued",
    attemptCount: 0,
    createdAt: now,
  });
  const rows = await db.select().from(r1DocumentTextArtifacts).where(eq(r1DocumentTextArtifacts.id, id)).limit(1);
  if (!rows[0]) throw new Error("document extraction job could not be reloaded");
  return rows[0];
}

export async function claimNextDocumentExtraction(
  db: R1Database,
  input: { workerId: string; now?: Date },
): Promise<R1DocumentTextArtifact | null> {
  const now = input.now ?? new Date();
  const leaseExpiresAt = new Date(now.getTime() + DOCUMENT_LEASE_MS);
  const candidates = await db.select().from(r1DocumentTextArtifacts).where(and(
    or(
      eq(r1DocumentTextArtifacts.status, "queued"),
      and(eq(r1DocumentTextArtifacts.status, "processing"), lt(r1DocumentTextArtifacts.leaseExpiresAt, now)),
    ),
    lt(r1DocumentTextArtifacts.attemptCount, DOCUMENT_MAX_ATTEMPTS),
  )).limit(1);
  const candidate = candidates[0];
  if (!candidate) return null;
  await db.update(r1DocumentTextArtifacts).set({
    status: "processing",
    leaseOwner: input.workerId,
    leaseExpiresAt,
    attemptCount: candidate.attemptCount + 1,
  }).where(and(
    eq(r1DocumentTextArtifacts.id, candidate.id),
    or(eq(r1DocumentTextArtifacts.status, "queued"), eq(r1DocumentTextArtifacts.leaseOwner, candidate.leaseOwner ?? "")),
  ));
  const rows = await db.select().from(r1DocumentTextArtifacts).where(eq(r1DocumentTextArtifacts.id, candidate.id)).limit(1);
  return rows[0] ?? null;
}

export async function completeDocumentExtraction(
  db: R1Database,
  input: { job: R1DocumentTextArtifact; result: DocumentExtractionResult; now?: Date; put?: typeof storagePut },
): Promise<R1DocumentTextArtifact> {
  const now = input.now ?? new Date();
  let storageKey: string | null = null;
  let textHashSha256: string | null = null;
  let byteSize: number | null = null;
  if (input.result.status === "analyzed" && input.result.text) {
    textHashSha256 = createHash("sha256").update(input.result.text, "utf8").digest("hex");
    byteSize = Buffer.byteLength(input.result.text, "utf8");
    const uploaded = await (input.put ?? storagePut)(
      `r2/document-text/${input.job.customerAccountId}/${input.job.diagnosticCaseId}/${input.job.id}.txt`,
      input.result.text,
      "text/plain; charset=utf-8",
    );
    storageKey = uploaded.key;
  }
  await db.update(r1DocumentTextArtifacts).set({
    status: input.result.status,
    storageKey,
    textHashSha256,
    byteSize,
    failureCode: input.result.failureCode,
    leaseOwner: null,
    leaseExpiresAt: null,
    completedAt: now,
  }).where(and(
    eq(r1DocumentTextArtifacts.id, input.job.id),
    eq(r1DocumentTextArtifacts.leaseOwner, input.job.leaseOwner ?? ""),
  ));
  await applyDocumentExtractionResult(db, {
    id: input.job.documentManifestId,
    customerAccountId: input.job.customerAccountId,
    diagnosticCaseId: input.job.diagnosticCaseId,
    result: input.result,
  });
  const rows = await db.select().from(r1DocumentTextArtifacts).where(eq(r1DocumentTextArtifacts.id, input.job.id)).limit(1);
  if (!rows[0]) throw new Error("document extraction result could not be reloaded");
  return rows[0];
}

export async function processClaimedDocumentExtraction(
  db: R1Database,
  input: { job: R1DocumentTextArtifact; fetch?: typeof fetch; put?: typeof storagePut; now?: Date },
): Promise<R1DocumentTextArtifact> {
  const source = await db.select().from(r1DocumentManifests).where(and(
    eq(r1DocumentManifests.id, input.job.documentManifestId),
    eq(r1DocumentManifests.customerAccountId, input.job.customerAccountId),
    eq(r1DocumentManifests.diagnosticCaseId, input.job.diagnosticCaseId),
  )).limit(1);
  const manifest = source[0];
  let result: DocumentExtractionResult;
  if (!manifest || manifest.status === "deleted") {
    result = { status: "failed", text: null, textByteSize: 0, securityFlags: ["untrusted_document_content"], failureCode: "extractor_error" };
  } else {
    const signedUrl = await storageGetSignedUrl(manifest.storageKey);
    const response = await (input.fetch ?? fetch)(signedUrl);
    if (!response.ok) {
      result = { status: "failed", text: null, textByteSize: 0, securityFlags: ["untrusted_document_content"], failureCode: "extractor_error" };
    } else {
      result = await extractDocumentText({ format: manifest.format, bytes: new Uint8Array(await response.arrayBuffer()) });
    }
  }
  return completeDocumentExtraction(db, { job: input.job, result, now: input.now, put: input.put });
}

export async function requeueFailedDocumentExtraction(
  db: R1Database,
  input: { id: string; now?: Date },
): Promise<boolean> {
  const now = input.now ?? new Date();
  const changed = await db.update(r1DocumentTextArtifacts).set({
    status: "queued",
    failureCode: null,
    leaseOwner: null,
    leaseExpiresAt: null,
  }).where(and(
    eq(r1DocumentTextArtifacts.id, input.id),
    eq(r1DocumentTextArtifacts.status, "failed"),
    lt(r1DocumentTextArtifacts.attemptCount, DOCUMENT_MAX_ATTEMPTS),
    or(isNull(r1DocumentTextArtifacts.completedAt), lt(r1DocumentTextArtifacts.completedAt, now)),
  ));
  return Number((changed as { affectedRows?: number }).affectedRows ?? 0) > 0;
}
