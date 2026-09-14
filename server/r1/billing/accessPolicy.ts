import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import {
  accessGrants,
  paymentRecords,
  type AccessGrant,
  type PaymentRecord,
} from "../../../drizzle/schema";
import type { R1Executor } from "../database";
import { throwNeutralNotFound } from "../policy/errors";

export type AccessGrantCandidate = {
  grant: AccessGrant;
  payment: PaymentRecord;
};

export function isActiveOwnedAccessGrant(
  customerAccountId: string,
  diagnosticCaseId: string,
  candidate: AccessGrantCandidate | null | undefined,
  now = new Date(),
): candidate is AccessGrantCandidate {
  if (!candidate) return false;
  const { grant, payment } = candidate;
  return (
    grant.customerAccountId === customerAccountId &&
    grant.diagnosticCaseId === diagnosticCaseId &&
    grant.status === "active" &&
    grant.revokedAt === null &&
    (grant.expiresAt === null || grant.expiresAt.getTime() > now.getTime()) &&
    grant.paymentRecordId === payment.id &&
    payment.customerAccountId === customerAccountId &&
    payment.diagnosticCaseId === diagnosticCaseId &&
    payment.status === "promo_granted"
  );
}

export async function findActiveOwnedAccessGrant(
  executor: R1Executor,
  customerAccountId: string,
  diagnosticCaseId: string,
  now = new Date(),
): Promise<AccessGrantCandidate | null> {
  const rows = await executor.select({ grant: accessGrants, payment: paymentRecords })
    .from(accessGrants)
    .innerJoin(paymentRecords, and(
      eq(paymentRecords.id, accessGrants.paymentRecordId),
      eq(paymentRecords.customerAccountId, accessGrants.customerAccountId),
      eq(paymentRecords.diagnosticCaseId, accessGrants.diagnosticCaseId),
    ))
    .where(and(
      eq(accessGrants.customerAccountId, customerAccountId),
      eq(accessGrants.diagnosticCaseId, diagnosticCaseId),
      eq(accessGrants.status, "active"),
      isNull(accessGrants.revokedAt),
      or(isNull(accessGrants.expiresAt), gt(accessGrants.expiresAt, now)),
      eq(paymentRecords.status, "promo_granted"),
    )).limit(1);
  const candidate = rows[0] ?? null;
  return isActiveOwnedAccessGrant(customerAccountId, diagnosticCaseId, candidate, now)
    ? candidate
    : null;
}

/**
 * Used only after the owned diagnostic-case row has been locked. The joined
 * grant/payment lock is the second step in the shared questionnaire/revocation
 * lock order, and active expiry is deliberately evaluated by MariaDB NOW().
 */
export async function findActiveOwnedAccessGrantForUpdate(
  executor: R1Executor,
  customerAccountId: string,
  diagnosticCaseId: string,
): Promise<AccessGrantCandidate | null> {
  const rows = await executor
    .select({ grant: accessGrants, payment: paymentRecords })
    .from(accessGrants)
    .innerJoin(
      paymentRecords,
      and(
        eq(paymentRecords.id, accessGrants.paymentRecordId),
        eq(paymentRecords.customerAccountId, accessGrants.customerAccountId),
        eq(paymentRecords.diagnosticCaseId, accessGrants.diagnosticCaseId),
      ),
    )
    .where(
      and(
        eq(accessGrants.customerAccountId, customerAccountId),
        eq(accessGrants.diagnosticCaseId, diagnosticCaseId),
        eq(accessGrants.status, "active"),
        isNull(accessGrants.revokedAt),
        or(isNull(accessGrants.expiresAt), gt(accessGrants.expiresAt, sql`CURRENT_TIMESTAMP`)),
        eq(paymentRecords.status, "promo_granted"),
      ),
    )
    .for("update")
    .limit(1);
  return rows[0] ?? null;
}

export async function requireActiveOwnedAccessGrant(
  executor: R1Executor,
  customerAccountId: string,
  diagnosticCaseId: string,
  now = new Date(),
): Promise<AccessGrantCandidate> {
  const candidate = await findActiveOwnedAccessGrant(
    executor,
    customerAccountId,
    diagnosticCaseId,
    now,
  );
  if (!candidate) throwNeutralNotFound();
  return candidate;
}
