import { and, eq, lte } from "drizzle-orm";
import {
  creditEntitlements,
  type CreditEntitlement,
  type InsertCreditEntitlement,
} from "../../../drizzle/schema";
import type { R1Executor } from "../database";

export class CreditEntitlementPersistenceError extends Error {
  constructor(message: string) {
    super(`Credit entitlement persistence is inconsistent: ${message}`);
    this.name = "CreditEntitlementPersistenceError";
  }
}

function isDuplicateEntry(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  return candidate.code === "ER_DUP_ENTRY" || candidate.cause?.code === "ER_DUP_ENTRY";
}

function sameIssuanceIdentity(
  row: CreditEntitlement,
  value: InsertCreditEntitlement,
): boolean {
  return row.id === value.id &&
    row.customerAccountId === value.customerAccountId &&
    row.diagnosticCaseId === value.diagnosticCaseId &&
    row.sourcePaymentRecordId === value.sourcePaymentRecordId &&
    row.sourceReportSnapshotId === value.sourceReportSnapshotId &&
    row.sourceTariffId === value.sourceTariffId &&
    row.sourceTariffVersion === value.sourceTariffVersion &&
    row.policyId === value.policyId &&
    row.policyVersion === value.policyVersion &&
    row.amountRub === value.amountRub &&
    row.currency === value.currency &&
    row.eligibleProductCode === value.eligibleProductCode &&
    row.issuedAt.getTime() === value.issuedAt!.getTime() &&
    row.expiresAt.getTime() === value.expiresAt!.getTime() &&
    row.businessTimeZone === value.businessTimeZone &&
    row.status === "available" &&
    row.automaticRedemptionEnabled === false &&
    row.revokedAt === null &&
    row.revocationReasonCode === null;
}

export async function insertCreditEntitlementExactlyOnce(
  executor: R1Executor,
  value: InsertCreditEntitlement,
): Promise<CreditEntitlement> {
  try {
    await executor.insert(creditEntitlements).values(value);
  } catch (error) {
    if (!isDuplicateEntry(error)) throw error;
  }
  const rows = await executor
    .select()
    .from(creditEntitlements)
    .where(and(
      eq(creditEntitlements.sourcePaymentRecordId, value.sourcePaymentRecordId),
      eq(creditEntitlements.sourceReportSnapshotId, value.sourceReportSnapshotId),
      eq(creditEntitlements.policyId, value.policyId),
    ))
    .limit(1);
  const persisted = rows[0];
  if (!persisted || !sameIssuanceIdentity(persisted, value)) {
    throw new CreditEntitlementPersistenceError("issuance identity collision is divergent");
  }
  return persisted;
}

export async function findCreditEntitlementForReport(
  executor: R1Executor,
  input: {
    customerAccountId: string;
    diagnosticCaseId: string;
    sourceReportSnapshotId: string;
  },
): Promise<CreditEntitlement | null> {
  const rows = await executor
    .select()
    .from(creditEntitlements)
    .where(and(
      eq(creditEntitlements.customerAccountId, input.customerAccountId),
      eq(creditEntitlements.diagnosticCaseId, input.diagnosticCaseId),
      eq(creditEntitlements.sourceReportSnapshotId, input.sourceReportSnapshotId),
    ))
    .limit(1);
  return rows[0] ?? null;
}

/** Test-only lifecycle transition; no redemption or commerce path is introduced. */
export async function expireCreditEntitlement(
  executor: R1Executor,
  input: { id: string; now: Date },
): Promise<boolean> {
  const result = await executor
    .update(creditEntitlements)
    .set({ status: "expired", updatedAt: input.now })
    .where(and(
      eq(creditEntitlements.id, input.id),
      eq(creditEntitlements.status, "available"),
      lte(creditEntitlements.expiresAt, input.now),
    ));
  return Number(result[0].affectedRows) === 1;
}

/** Test-only administrative revocation primitive with an explicit safe reason. */
export async function revokeCreditEntitlement(
  executor: R1Executor,
  input: { id: string; now: Date; reasonCode: string },
): Promise<boolean> {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(input.reasonCode)) {
    throw new TypeError("Invalid credit revocation reason code");
  }
  const result = await executor
    .update(creditEntitlements)
    .set({
      status: "revoked",
      revokedAt: input.now,
      revocationReasonCode: input.reasonCode,
      updatedAt: input.now,
    })
    .where(and(
      eq(creditEntitlements.id, input.id),
      eq(creditEntitlements.status, "available"),
    ));
  return Number(result[0].affectedRows) === 1;
}
