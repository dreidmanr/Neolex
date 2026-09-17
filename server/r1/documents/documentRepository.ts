import { and, eq } from "drizzle-orm";
import { r1DocumentManifests, type R1DocumentManifest } from "../../../drizzle/schema";
import type { R1Database } from "../database";
import type { DocumentExtractionResult } from "./documentExtractor";

export async function findOwnedDocument(
  db: R1Database,
  input: { id: string; customerAccountId: string; diagnosticCaseId: string },
): Promise<R1DocumentManifest | null> {
  const rows = await db.select().from(r1DocumentManifests).where(and(
    eq(r1DocumentManifests.id, input.id),
    eq(r1DocumentManifests.customerAccountId, input.customerAccountId),
    eq(r1DocumentManifests.diagnosticCaseId, input.diagnosticCaseId),
  )).limit(1);
  return rows[0] ?? null;
}

export async function listOwnedDocuments(
  db: R1Database,
  input: { customerAccountId: string; diagnosticCaseId: string },
): Promise<R1DocumentManifest[]> {
  return db.select().from(r1DocumentManifests).where(and(
    eq(r1DocumentManifests.customerAccountId, input.customerAccountId),
    eq(r1DocumentManifests.diagnosticCaseId, input.diagnosticCaseId),
  ));
}

export async function tombstoneOwnedDocument(
  db: R1Database,
  input: { id: string; customerAccountId: string; diagnosticCaseId: string; now: Date },
): Promise<R1DocumentManifest | null> {
  const existing = await findOwnedDocument(db, input);
  if (!existing || existing.status === "deleted") return existing;
  await db.update(r1DocumentManifests).set({
    status: "deleted",
    deletedAt: input.now,
  }).where(and(
    eq(r1DocumentManifests.id, input.id),
    eq(r1DocumentManifests.customerAccountId, input.customerAccountId),
    eq(r1DocumentManifests.diagnosticCaseId, input.diagnosticCaseId),
    eq(r1DocumentManifests.status, existing.status),
  ));
  return findOwnedDocument(db, input);
}

export async function applyDocumentExtractionResult(
  db: R1Database,
  input: { id: string; customerAccountId: string; diagnosticCaseId: string; result: DocumentExtractionResult },
): Promise<R1DocumentManifest | null> {
  const existing = await findOwnedDocument(db, input);
  if (!existing || existing.status === "deleted") return existing;
  await db.update(r1DocumentManifests).set({
    status: input.result.status,
    failureCode: input.result.failureCode,
  }).where(and(
    eq(r1DocumentManifests.id, input.id),
    eq(r1DocumentManifests.customerAccountId, input.customerAccountId),
    eq(r1DocumentManifests.diagnosticCaseId, input.diagnosticCaseId),
    eq(r1DocumentManifests.status, existing.status),
  ));
  return findOwnedDocument(db, input);
}
