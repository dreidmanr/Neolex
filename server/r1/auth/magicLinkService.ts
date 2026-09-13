import { appendAuditEvent } from "../audit/auditRepository";
import { ENV } from "../../_core/env";
import { requireR1Database } from "../database";
import {
  hasEmailDeliveryDedupeKey,
  insertEmailDelivery,
} from "../email/emailDeliveryRepository";
import { outboxDedupeKey, type AppendOutboxEvent } from "../events/contracts";
import { newR1Id } from "../ids";
import { appendOutboxEvent } from "../outbox/outboxRepository";
import { assertMagicLinkTestAllowed } from "../releaseGate";
import {
  findActiveEmailIdentityByHash,
  hashNormalizedEmailIdentity,
} from "./customerAccountRepository";
import { insertNewCustomerSession } from "./customerSessionService";
import { normalizeEmail } from "./emailNormalization";
import {
  deriveMagicLinkVerifier,
  hashMagicLinkVerifier,
  verifyMagicLinkVerifier,
} from "./magicLinkToken";
import {
  consumeMagicLinkToken as consumeTokenRow,
  findConsumableMagicLinkByHash,
  insertMagicLinkToken,
  revokeActiveMagicLinks,
} from "./magicLinkRepository";
import {
  hashMagicLinkRateLimitBucket,
  takeMagicLinkRateLimit,
} from "./rateLimitStore";

export const MAGIC_LINK_LIFETIME_MS = 15 * 60 * 1000;
export const MAGIC_LINK_TOKEN_KEY_VERSION = 1;
export const MAGIC_LINK_ACCEPTED = Object.freeze({ accepted: true as const });

export async function requestMagicLink(
  rawEmail: string,
  requestId: string,
  now = new Date(),
): Promise<typeof MAGIC_LINK_ACCEPTED> {
  assertMagicLinkTestAllowed();
  let normalized: string;
  try {
    normalized = normalizeEmail(rawEmail);
  } catch {
    return MAGIC_LINK_ACCEPTED;
  }

  try {
    const db = await requireR1Database();
    const identityHash = hashNormalizedEmailIdentity(normalized, ENV.emailIdentityPepper);
    const bucketHash = hashMagicLinkRateLimitBucket(normalized, ENV.rateLimitPepper);
    await db.transaction(async tx => {
      const rateLimit = await takeMagicLinkRateLimit(tx, bucketHash, now);
      if (!rateLimit.allowed) return;
      const owner = await findActiveEmailIdentityByHash(tx, identityHash);
      if (!owner) return;

      const deliveryDedupeKey = `magic-link-delivery:${owner.identity.id}:${rateLimit.windowMillis}:v1`;
      if (await hasEmailDeliveryDedupeKey(tx, deliveryDedupeKey)) return;

      const tokenId = newR1Id("magic");
      const deliveryId = newR1Id("delivery");
      const correlationId = newR1Id("correlation");
      const verifier = deriveMagicLinkVerifier(tokenId, ENV.magicLinkSecret);
      await revokeActiveMagicLinks(tx, owner.identity.id, now);
      await insertMagicLinkToken(tx, {
        id: tokenId,
        customerAccountIdentityId: owner.identity.id,
        tokenHash: hashMagicLinkVerifier(verifier, ENV.magicLinkSecret),
        requestScope: "magic_login",
        tokenKeyVersion: MAGIC_LINK_TOKEN_KEY_VERSION,
        status: "active",
        expiresAt: new Date(now.getTime() + MAGIC_LINK_LIFETIME_MS),
        correlationId,
        createdAt: now,
        updatedAt: now,
      });
      await insertEmailDelivery(tx, {
        id: deliveryId,
        magicLinkTokenId: tokenId,
        customerAccountIdentityId: owner.identity.id,
        deliveryKind: "magic_link_v1",
        status: "queued",
        dedupeKey: deliveryDedupeKey,
        attemptCount: 0,
        leaseVersion: 0,
        templateVersion: "magic_link_v1",
        createdAt: now,
        updatedAt: now,
      });
      await appendAuditEvent(tx, {
        actorType: "service",
        actorId: "magic_link_issuer",
        aggregateType: "magic_link_token",
        aggregateId: tokenId,
        eventType: "auth.magic_link_issued",
        outcome: "succeeded",
        toStatus: "active",
        requestId,
        correlationId,
        privacySafeMetadata: {
          identityId: owner.identity.id,
          keyVersion: MAGIC_LINK_TOKEN_KEY_VERSION,
          test: true,
          rateLimitCount: rateLimit.count,
        },
        createdAt: now,
      });
      const event: AppendOutboxEvent = {
        aggregateType: "email_delivery",
        aggregateId: deliveryId,
        eventType: "auth.magic_link_delivery_queued",
        privacySafePayload: {
          deliveryId,
          tokenId,
          identityId: owner.identity.id,
          keyVersion: MAGIC_LINK_TOKEN_KEY_VERSION,
          windowMillis: rateLimit.windowMillis,
          test: true,
        },
        createdAt: now,
      };
      if (outboxDedupeKey(event) !== deliveryDedupeKey) {
        throw new Error("Delivery dedupe contract mismatch");
      }
      await appendOutboxEvent(tx, event);
    });
  } catch {
    // The public request contract is deliberately neutral for duplicates and
    // unavailable persistence/configuration after the explicit gate check.
  }
  return MAGIC_LINK_ACCEPTED;
}

export type ConsumeMagicLinkResult =
  | { consumed: false }
  | { consumed: true; sessionToken: string; expiresAt: Date };

export async function consumeMagicLink(
  rawToken: string,
  requestId: string,
  now = new Date(),
): Promise<ConsumeMagicLinkResult> {
  assertMagicLinkTestAllowed();
  if (typeof rawToken !== "string" || rawToken.length !== 43) return { consumed: false };

  let tokenHash: string;
  try {
    tokenHash = hashMagicLinkVerifier(rawToken, ENV.magicLinkSecret);
  } catch {
    return { consumed: false };
  }
  try {
    const db = await requireR1Database();
    return await db.transaction(async tx => {
      const candidate = await findConsumableMagicLinkByHash(tx, tokenHash, now);
      if (!candidate) return { consumed: false } as const;
      if (!verifyMagicLinkVerifier(rawToken, candidate.token.tokenHash, ENV.magicLinkSecret)) {
        return { consumed: false } as const;
      }

      const session = await insertNewCustomerSession(tx, candidate.accountId, now);
      const consumed = await consumeTokenRow(tx, {
        tokenId: candidate.token.id,
        sessionId: session.id,
        now,
      });
      if (!consumed) throw new MagicLinkRaceLostError();
      await appendAuditEvent(tx, {
        actorType: "service",
        actorId: "magic_link_consumer",
        aggregateType: "magic_link_token",
        aggregateId: candidate.token.id,
        eventType: "auth.magic_link_consumed",
        outcome: "succeeded",
        fromStatus: "active",
        toStatus: "consumed",
        requestId,
        correlationId: candidate.token.correlationId,
        privacySafeMetadata: {
          sessionId: session.id,
          keyVersion: candidate.token.tokenKeyVersion,
          test: true,
        },
        createdAt: now,
      });
      return {
        consumed: true as const,
        sessionToken: session.rawToken,
        expiresAt: session.expiresAt,
      };
    });
  } catch {
    // Invalid, raced, duplicate, and unavailable persistence/configuration all
    // share the same public consume result. Transaction rollback removes any
    // session inserted by a conditional-consume loser.
    return { consumed: false };
  }
}

class MagicLinkRaceLostError extends Error {}
