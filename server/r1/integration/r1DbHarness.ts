import { randomBytes } from "node:crypto";
import { hashNormalizedEmailIdentity } from "../auth/customerAccountRepository";
import { hashMagicLinkRateLimitBucket } from "../auth/rateLimitStore";
import type { TrpcContext } from "../../_core/context";
import { getDb } from "../../db";
import {
  accessGrants,
  authRateLimitBuckets,
  auditEvents,
  caseConsents,
  creditEntitlements,
  customerAccountIdentities,
  customerAccounts,
  customerSessions,
  diagnosticCases,
  emailDeliveries,
  idempotencyRecords,
  magicLinkTokens,
  outboxEvents,
  paymentRecords,
  questionnaireAnswerRevisions,
  questionnaireDrafts,
  questionnaireRuleEvaluations,
  questionnaireSubmissions,
  reportSnapshots,
  tariffSnapshots,
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

const runEmails = new Set([
  `${RUN_PREFIX}@example.test`,
  `${RUN_PREFIX}_unknown@example.test`,
  `${RUN_PREFIX}_logout@example.test`,
  `${RUN_PREFIX}_lease@example.test`,
  `${RUN_PREFIX}_worker@example.test`,
]);

export function registerRunEmail(email: string): string {
  if (!email.startsWith(`${RUN_PREFIX}_`) || !email.endsWith("@example.test")) {
    throw new Error("R1 integration cleanup email is outside the current run");
  }
  runEmails.add(email);
  return email;
}

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
  const promoSecrets = [
    process.env.LEXY_R1_PROMO_VERIFIER ?? "",
    process.env.LEXY_R1_PROMO_VERIFIER_PEPPER ?? "",
  ];
  const questionnairePepper = process.env.LEXY_R1_QUESTIONNAIRE_IDEMPOTENCY_PEPPER ?? "";
  if (
    process.env.LEXY_R1_EMAIL_TRANSPORT !== "test" ||
    process.env.LEXY_R1_PAYMENT_PROVIDER !== "disabled" ||
    !/^[A-Za-z][A-Za-z0-9_-]{2,63}$/.test(process.env.LEXY_R1_PROMO_CAMPAIGN_ID ?? "") ||
    [...magicSecrets, ...promoSecrets, questionnairePepper].some(secret => secret.length < 32) ||
    new Set([
      ...magicSecrets,
      ...promoSecrets,
      questionnairePepper,
      customerSecret,
      jwtSecret,
    ]).size !== 8
  ) {
    throw new Error("R1 integration authority secrets must be long and dedicated");
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
  const identityHashes = new Set(Array.from(runEmails, email =>
    hashNormalizedEmailIdentity(email, process.env.LEXY_R1_EMAIL_IDENTITY_PEPPER!),
  ));
  const bucketHashes = new Set(Array.from(runEmails, email =>
    hashMagicLinkRateLimitBucket(email, process.env.LEXY_R1_RATE_LIMIT_PEPPER!),
  ));
  const allIdentities = await database.select().from(customerAccountIdentities);
  const runIdentities = allIdentities.filter(row =>
    identityHashes.has(row.identityHash) ||
    row.customerAccountId === ACCOUNT_A ||
    row.customerAccountId === ACCOUNT_B
  );
  const runAccountIds = new Set([ACCOUNT_A, ACCOUNT_B, ...runIdentities.map(row => row.customerAccountId)]);
  const runIdentityIds = new Set(runIdentities.map(row => row.id));

  const allDeliveries = await database.select().from(emailDeliveries);
  const runDeliveries = allDeliveries.filter(row => runIdentityIds.has(row.customerAccountIdentityId));
  const allTokens = await database.select().from(magicLinkTokens);
  const runTokens = allTokens.filter(row => runIdentityIds.has(row.customerAccountIdentityId));
  const allCases = await database.select().from(diagnosticCases);
  const runCases = allCases.filter(row => runAccountIds.has(row.customerAccountId));
  const allPayments = await database.select().from(paymentRecords);
  const runPayments = allPayments.filter(row => runAccountIds.has(row.customerAccountId));
  const allGrants = await database.select().from(accessGrants);
  const runGrants = allGrants.filter(row => runAccountIds.has(row.customerAccountId));
  const runCaseIds = new Set(runCases.map(row => row.id));
  const allDrafts = await database.select().from(questionnaireDrafts);
  const runDrafts = allDrafts.filter(row =>
    runAccountIds.has(row.customerAccountId) && runCaseIds.has(row.diagnosticCaseId)
  );
  const runDraftIds = new Set(runDrafts.map(row => row.id));
  const allAnswerRevisions = await database.select().from(questionnaireAnswerRevisions);
  const runAnswerRevisions = allAnswerRevisions.filter(row =>
    runAccountIds.has(row.customerAccountId) &&
    runCaseIds.has(row.diagnosticCaseId) &&
    runDraftIds.has(row.questionnaireDraftId)
  );
  const allSubmissions = await database.select().from(questionnaireSubmissions);
  const runSubmissions = allSubmissions.filter(row =>
    runAccountIds.has(row.customerAccountId) &&
    runCaseIds.has(row.diagnosticCaseId) &&
    runDraftIds.has(row.questionnaireDraftId)
  );
  const allRuleEvaluations = await database.select().from(questionnaireRuleEvaluations);
  const runRuleEvaluations = allRuleEvaluations.filter(row =>
    runAccountIds.has(row.customerAccountId) &&
    runCaseIds.has(row.diagnosticCaseId)
  );
  const allReportSnapshots = await database.select().from(reportSnapshots);
  const runReportSnapshots = allReportSnapshots.filter(row =>
    runAccountIds.has(row.customerAccountId) &&
    runCaseIds.has(row.diagnosticCaseId)
  );

  const aggregateIds = new Set([
    ...runDeliveries.map(row => row.id), ...runTokens.map(row => row.id),
    ...runCases.map(row => row.id), ...runPayments.map(row => row.id), ...runGrants.map(row => row.id),
    ...runDrafts.map(row => row.id), ...runAnswerRevisions.map(row => row.id),
    ...runSubmissions.map(row => row.id),
    ...runRuleEvaluations.map(row => row.id),
    ...runReportSnapshots.map(row => row.id),
  ]);
  for (const accountId of Array.from(runAccountIds)) {
    await database.delete(creditEntitlements)
      .where(eq(creditEntitlements.customerAccountId, accountId));
    await database.delete(reportSnapshots)
      .where(eq(reportSnapshots.customerAccountId, accountId));
    await database.delete(questionnaireRuleEvaluations)
      .where(eq(questionnaireRuleEvaluations.customerAccountId, accountId));
  }
  for (const aggregateId of Array.from(aggregateIds)) {
    await database.delete(outboxEvents).where(eq(outboxEvents.aggregateId, aggregateId));
    await database.delete(auditEvents).where(eq(auditEvents.aggregateId, aggregateId));
  }
  await database.delete(outboxEvents).where(like(outboxEvents.aggregateId, `${RUN_PREFIX}%`));
  await database.delete(auditEvents).where(or(
    like(auditEvents.aggregateId, `${RUN_PREFIX}%`),
    like(auditEvents.actorId, `${RUN_PREFIX}%`),
    like(auditEvents.requestId, `${RUN_PREFIX}%`),
  ));

  for (const accountId of Array.from(runAccountIds)) {
    await database.delete(idempotencyRecords).where(eq(idempotencyRecords.customerAccountId, accountId));
    await database.delete(accessGrants).where(eq(accessGrants.customerAccountId, accountId));
    await database.delete(paymentRecords).where(eq(paymentRecords.customerAccountId, accountId));
    await database.delete(caseConsents).where(eq(caseConsents.customerAccountId, accountId));
    await database.delete(questionnaireAnswerRevisions)
      .where(eq(questionnaireAnswerRevisions.customerAccountId, accountId));
    await database.delete(questionnaireSubmissions)
      .where(eq(questionnaireSubmissions.customerAccountId, accountId));
    await database.delete(questionnaireDrafts)
      .where(eq(questionnaireDrafts.customerAccountId, accountId));
    await database.delete(diagnosticCases).where(eq(diagnosticCases.customerAccountId, accountId));
  }
  for (const identityId of Array.from(runIdentityIds)) {
    await database.delete(emailDeliveries).where(eq(emailDeliveries.customerAccountIdentityId, identityId));
    await database.delete(magicLinkTokens).where(eq(magicLinkTokens.customerAccountIdentityId, identityId));
  }
  for (const accountId of Array.from(runAccountIds)) {
    await database.delete(customerSessions).where(eq(customerSessions.customerAccountId, accountId));
    await database.delete(customerAccountIdentities).where(eq(customerAccountIdentities.customerAccountId, accountId));
    await database.delete(customerAccounts).where(eq(customerAccounts.id, accountId));
  }
  const allBuckets = await database.select().from(authRateLimitBuckets);
  for (const bucket of allBuckets.filter(row => bucketHashes.has(row.bucketHash))) {
    await database.delete(authRateLimitBuckets).where(eq(authRateLimitBuckets.id, bucket.id));
  }
  for (const payment of runPayments) {
    await database.delete(tariffSnapshots).where(eq(tariffSnapshots.id, payment.tariffSnapshotId));
  }
}

export async function seedOwners(): Promise<void> {
  const database = await db();
  const now = new Date();
  await database.insert(customerAccounts).values([
    { id: ACCOUNT_A, status: "active", createdAt: now, updatedAt: now },
    { id: ACCOUNT_B, status: "active", createdAt: now, updatedAt: now },
  ]);
  await database.insert(customerSessions).values([
    { id: SESSION_A, customerAccountId: ACCOUNT_A, tokenHash: `${RUN_PREFIX}_token_hash_a`, status: "active", expiresAt: new Date(now.getTime() + 60 * 60_000), createdAt: now },
    { id: SESSION_B, customerAccountId: ACCOUNT_B, tokenHash: `${RUN_PREFIX}_token_hash_b`, status: "active", expiresAt: new Date(now.getTime() + 60 * 60_000), createdAt: now },
  ]);
  await database.insert(diagnosticCases).values([
    {
      id: CASE_A,
      publicId: PUBLIC_A,
      customerAccountId: ACCOUNT_A,
      serviceTier: "lexy-advanced-diagnostic",
      status: "draft",
      stateVersion: 1,
      createdAt: new Date(now.getTime() - 1_000),
      updatedAt: new Date(now.getTime() - 1_000),
    },
    {
      id: CASE_B,
      publicId: PUBLIC_B,
      customerAccountId: ACCOUNT_B,
      serviceTier: "lexy-advanced-diagnostic",
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
