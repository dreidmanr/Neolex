import { appendAuditEvent } from "../audit/auditRepository";
import { requireR1Database } from "../database";
import { appendOutboxEvent } from "../outbox/outboxRepository";
import { throwConflict, throwNeutralNotFound } from "../policy/errors";
import { assertPromoAccessTestAllowed } from "../releaseGate";
import { findActiveOwnedAccessGrant } from "./accessPolicy";
import { conditionallyRevokeAccessGrant } from "./paymentRepository";

export async function revokeAccessGrant(input: {
  accessGrantId: string;
  customerAccountId: string;
  diagnosticCaseId: string;
  actorId: string;
  requestId: string;
  reasonCode: "test_revocation";
  now?: Date;
}): Promise<{ status: "revoked" }> {
  assertPromoAccessTestAllowed();
  const database = await requireR1Database();
  const now = input.now ?? new Date();
  return database.transaction(async tx => {
    const candidate = await findActiveOwnedAccessGrant(
      tx,
      input.customerAccountId,
      input.diagnosticCaseId,
      now,
    );
    if (!candidate || candidate.grant.id !== input.accessGrantId) throwNeutralNotFound();
    const revoked = await conditionallyRevokeAccessGrant(tx, {
      id: candidate.grant.id,
      customerAccountId: input.customerAccountId,
      diagnosticCaseId: input.diagnosticCaseId,
      revokedAt: now,
      reasonCode: input.reasonCode,
    });
    if (!revoked) throwConflict("Access grant changed concurrently");

    await appendAuditEvent(tx, {
      actorType: "service",
      actorId: input.actorId,
      aggregateType: "access_grant",
      aggregateId: candidate.grant.id,
      eventType: "billing.access_revoked",
      outcome: "succeeded",
      fromStatus: "active",
      toStatus: "revoked",
      reasonCode: input.reasonCode,
      requestId: input.requestId,
      privacySafeMetadata: {
        paymentId: candidate.payment.id,
        caseId: input.diagnosticCaseId,
        test: true,
      },
      createdAt: now,
    });
    await appendOutboxEvent(tx, {
      aggregateType: "access_grant",
      aggregateId: candidate.grant.id,
      eventType: "billing.access_revoked",
      privacySafePayload: {
        grantId: candidate.grant.id,
        paymentId: candidate.payment.id,
        caseId: input.diagnosticCaseId,
        reasonCode: input.reasonCode,
        test: true,
      },
      createdAt: now,
    });
    return { status: "revoked" };
  });
}
