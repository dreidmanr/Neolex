import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { customerSessions } from "../../../drizzle/schema";
import { ENV } from "../../_core/env";
import {
  appendAuditEvent,
  type AppendAuditEvent,
} from "../audit/auditRepository";
import { requireR1Database, type R1Executor } from "../database";
import { newR1Id } from "../ids";
import { assertMagicLinkTestAllowed } from "../releaseGate";
import { hashCustomerSessionToken } from "./customerSessionToken";

export const CUSTOMER_SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;

export type CreatedCustomerSession = {
  id: string;
  rawToken: string;
  expiresAt: Date;
};

type AppendCustomerSessionAudit = (
  executor: R1Executor,
  event: AppendAuditEvent,
) => Promise<void>;

export async function insertNewCustomerSession(
  executor: R1Executor,
  accountId: string,
  now: Date,
): Promise<CreatedCustomerSession> {
  const rawToken = randomBytes(32).toString("base64url");
  const id = newR1Id("session");
  const expiresAt = new Date(now.getTime() + CUSTOMER_SESSION_LIFETIME_MS);
  await executor.insert(customerSessions).values({
    id,
    customerAccountId: accountId,
    tokenHash: hashCustomerSessionToken(rawToken, ENV.customerSessionSecret),
    status: "active",
    expiresAt,
    createdAt: now,
  });
  return { id, rawToken, expiresAt };
}

export async function revokeCurrentCustomerSession(input: {
  accountId: string;
  sessionId: string;
  requestId: string;
  now?: Date;
}, appendAudit: AppendCustomerSessionAudit = appendAuditEvent): Promise<void> {
  assertMagicLinkTestAllowed();
  const db = await requireR1Database();
  const now = input.now ?? new Date();
  const revoked = await db.transaction(async tx => {
    const result = await tx
      .update(customerSessions)
      .set({
        status: "revoked",
        revokedAt: now,
        revocationReasonCode: "logout_current",
      })
      .where(
        and(
          eq(customerSessions.id, input.sessionId),
          eq(customerSessions.customerAccountId, input.accountId),
          eq(customerSessions.status, "active"),
        ),
      );
    return Number(result[0].affectedRows) === 1;
  });
  if (!revoked) return;

  try {
    await appendAudit(db, {
      actorType: "customer_session",
      actorId: input.sessionId,
      aggregateType: "customer_session",
      aggregateId: input.sessionId,
      eventType: "auth.customer_session_revoked",
      outcome: "succeeded",
      fromStatus: "active",
      toStatus: "revoked",
      reasonCode: "logout_current",
      requestId: input.requestId,
      privacySafeMetadata: { test: true },
      createdAt: now,
    });
  } catch {
    // A committed revocation must not depend on audit availability.
  }
}
