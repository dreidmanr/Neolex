import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  customerAccountIdentities,
  customerAccounts,
  type CustomerAccount,
  type CustomerAccountIdentity,
} from "../../../drizzle/schema";
import { ENV } from "../../_core/env";
import { requireR1Database, type R1Executor } from "../database";
import {
  registerR1TestInboxIdentity,
  R1_TEST_HARNESS_IDENTITY,
} from "../email/testMailbox";
import { newR1Id } from "../ids";
import { assertMagicLinkTestAllowed } from "../releaseGate";
import {
  EMAIL_NORMALIZATION_VERSION,
  normalizeEmail,
} from "./emailNormalization";

const EMAIL_IDENTITY_HASH_DOMAIN = "lexy:r1:email-identity:v1\u0000";

export type ActiveEmailIdentity = {
  account: CustomerAccount;
  identity: CustomerAccountIdentity;
};

export function hashNormalizedEmailIdentity(
  normalizedEmail: string,
  pepper: string,
): string {
  if (pepper.length < 32) throw new Error("Email identity configuration is unavailable");
  return createHmac("sha256", pepper)
    .update(EMAIL_IDENTITY_HASH_DOMAIN)
    .update(EMAIL_NORMALIZATION_VERSION)
    .update("\u0000")
    .update(normalizedEmail, "utf8")
    .digest("hex");
}

export async function findActiveEmailIdentityByHash(
  executor: R1Executor,
  identityHash: string,
): Promise<ActiveEmailIdentity | null> {
  const rows = await executor
    .select({ account: customerAccounts, identity: customerAccountIdentities })
    .from(customerAccountIdentities)
    .innerJoin(
      customerAccounts,
      eq(customerAccounts.id, customerAccountIdentities.customerAccountId),
    )
    .where(
      and(
        eq(customerAccountIdentities.identityType, "email"),
        eq(customerAccountIdentities.identityHash, identityHash),
        eq(customerAccountIdentities.status, "active"),
        eq(customerAccounts.status, "active"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function provisionMagicLinkTestIdentity(rawEmail: string): Promise<{
  accountId: string;
  identityId: string;
}> {
  assertMagicLinkTestAllowed();
  const normalized = normalizeEmail(rawEmail);
  const identityHash = hashNormalizedEmailIdentity(normalized, ENV.emailIdentityPepper);
  const db = await requireR1Database();
  let provisioned: { accountId: string; identityId: string };
  try {
    provisioned = await db.transaction(async tx => {
      const existing = await findIdentityByHash(tx, identityHash);
      if (existing) return existing;

      const now = new Date();
      const accountId = newR1Id("account");
      const identityId = newR1Id("identity");
      await tx.insert(customerAccounts).values({
        id: accountId,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(customerAccountIdentities).values({
        id: identityId,
        customerAccountId: accountId,
        identityType: "email",
        identityHash,
        status: "active",
        createdAt: now,
      });
      return { accountId, identityId };
    });
  } catch (error) {
    if (!isDuplicateEntry(error)) throw error;
    const duplicate = await findIdentityByHash(db, identityHash);
    if (!duplicate) throw new Error("Test identity provisioning failed");
    provisioned = duplicate;
  }

  if (!registerR1TestInboxIdentity(R1_TEST_HARNESS_IDENTITY, provisioned.identityId)) {
    throw new Error("Test inbox registration failed");
  }
  return provisioned;
}

async function findIdentityByHash(
  executor: R1Executor,
  identityHash: string,
): Promise<{ accountId: string; identityId: string } | null> {
  const rows = await executor
    .select({
      accountId: customerAccountIdentities.customerAccountId,
      identityId: customerAccountIdentities.id,
    })
    .from(customerAccountIdentities)
    .where(
      and(
        eq(customerAccountIdentities.identityType, "email"),
        eq(customerAccountIdentities.identityHash, identityHash),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

function isDuplicateEntry(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  return candidate.code === "ER_DUP_ENTRY" || candidate.cause?.code === "ER_DUP_ENTRY";
}

export async function countCustomerAccounts(): Promise<number> {
  const db = await requireR1Database();
  const rows = await db.select({ id: customerAccounts.id }).from(customerAccounts);
  return rows.length;
}
