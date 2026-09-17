import { and, eq, isNotNull, lte } from "drizzle-orm";
import { r1DocumentManifests, r1DocumentTextArtifacts, type R1DocumentManifest } from "../../../drizzle/schema";
import type { R1Database } from "../database";

export type RetentionSweepResult = Readonly<{
  candidates: number;
  storageDeleted: number;
  storageDeleteFailures: number;
}>;

/**
 * Lists only tombstoned documents older than an explicitly approved cutoff.
 * No retention duration is chosen by code: the caller must provide the cutoff.
 */
export async function listDocumentRetentionCandidates(
  db: R1Database,
  input: { deletedBefore: Date },
): Promise<R1DocumentManifest[]> {
  return db.select().from(r1DocumentManifests).where(and(
    eq(r1DocumentManifests.status, "deleted"),
    isNotNull(r1DocumentManifests.deletedAt),
    lte(r1DocumentManifests.deletedAt, input.deletedBefore),
  ));
}

/**
 * Physically deletes private objects only through an injected provider adapter.
 * The current storage adapter intentionally has no guessed delete endpoint;
 * absent an adapter, nothing is removed and no false success is reported.
 */
export async function sweepDeletedDocumentObjects(
  db: R1Database,
  input: {
    deletedBefore: Date;
    deleteObject?: (storageKey: string) => Promise<void>;
  },
): Promise<RetentionSweepResult> {
  const candidates = await listDocumentRetentionCandidates(db, input);
  if (!input.deleteObject) return { candidates: candidates.length, storageDeleted: 0, storageDeleteFailures: 0 };
  let storageDeleted = 0;
  let storageDeleteFailures = 0;
  for (const document of candidates) {
    try {
      await input.deleteObject(document.storageKey);
      storageDeleted += 1;
      const textArtifacts = await db.select().from(r1DocumentTextArtifacts).where(and(
        eq(r1DocumentTextArtifacts.documentManifestId, document.id),
        eq(r1DocumentTextArtifacts.customerAccountId, document.customerAccountId),
        eq(r1DocumentTextArtifacts.diagnosticCaseId, document.diagnosticCaseId),
      ));
      for (const artifact of textArtifacts) {
        if (artifact.storageKey) await input.deleteObject(artifact.storageKey);
      }
    } catch {
      storageDeleteFailures += 1;
    }
  }
  return { candidates: candidates.length, storageDeleted, storageDeleteFailures };
}
