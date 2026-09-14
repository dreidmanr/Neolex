import { and, eq, isNull } from "drizzle-orm";
import {
  accessGrants,
  paymentRecords,
  tariffSnapshots,
  type InsertAccessGrant,
  type InsertPaymentRecord,
  type InsertTariffSnapshot,
} from "../../../drizzle/schema";
import type { R1Executor } from "../database";

export async function insertTariffSnapshot(
  executor: R1Executor,
  value: InsertTariffSnapshot,
): Promise<void> {
  await executor.insert(tariffSnapshots).values(value);
}

export async function insertPaymentRecord(
  executor: R1Executor,
  value: InsertPaymentRecord,
): Promise<void> {
  await executor.insert(paymentRecords).values(value);
}

export async function insertAccessGrant(
  executor: R1Executor,
  value: InsertAccessGrant,
): Promise<void> {
  await executor.insert(accessGrants).values(value);
}

export async function conditionallyRevokeAccessGrant(
  executor: R1Executor,
  input: {
    id: string;
    customerAccountId: string;
    diagnosticCaseId: string;
    revokedAt: Date;
    reasonCode: "test_revocation";
  },
): Promise<boolean> {
  const result = await executor.update(accessGrants).set({
    status: "revoked",
    revokedAt: input.revokedAt,
    revocationReasonCode: input.reasonCode,
    updatedAt: input.revokedAt,
  }).where(and(
    eq(accessGrants.id, input.id),
    eq(accessGrants.customerAccountId, input.customerAccountId),
    eq(accessGrants.diagnosticCaseId, input.diagnosticCaseId),
    eq(accessGrants.status, "active"),
    isNull(accessGrants.revokedAt),
  ));
  return Number(result[0].affectedRows) === 1;
}
