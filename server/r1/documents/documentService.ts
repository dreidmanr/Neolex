import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { accessGrants, paymentRecords, r1DocumentManifests, type R1DocumentManifest } from "../../../drizzle/schema";
import { storagePut } from "../../storage";
import type { R1Database } from "../database";
import { validateDocumentUpload, DOCUMENT_MAX_PER_CASE, type DocumentUploadManifest } from "./documentIntake";
import { enqueueDocumentExtraction } from "./documentProcessingService";

export const DOCUMENT_TARIFF_CODE = "lexy-diagnostic-with-documents" as const;

export class DocumentAccessDeniedError extends Error {
  constructor(readonly code: "not_found" | "tariff_not_eligible" | "document_limit") {
    super(`Document access denied: ${code}`);
    this.name = "DocumentAccessDeniedError";
  }
}

export async function createOwnedDocumentManifest(
  db: R1Database,
  input: {
    customerAccountId: string;
    diagnosticCaseId: string;
    fileName: string;
    category: string;
    mimeType: string;
    bytes: Uint8Array;
    now?: Date;
  },
  dependencies: { put?: typeof storagePut } = {},
): Promise<R1DocumentManifest> {
  const grantRows = await db.select({
    grant: accessGrants,
    payment: paymentRecords,
  }).from(accessGrants).innerJoin(
    paymentRecords,
    eq(accessGrants.paymentRecordId, paymentRecords.id),
  ).where(and(
    eq(accessGrants.customerAccountId, input.customerAccountId),
    eq(accessGrants.diagnosticCaseId, input.diagnosticCaseId),
    eq(accessGrants.status, "active"),
  )).limit(1);
  const access = grantRows[0];
  if (!access) throw new DocumentAccessDeniedError("not_found");
  if (access.payment.tariffCode !== DOCUMENT_TARIFF_CODE) {
    throw new DocumentAccessDeniedError("tariff_not_eligible");
  }

  const countRows = await db.select({ id: r1DocumentManifests.id }).from(r1DocumentManifests).where(and(
    eq(r1DocumentManifests.customerAccountId, input.customerAccountId),
    eq(r1DocumentManifests.diagnosticCaseId, input.diagnosticCaseId),
    eq(r1DocumentManifests.status, "uploaded"),
  ));
  if (countRows.length >= DOCUMENT_MAX_PER_CASE) throw new DocumentAccessDeniedError("document_limit");

  const manifest: DocumentUploadManifest = validateDocumentUpload(input);
  const id = `doc_${createHash("sha256").update(`${input.diagnosticCaseId}:${manifest.contentHashSha256}`).digest("hex").slice(0, 40)}`;
  const uploaded = await (dependencies.put ?? storagePut)(
    `r2/documents/${input.customerAccountId}/${input.diagnosticCaseId}/${id}.${manifest.format}`,
    input.bytes,
    manifest.mimeType,
  );
  try {
    await db.insert(r1DocumentManifests).values({
      id,
      customerAccountId: input.customerAccountId,
      diagnosticCaseId: input.diagnosticCaseId,
      accessGrantId: access.grant.id,
      categoryId: manifest.category,
      fileName: manifest.fileName,
      format: manifest.format,
      mimeType: manifest.mimeType,
      byteSize: manifest.byteSize,
      contentHashSha256: manifest.contentHashSha256,
      storageKey: uploaded.key,
      status: "uploaded",
      trustedContent: false,
      promptInjectionRisk: "untrusted_document_content",
      createdAt: input.now,
    });
  } catch (error) {
    // The immutable manifest is the source of truth; a failed insert must not
    // be reported as a successful upload. Object cleanup is provider-specific.
    throw error;
  }
  const rows = await db.select().from(r1DocumentManifests).where(and(
    eq(r1DocumentManifests.id, id),
    eq(r1DocumentManifests.customerAccountId, input.customerAccountId),
    eq(r1DocumentManifests.diagnosticCaseId, input.diagnosticCaseId),
  )).limit(1);
  if (!rows[0]) throw new Error("document manifest could not be reloaded");
  await enqueueDocumentExtraction(db, {
    documentManifestId: rows[0].id,
    customerAccountId: input.customerAccountId,
    diagnosticCaseId: input.diagnosticCaseId,
    now: input.now,
  });
  return rows[0];
}
