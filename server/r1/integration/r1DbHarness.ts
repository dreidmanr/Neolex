import { randomBytes } from "node:crypto";
import type { TrpcContext } from "../../_core/context";
import { getDb } from "../../db";
import {
  authRateLimitBuckets,
  auditEvents,
  customerAccountIdentities,
  customerAccounts,
  customerSessions,
  diagnosticCases,
  emailDeliveries,
  idempotencyRecords,
  magicLinkTokens,
  outboxEvents,
  type User,
} from "../../../drizzle/schema";
import { and, eq, like, or } from "drizzle-orm";

const SAFE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
export const RUN_PREFIX = `r1it_${randomBytes(6).toString("hex")}`;
export const ACCOUNT_A = `${RUN_PREFIX}_acct_a`;
export const ACCOUNT_B = `${RUN_PREFIX}_acct_b`;
export const CASE_A = `${RUN_PREFIX}_case_a`;
export const CASE_B = `${RUN_PREFIX}_case_b`;
export const PUBLIC_A = `${RUN_PREFIX}_public_case_a`;
export const PUBLIC_B = `${RUN_PREFIX}_public_case_b`;
export const SESSION_A = `${RUN_PREFIX}_session_a`;
export const SESSION_B = `${RUN_PREFIX}_session_b`;

export function assertSafeTestEnvironment(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is required for R1 integration tests");

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("R1 integration DATABASE_URL is invalid");
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (
    !["mysql:", "mariadb:"].includes(parsed.protocol) ||
    !SAFE_HOSTS.has(parsed.hostname) ||
    !databaseName.startsWith("lexy_r1_test_") ||
    process.env.NODE_ENV !== "test" ||
    process.env.LEXY_R1_SYNTHETIC_TEST_MODE !== "true" ||
    process.env.LEXY_R1_TEST_IDENTITY !== "r1-harness" ||
    process.env.LEXY_R1_DATABASE_CLASS !== "disposable_test"
  ) {
    throw new Error("Unsafe R1 integration environment");
  }

  const customerSecret = process.env.LEXY_CUSTOMER_SESSION_SECRET ?? "";
  const jwtSecret = process.env.JWT_SECRET ?? "";
  if (customerSecret.length < 32 || jwtSecret.length < 32 || customerSecret === jwtSecret) {
    throw new Error("R1 integration secrets must be long and dedicated");
  }
  const magicSecrets = [
    process.env.LEXY_R1_MAGIC_LINK_SECRET ?? "",
    process.env.LEXY_R1_EMAIL_IDENTITY_PEPPER ?? "",
    process.env.LEXY_R1_RATE_LIMIT_PEPPER ?? "",
  ];
  if (
    process.env.LEXY_R1_EMAIL_TRANSPORT !== "test" ||
    magicSecrets.some(secret => secret.length < 32) ||
    new Set([...magicSecrets, customerSecret, jwtSecret]).size !== 5
  ) {
    throw new Error("R1 Magic Link integration secrets must be long and dedicated");
  }
}

export async function db() {
  assertSafeTestEnvironment();
  const database = await getDb();
  if (!database) throw new Error("R1 integration database is unavailable");
  return database;
}

export async function cleanRunData(): Promise<void> {
  const database = await db();
  const identities = await database
    .select({ accountId: customerAccountIdentities.customerAccountId })
    .from(customerAccountIdentities);
  const magicAccountIds = identities.map(row => row.accountId);
  await database.delete(outboxEvents).where(
    or(
      like(outboxEvents.aggregateId, `${RUN_PREFIX}%`),
      eq(outboxEvents.eventType, "auth.magic_link_delivery_queued"),
    ),
  );
  await database.delete(auditEvents).where(
    or(
      like(auditEvents.aggregateId, `${RUN_PREFIX}%`),
      like(auditEvents.actorId, `${RUN_PREFIX}%`),
      like(auditEvents.requestId, `${RUN_PREFIX}%`),
      eq(auditEvents.eventType, "auth.magic_link_issued"),
      eq(auditEvents.eventType, "auth.magic_link_consumed"),
      eq(auditEvents.eventType, "auth.customer_session_revoked"),
    ),
  );
  await database.delete(idempotencyRecords).where(
    or(
      like(idempotencyRecords.id, `${RUN_PREFIX}%`),
      like(idempotencyRecords.customerAccountId, `${RUN_PREFIX}%`),
    ),
  );
  await database.delete(diagnosticCases).where(like(diagnosticCases.id, `${RUN_PREFIX}%`));
  await database.delete(emailDeliveries);
  await database.delete(magicLinkTokens);
  await database.delete(customerSessions);
  await database.delete(customerAccountIdentities);
  await database.delete(authRateLimitBuckets);
  for (const accountId of magicAccountIds) {
    await database.delete(customerAccounts).where(eq(customerAccounts.id, accountId));
  }
  await database.delete(customerAccounts).where(like(customerAccounts.id, `${RUN_PREFIX}%`));
}

export async function seedOwners(): Promise<void> {
  const database = await db();
  const now = new Date();
  await database.insert(customerAccounts).values([
    { id: ACCOUNT_A, status: "active", createdAt: now, updatedAt: now },
    { id: ACCOUNT_B, status: "active", createdAt: now, updatedAt: now },
  ]);
  await database.insert(diagnosticCases).values([
    {
      id: CASE_A,
      publicId: PUBLIC_A,
      customerAccountId: ACCOUNT_A,
      serviceTier: "base_diagnostic",
      status: "draft",
      stateVersion: 1,
      createdAt: new Date(now.getTime() - 1_000),
      updatedAt: new Date(now.getTime() - 1_000),
    },
    {
      id: CASE_B,
      publicId: PUBLIC_B,
      customerAccountId: ACCOUNT_B,
      serviceTier: "base_diagnostic",
      status: "draft",
      stateVersion: 1,
      createdAt: now,
      updatedAt: now,
    },
  ]);
}

export function context(input: {
  user?: Partial<User> | null;
  customer?: TrpcContext["customer"];
  requestId?: string;
  authorization?: string;
  cookie?: string;
} = {}): TrpcContext {
  return {
    user: input.user === undefined ? null : input.user as User | null,
    customer: input.customer ?? null,
    requestId: input.requestId ?? `${RUN_PREFIX}_request_0001`,
    req: {
      headers: {
        ...(input.authorization ? { authorization: input.authorization } : {}),
        ...(input.cookie ? { cookie: input.cookie } : {}),
      },
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

export async function countRows(input: {
  caseId?: string;
  accountId?: string;
  requestId?: string;
}): Promise<{ cases: number; idempotency: number; audit: number; outbox: number }> {
  const database = await db();
  const caseRows = input.caseId
    ? await database.select({ id: diagnosticCases.id }).from(diagnosticCases)
        .where(eq(diagnosticCases.id, input.caseId))
    : [];
  const idempotencyRows = input.accountId
    ? await database.select({ id: idempotencyRecords.id }).from(idempotencyRecords)
        .where(eq(idempotencyRecords.customerAccountId, input.accountId))
    : [];
  const auditRows = await database.select({ id: auditEvents.id }).from(auditEvents).where(
    and(
      input.caseId ? eq(auditEvents.aggregateId, input.caseId) : like(auditEvents.aggregateId, `${RUN_PREFIX}%`),
      input.requestId ? eq(auditEvents.requestId, input.requestId) : undefined,
    ),
  );
  const outboxRows = input.caseId
    ? await database.select({ id: outboxEvents.id }).from(outboxEvents)
        .where(eq(outboxEvents.aggregateId, input.caseId))
    : [];
  return {
    cases: caseRows.length,
    idempotency: idempotencyRows.length,
    audit: auditRows.length,
    outbox: outboxRows.length,
  };
}

assertSafeTestEnvironment();
