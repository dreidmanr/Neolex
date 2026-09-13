import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import {
  customerAccountIdentities,
  customerAccounts,
  emailDeliveries,
  magicLinkTokens,
  outboxEvents,
  type EmailDelivery,
  type InsertEmailDelivery,
} from "../../../drizzle/schema";
import type { R1Executor } from "../database";
import type { R1Database } from "../database";

export type ClaimedMagicLinkDelivery = {
  delivery: EmailDelivery;
  tokenId: string;
  identityId: string;
};

export async function insertEmailDelivery(
  executor: R1Executor,
  delivery: InsertEmailDelivery,
): Promise<void> {
  await executor.insert(emailDeliveries).values(delivery);
}

export async function hasEmailDeliveryDedupeKey(
  executor: R1Executor,
  dedupeKey: string,
): Promise<boolean> {
  const rows = await executor
    .select({ id: emailDeliveries.id })
    .from(emailDeliveries)
    .where(eq(emailDeliveries.dedupeKey, dedupeKey))
    .limit(1);
  return Boolean(rows[0]);
}

export async function claimOneMagicLinkDelivery(
  executor: R1Executor,
  input: { leaseOwner: string; now: Date; leaseExpiresAt: Date },
): Promise<ClaimedMagicLinkDelivery | null> {
  const candidates = await executor
    .select({ id: emailDeliveries.id, leaseVersion: emailDeliveries.leaseVersion })
    .from(emailDeliveries)
    .where(
      and(
        eq(emailDeliveries.deliveryKind, "magic_link_v1"),
        or(
          and(
            eq(emailDeliveries.status, "queued"),
            or(isNull(emailDeliveries.nextAttemptAt), lte(emailDeliveries.nextAttemptAt, input.now)),
          ),
          and(
            eq(emailDeliveries.status, "sending"),
            lte(emailDeliveries.leaseExpiresAt, input.now),
          ),
        ),
      ),
    )
    .orderBy(asc(emailDeliveries.createdAt))
    .limit(1);
  const candidate = candidates[0];
  if (!candidate) return null;

  const result = await executor
    .update(emailDeliveries)
    .set({
      status: "sending",
      attemptCount: sql`${emailDeliveries.attemptCount} + 1`,
      leaseOwner: input.leaseOwner,
      leaseVersion: candidate.leaseVersion + 1,
      leaseExpiresAt: input.leaseExpiresAt,
      lastAttemptAt: input.now,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(emailDeliveries.id, candidate.id),
        eq(emailDeliveries.leaseVersion, candidate.leaseVersion),
        or(
          eq(emailDeliveries.status, "queued"),
          and(
            eq(emailDeliveries.status, "sending"),
            lte(emailDeliveries.leaseExpiresAt, input.now),
          ),
        ),
      ),
    );
  if (Number(result[0].affectedRows) !== 1) return null;

  const claimed = await executor
    .select({ delivery: emailDeliveries })
    .from(emailDeliveries)
    .innerJoin(magicLinkTokens, eq(magicLinkTokens.id, emailDeliveries.magicLinkTokenId))
    .innerJoin(customerAccountIdentities, eq(customerAccountIdentities.id, emailDeliveries.customerAccountIdentityId))
    .innerJoin(customerAccounts, eq(customerAccounts.id, customerAccountIdentities.customerAccountId))
    .where(
      and(
        eq(emailDeliveries.id, candidate.id),
        eq(emailDeliveries.status, "sending"),
        eq(emailDeliveries.leaseOwner, input.leaseOwner),
        eq(emailDeliveries.leaseVersion, candidate.leaseVersion + 1),
        gt(emailDeliveries.leaseExpiresAt, input.now),
      ),
    )
    .limit(1);
  const delivery = claimed[0]?.delivery;
  return delivery
    ? { delivery, tokenId: delivery.magicLinkTokenId, identityId: delivery.customerAccountIdentityId }
    : null;
}

export async function isDeliveryTargetActive(
  executor: R1Executor,
  input: {
    deliveryId: string;
    leaseOwner: string;
    leaseVersion: number;
    now: Date;
  },
): Promise<boolean> {
  const rows = await executor
    .select({ id: emailDeliveries.id })
    .from(emailDeliveries)
    .innerJoin(magicLinkTokens, eq(magicLinkTokens.id, emailDeliveries.magicLinkTokenId))
    .innerJoin(customerAccountIdentities, eq(customerAccountIdentities.id, emailDeliveries.customerAccountIdentityId))
    .innerJoin(customerAccounts, eq(customerAccounts.id, customerAccountIdentities.customerAccountId))
    .where(
      and(
        eq(emailDeliveries.id, input.deliveryId),
        eq(emailDeliveries.status, "sending"),
        eq(emailDeliveries.leaseOwner, input.leaseOwner),
        eq(emailDeliveries.leaseVersion, input.leaseVersion),
        gt(emailDeliveries.leaseExpiresAt, input.now),
        eq(magicLinkTokens.status, "active"),
        gt(magicLinkTokens.expiresAt, input.now),
        eq(customerAccountIdentities.status, "active"),
        eq(customerAccounts.status, "active"),
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
}

/**
 * Atomically records the durable send decision for the in-memory test
 * transport. The delivery and its exact outbox event form the send ledger;
 * callers must not invoke the transport unless this transaction commits.
 *
 * This commit-before-effect protocol is deliberately limited to the
 * deterministic test inbox. A future real provider must instead supply a
 * provider-side idempotency key and use a separate acknowledgement and
 * reconciliation protocol around the network boundary.
 */
export async function commitTestDeliveryForSend(
  database: R1Database,
  input: {
    deliveryId: string;
    leaseOwner: string;
    leaseVersion: number;
    freshNow: Date;
  },
): Promise<boolean> {
  return database.transaction(async tx => {
    const candidates = await tx
      .select({
        deliveryId: emailDeliveries.id,
        dedupeKey: emailDeliveries.dedupeKey,
        outboxId: outboxEvents.id,
      })
      .from(emailDeliveries)
      .innerJoin(
        magicLinkTokens,
        and(
          eq(magicLinkTokens.id, emailDeliveries.magicLinkTokenId),
          eq(
            magicLinkTokens.customerAccountIdentityId,
            emailDeliveries.customerAccountIdentityId,
          ),
        ),
      )
      .innerJoin(
        customerAccountIdentities,
        eq(
          customerAccountIdentities.id,
          emailDeliveries.customerAccountIdentityId,
        ),
      )
      .innerJoin(
        customerAccounts,
        eq(customerAccounts.id, customerAccountIdentities.customerAccountId),
      )
      .innerJoin(
        outboxEvents,
        and(
          eq(outboxEvents.aggregateType, "email_delivery"),
          eq(outboxEvents.aggregateId, emailDeliveries.id),
          eq(outboxEvents.eventType, "auth.magic_link_delivery_queued"),
          eq(outboxEvents.dedupeKey, emailDeliveries.dedupeKey),
        ),
      )
      .where(
        and(
          eq(emailDeliveries.id, input.deliveryId),
          eq(emailDeliveries.deliveryKind, "magic_link_v1"),
          eq(emailDeliveries.status, "sending"),
          eq(emailDeliveries.leaseOwner, input.leaseOwner),
          eq(emailDeliveries.leaseVersion, input.leaseVersion),
          gt(emailDeliveries.leaseExpiresAt, input.freshNow),
          eq(magicLinkTokens.status, "active"),
          gt(magicLinkTokens.expiresAt, input.freshNow),
          eq(customerAccountIdentities.status, "active"),
          eq(customerAccounts.status, "active"),
          or(
            eq(outboxEvents.status, "pending"),
            eq(outboxEvents.status, "processing"),
          ),
        ),
      )
      .limit(1)
      .for("update");
    const candidate = candidates[0];
    if (!candidate) return false;

    const deliveryResult = await tx
      .update(emailDeliveries)
      .set({
        status: "sent",
        sentAt: input.freshNow,
        terminalAt: input.freshNow,
        lastErrorCode: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: input.freshNow,
      })
      .where(
        and(
          eq(emailDeliveries.id, candidate.deliveryId),
          eq(emailDeliveries.status, "sending"),
          eq(emailDeliveries.leaseOwner, input.leaseOwner),
          eq(emailDeliveries.leaseVersion, input.leaseVersion),
          gt(emailDeliveries.leaseExpiresAt, input.freshNow),
        ),
      );
    if (Number(deliveryResult[0].affectedRows) !== 1) {
      throw new Error("Test delivery send ledger lost its locked lease");
    }

    const outboxResult = await tx
      .update(outboxEvents)
      .set({
        status: "published",
        nextAttemptAt: null,
        publishedAt: input.freshNow,
        lastAttemptAt: input.freshNow,
        lastErrorCode: null,
        updatedAt: input.freshNow,
      })
      .where(
        and(
          eq(outboxEvents.id, candidate.outboxId),
          eq(outboxEvents.aggregateType, "email_delivery"),
          eq(outboxEvents.aggregateId, candidate.deliveryId),
          eq(outboxEvents.eventType, "auth.magic_link_delivery_queued"),
          eq(outboxEvents.dedupeKey, candidate.dedupeKey),
          or(
            eq(outboxEvents.status, "pending"),
            eq(outboxEvents.status, "processing"),
          ),
        ),
      );
    if (Number(outboxResult[0].affectedRows) !== 1) {
      throw new Error("Test delivery send ledger lost its locked outbox event");
    }

    return true;
  });
}

export async function finalizeEmailDelivery(
  executor: R1Executor,
  input: {
    deliveryId: string;
    leaseOwner: string;
    leaseVersion: number;
    status: "sent" | "suppressed";
    now: Date;
    errorCode?: "identity_not_registered" | "target_inactive";
  },
): Promise<boolean> {
  const result = await executor
    .update(emailDeliveries)
    .set({
      status: input.status,
      sentAt: input.status === "sent" ? input.now : null,
      terminalAt: input.now,
      lastErrorCode: input.errorCode ?? null,
      leaseExpiresAt: null,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(emailDeliveries.id, input.deliveryId),
        eq(emailDeliveries.status, "sending"),
        eq(emailDeliveries.leaseOwner, input.leaseOwner),
        eq(emailDeliveries.leaseVersion, input.leaseVersion),
        gt(emailDeliveries.leaseExpiresAt, input.now),
      ),
    );
  return Number(result[0].affectedRows) === 1;
}

export async function finalizeDeliveryOutbox(
  executor: R1Executor,
  deliveryId: string,
  dedupeKey: string,
  status: "published" | "cancelled",
  now: Date,
): Promise<void> {
  await executor
    .update(outboxEvents)
    .set({
      status,
      publishedAt: status === "published" ? now : null,
      lastAttemptAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(outboxEvents.aggregateType, "email_delivery"),
        eq(outboxEvents.aggregateId, deliveryId),
        eq(outboxEvents.eventType, "auth.magic_link_delivery_queued"),
        eq(outboxEvents.dedupeKey, dedupeKey),
        or(eq(outboxEvents.status, "pending"), eq(outboxEvents.status, "processing")),
      ),
    );
}
