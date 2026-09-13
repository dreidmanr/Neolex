import { and, eq, sql } from "drizzle-orm";
import {
  idempotencyRecords,
  type IdempotencyRecord,
} from "../../../drizzle/schema";
import type { R1Executor } from "../database";
import { newR1Id } from "../ids";

export type IdempotencyIdentity = {
  customerAccountId: string;
  scope: string;
  keyHash: string;
};

function decodeResponseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error("Idempotency response JSON is invalid");
  }
}

export async function claimIdempotencyRecord(
  executor: R1Executor,
  identity: IdempotencyIdentity,
  requestHash: string,
  expiresAt: Date,
): Promise<{ record: IdempotencyRecord; claimed: boolean }> {
  // Keys are semantic command identities and are never reclaimable, including
  // after failed/expired records. expiresAt only marks cleanup eligibility.
  const id = newR1Id("idem");
  await executor
    .insert(idempotencyRecords)
    .values({
      id,
      customerAccountId: identity.customerAccountId,
      scope: identity.scope,
      idempotencyKey: identity.keyHash,
      requestHash,
      status: "pending",
      expiresAt,
    })
    .onDuplicateKeyUpdate({
      set: { id: sql`${idempotencyRecords.id}` },
    });

  const rows = await executor
    .select()
    .from(idempotencyRecords)
    .where(
      and(
        eq(idempotencyRecords.customerAccountId, identity.customerAccountId),
        eq(idempotencyRecords.scope, identity.scope),
        eq(idempotencyRecords.idempotencyKey, identity.keyHash),
      ),
    )
    .limit(1);
  const record = rows[0];
  if (!record) throw new Error("Idempotency record could not be loaded");
  return {
    record: {
      ...record,
      responseJson: decodeResponseJson(record.responseJson),
    },
    claimed: record.id === id,
  };
}

export async function completeIdempotencyRecord(
  executor: R1Executor,
  id: string,
  responseJson: Record<string, unknown>,
): Promise<void> {
  const result = await executor
    .update(idempotencyRecords)
    .set({ status: "completed", responseJson })
    .where(and(eq(idempotencyRecords.id, id), eq(idempotencyRecords.status, "pending")));
  if (Number(result[0].affectedRows) !== 1) {
    throw new Error("Idempotency completion lost pending ownership");
  }
}
