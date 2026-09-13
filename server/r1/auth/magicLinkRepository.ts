import { and, eq, gt, isNull, ne } from "drizzle-orm";
import {
  customerAccountIdentities,
  customerAccounts,
  magicLinkTokens,
  type InsertMagicLinkToken,
  type MagicLinkToken,
} from "../../../drizzle/schema";
import type { R1Executor } from "../database";

export type ConsumableMagicLink = {
  token: MagicLinkToken;
  accountId: string;
};

export async function revokeActiveMagicLinks(
  executor: R1Executor,
  identityId: string,
  now: Date,
  exceptTokenId?: string,
): Promise<void> {
  await executor
    .update(magicLinkTokens)
    .set({
      status: "revoked",
      revokedAt: now,
      revocationReasonCode: "superseded",
      updatedAt: now,
    })
    .where(
      and(
        eq(magicLinkTokens.customerAccountIdentityId, identityId),
        eq(magicLinkTokens.status, "active"),
        exceptTokenId ? ne(magicLinkTokens.id, exceptTokenId) : undefined,
      ),
    );
}

export async function insertMagicLinkToken(
  executor: R1Executor,
  token: InsertMagicLinkToken,
): Promise<void> {
  await executor.insert(magicLinkTokens).values(token);
}

export async function findConsumableMagicLinkByHash(
  executor: R1Executor,
  tokenHash: string,
  now: Date,
): Promise<ConsumableMagicLink | null> {
  const rows = await executor
    .select({ token: magicLinkTokens, accountId: customerAccounts.id })
    .from(magicLinkTokens)
    .innerJoin(
      customerAccountIdentities,
      eq(customerAccountIdentities.id, magicLinkTokens.customerAccountIdentityId),
    )
    .innerJoin(
      customerAccounts,
      eq(customerAccounts.id, customerAccountIdentities.customerAccountId),
    )
    .where(
      and(
        eq(magicLinkTokens.tokenHash, tokenHash),
        eq(magicLinkTokens.status, "active"),
        isNull(magicLinkTokens.consumedAt),
        isNull(magicLinkTokens.revokedAt),
        gt(magicLinkTokens.expiresAt, now),
        eq(customerAccountIdentities.status, "active"),
        eq(customerAccounts.status, "active"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function consumeMagicLinkToken(
  executor: R1Executor,
  input: {
    tokenId: string;
    sessionId: string;
    now: Date;
  },
): Promise<boolean> {
  const result = await executor
    .update(magicLinkTokens)
    .set({
      status: "consumed",
      consumedAt: input.now,
      consumedByCustomerSessionId: input.sessionId,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(magicLinkTokens.id, input.tokenId),
        eq(magicLinkTokens.status, "active"),
        isNull(magicLinkTokens.consumedAt),
        isNull(magicLinkTokens.revokedAt),
        gt(magicLinkTokens.expiresAt, input.now),
      ),
    );
  return Number(result[0].affectedRows) === 1;
}

export async function findMagicLinkTokenById(
  executor: R1Executor,
  tokenId: string,
): Promise<MagicLinkToken | null> {
  const rows = await executor
    .select()
    .from(magicLinkTokens)
    .where(eq(magicLinkTokens.id, tokenId))
    .limit(1);
  return rows[0] ?? null;
}
