import { createHash, createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  accessGrants,
  auditEvents,
  caseConsents,
  customerSessions,
  diagnosticCases,
  idempotencyRecords,
  outboxEvents,
  paymentRecords,
  tariffSnapshots,
} from "../../../drizzle/schema";
import { appendAuditEvent } from "../audit/auditRepository";
import { provisionMagicLinkTestIdentity } from "../auth/customerAccountRepository";
import { findActiveOwnedAccessGrant } from "../billing/accessPolicy";
import { revokeAccessGrant } from "../billing/accessGrantService";
import { redeemPromo, type RedeemPromoInput } from "../billing/promoService";
import {
  BASE_DIAGNOSTIC_TARIFF_CODE,
  TARIFF_CATALOG_VERSION,
} from "../billing/tariffService";
import type { R1Executor } from "../database";
import { getDocumentRegistryForValidation } from "../legal/documentRegistry";
import type { ConsentAssertion } from "../legal/consentService";
import { newR1Id } from "../ids";
import { appendOutboxEvent } from "../outbox/outboxRepository";
import { RUN_PREFIX, cleanRunData, db, registerRunEmail } from "./r1DbHarness";

const TEST_DATES = {
  happy: new Date("2027-01-10T10:00:00.000Z"),
  campaignChange: new Date("2027-01-10T11:00:00.000Z"),
  concurrent: new Date("2027-01-11T10:00:00.000Z"),
  invalidPromo: new Date("2027-01-12T10:00:00.000Z"),
  mandatoryConsent: new Date("2027-01-13T10:00:00.000Z"),
  staleConsent: new Date("2027-01-14T10:00:00.000Z"),
  policy: new Date("2027-01-15T10:00:00.000Z"),
  rollback: new Date("2027-01-16T10:00:00.000Z"),
  auditRollback: new Date("2027-01-17T10:00:00.000Z"),
  outboxRollback: new Date("2027-01-18T10:00:00.000Z"),
} as const;

const TEST_EMAILS = {
  happy: registerRunEmail(`${RUN_PREFIX}_promo_happy@example.test`),
  campaignChange: registerRunEmail(
    `${RUN_PREFIX}_promo_campaign_change@example.test`
  ),
  concurrent: registerRunEmail(`${RUN_PREFIX}_promo_concurrent@example.test`),
  invalidPromo: registerRunEmail(`${RUN_PREFIX}_promo_invalid@example.test`),
  mandatoryConsent: registerRunEmail(
    `${RUN_PREFIX}_promo_mandatory@example.test`
  ),
  staleConsent: registerRunEmail(`${RUN_PREFIX}_promo_stale@example.test`),
  policy: registerRunEmail(`${RUN_PREFIX}_promo_policy@example.test`),
  policyOther: registerRunEmail(
    `${RUN_PREFIX}_promo_policy_other@example.test`
  ),
  rollback: registerRunEmail(`${RUN_PREFIX}_promo_rollback@example.test`),
  auditRollback: registerRunEmail(
    `${RUN_PREFIX}_promo_audit_rollback@example.test`
  ),
  outboxRollback: registerRunEmail(
    `${RUN_PREFIX}_promo_outbox_rollback@example.test`
  ),
} as const;

type TestCustomer = {
  accountId: string;
  identityId: string;
  sessionId: string;
};

type AccountFacts = Awaited<ReturnType<typeof loadAccountFacts>>;

function decodeDbJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return JSON.parse(value) as unknown;
}

function fixedId(label: string): string {
  const id = `${RUN_PREFIX}_${label}`;
  if (id.length > 64) throw new Error("Test identifier is too long");
  return id;
}

async function provisionCustomer(
  email: string,
  label: string
): Promise<TestCustomer> {
  const database = await db();
  const identity = await provisionMagicLinkTestIdentity(email);
  const sessionId = newR1Id("session");
  await database.insert(customerSessions).values({
    id: sessionId,
    customerAccountId: identity.accountId,
    tokenHash: createHash("sha256")
      .update(`${RUN_PREFIX}:${label}:session`)
      .digest("hex"),
    status: "active",
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    createdAt: new Date("2027-01-01T00:00:00.000Z"),
  });
  return { ...identity, sessionId };
}

function canonicalConsents(marketingAccepted = false): ConsentAssertion[] {
  const registry = getDocumentRegistryForValidation();
  expect(
    registry.map(document => ({
      consentType: document.consentType,
      required: document.required,
      provenanceStatus: document.provenanceStatus,
    }))
  ).toEqual([
    {
      consentType: "terms",
      required: true,
      provenanceStatus: "draft_test_only",
    },
    {
      consentType: "data_processing",
      required: true,
      provenanceStatus: "draft_test_only",
    },
    {
      consentType: "marketing",
      required: false,
      provenanceStatus: "draft_test_only",
    },
  ]);

  return registry.map(document => ({
    documentId: document.documentId,
    documentVersion: document.documentVersion,
    contentHash: document.contentHash,
    consentType: document.consentType,
    accepted: document.consentType === "marketing" ? marketingAccepted : true,
  }));
}

function redemptionInput(
  customer: TestCustomer,
  label: string,
  now: Date,
  overrides: Partial<
    Pick<RedeemPromoInput, "promoValue" | "idempotencyKey" | "consents">
  > = {}
): RedeemPromoInput {
  const promoValue = process.env.LEXY_R1_PROMO_VERIFIER;
  if (!promoValue) throw new Error("Promo integration verifier is unavailable");
  return {
    customerAccountId: customer.accountId,
    customerSessionId: customer.sessionId,
    requestId: fixedId(`request_${label}`),
    tariffCode: BASE_DIAGNOSTIC_TARIFF_CODE,
    promoValue,
    idempotencyKey: fixedId(`idem_${label}`),
    consents: canonicalConsents(false),
    now,
    ...overrides,
  };
}

async function loadAccountFacts(
  accountId: string,
  actorIds: readonly string[] = []
) {
  const database = await db();
  const [
    cases,
    consents,
    payments,
    grants,
    idempotency,
    allSnapshots,
    allAudits,
    allOutboxes,
  ] = await Promise.all([
    database
      .select()
      .from(diagnosticCases)
      .where(eq(diagnosticCases.customerAccountId, accountId)),
    database
      .select()
      .from(caseConsents)
      .where(eq(caseConsents.customerAccountId, accountId)),
    database
      .select()
      .from(paymentRecords)
      .where(eq(paymentRecords.customerAccountId, accountId)),
    database
      .select()
      .from(accessGrants)
      .where(eq(accessGrants.customerAccountId, accountId)),
    database
      .select()
      .from(idempotencyRecords)
      .where(eq(idempotencyRecords.customerAccountId, accountId)),
    database.select().from(tariffSnapshots),
    database.select().from(auditEvents),
    database.select().from(outboxEvents),
  ]);
  const snapshotIds = new Set(
    payments.map(payment => payment.tariffSnapshotId)
  );
  const aggregateIds = new Set([
    ...cases.map(row => row.id),
    ...payments.map(row => row.id),
    ...grants.map(row => row.id),
  ]);
  return {
    cases,
    consents,
    payments,
    grants,
    idempotency: idempotency.map(row => ({
      ...row,
      responseJson: decodeDbJson(row.responseJson),
    })),
    snapshots: allSnapshots.filter(row => snapshotIds.has(row.id)),
    audits: allAudits
      .filter(
        row =>
          actorIds.includes(row.actorId) || aggregateIds.has(row.aggregateId)
      )
      .map(row => ({
        ...row,
        privacySafeMetadata: decodeDbJson(row.privacySafeMetadata),
      })),
    outboxes: allOutboxes
      .filter(row => aggregateIds.has(row.aggregateId))
      .map(row => ({
        ...row,
        privacySafePayload: decodeDbJson(row.privacySafePayload),
      })),
  };
}

function factIds(facts: AccountFacts) {
  return {
    cases: facts.cases.map(row => row.id).sort(),
    consents: facts.consents.map(row => row.id).sort(),
    payments: facts.payments.map(row => row.id).sort(),
    grants: facts.grants.map(row => row.id).sort(),
    idempotency: facts.idempotency.map(row => row.id).sort(),
    snapshots: facts.snapshots.map(row => row.id).sort(),
    audits: facts.audits.map(row => row.id).sort(),
    outboxes: facts.outboxes.map(row => row.id).sort(),
  };
}

async function expectNoRedemptionFacts(
  customer: TestCustomer,
  requestIds: readonly string[]
): Promise<void> {
  const database = await db();
  const facts = await loadAccountFacts(customer.accountId, [
    customer.sessionId,
  ]);
  expect(factIds(facts)).toEqual({
    cases: [],
    consents: [],
    payments: [],
    grants: [],
    idempotency: [],
    snapshots: [],
    audits: [],
    outboxes: [],
  });
  const requestAudits = (await database.select().from(auditEvents)).filter(
    row => row.requestId !== null && requestIds.includes(row.requestId)
  );
  expect(requestAudits).toHaveLength(0);
}

async function loadDetachedFactIds(): Promise<{
  snapshots: string[];
  outboxes: string[];
}> {
  const database = await db();
  const [snapshots, outboxes] = await Promise.all([
    database.select({ id: tariffSnapshots.id }).from(tariffSnapshots),
    database.select({ id: outboxEvents.id }).from(outboxEvents),
  ]);
  return {
    snapshots: snapshots.map(row => row.id).sort(),
    outboxes: outboxes.map(row => row.id).sort(),
  };
}

async function expectStagedRedemptionFacts(
  executor: R1Executor,
  customer: TestCustomer,
  input: RedeemPromoInput,
  expectedAuditCount: number
): Promise<void> {
  const cases = await executor
    .select()
    .from(diagnosticCases)
    .where(eq(diagnosticCases.customerAccountId, customer.accountId));
  const consents = await executor
    .select()
    .from(caseConsents)
    .where(eq(caseConsents.customerAccountId, customer.accountId));
  const payments = await executor
    .select()
    .from(paymentRecords)
    .where(eq(paymentRecords.customerAccountId, customer.accountId));
  const grants = await executor
    .select()
    .from(accessGrants)
    .where(eq(accessGrants.customerAccountId, customer.accountId));
  const idempotency = await executor
    .select()
    .from(idempotencyRecords)
    .where(eq(idempotencyRecords.customerAccountId, customer.accountId));
  const snapshots = payments[0]
    ? await executor
        .select()
        .from(tariffSnapshots)
        .where(eq(tariffSnapshots.id, payments[0].tariffSnapshotId))
    : [];
  const audits = await executor
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.requestId, input.requestId));

  expect(cases).toHaveLength(1);
  expect(cases[0]).toMatchObject({
    customerAccountId: customer.accountId,
    status: "access_granted",
    stateVersion: 2,
  });
  expect(consents).toHaveLength(3);
  expect(snapshots).toHaveLength(1);
  expect(payments).toHaveLength(1);
  expect(payments[0]).toMatchObject({
    customerAccountId: customer.accountId,
    diagnosticCaseId: cases[0]?.id,
    tariffSnapshotId: snapshots[0]?.id,
    status: "promo_granted",
  });
  expect(grants).toHaveLength(1);
  expect(grants[0]).toMatchObject({
    customerAccountId: customer.accountId,
    diagnosticCaseId: cases[0]?.id,
    paymentRecordId: payments[0]?.id,
    status: "active",
  });
  expect(idempotency).toHaveLength(1);
  expect(idempotency[0]?.status).toBe("pending");
  expect(audits).toHaveLength(expectedAuditCount);
}

function expectConflict(error: unknown): void {
  expect(error).toMatchObject({ code: "CONFLICT" });
}

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      collectKeys(child, keys);
    }
  }
  return keys;
}

function assertNoPromoSecretSerialization(
  rows: unknown,
  idempotencyKey: string
): void {
  const promoValue = process.env.LEXY_R1_PROMO_VERIFIER ?? "";
  const promoPepper = process.env.LEXY_R1_PROMO_VERIFIER_PEPPER ?? "";
  if (promoValue.length < 32 || promoPepper.length < 32) {
    throw new Error("Promo integration secrets are unavailable");
  }
  const promoDigest = createHmac("sha256", promoPepper)
    .update("lexy:r1:promo-verifier:v1\u0000")
    .update(promoValue, "utf8")
    .digest("hex");
  const plainDigest = createHash("sha256")
    .update(promoValue, "utf8")
    .digest("hex");
  const serialized = JSON.stringify(rows);
  const containsSensitiveValue = [
    promoValue,
    promoPepper,
    promoDigest,
    plainDigest,
    idempotencyKey,
  ].some(value => serialized.includes(value));
  expect(containsSensitiveValue).toBe(false);
  const forbiddenKeys = new Set([
    "promoValue",
    "promoVerifier",
    "verifier",
    "promoHash",
    "pepper",
  ]);
  expect([...collectKeys(rows)].filter(key => forbiddenKeys.has(key))).toEqual(
    []
  );
}

describe("R1 real promo access acceptance", () => {
  beforeAll(async () => {
    await cleanRunData();
  });

  afterAll(async () => {
    await cleanRunData();
  });

  it("atomically redeems once and enforces canonical idempotency without new facts", async () => {
    const customer = await provisionCustomer(TEST_EMAILS.happy, "promo_happy");
    const input = redemptionInput(customer, "promo_happy", TEST_DATES.happy);
    const response = await redeemPromo(input);

    expect(response).toEqual({
      casePublicId: expect.stringMatching(/^public_/),
      status: "access_granted",
      tariffCode: BASE_DIAGNOSTIC_TARIFF_CODE,
      accessStatus: "active",
    });
    expect(Object.keys(response).sort()).toEqual([
      "accessStatus",
      "casePublicId",
      "status",
      "tariffCode",
    ]);

    const initial = await loadAccountFacts(customer.accountId, [
      customer.sessionId,
    ]);
    expect(initial.cases).toHaveLength(1);
    const diagnosticCase = initial.cases[0]!;
    expect(diagnosticCase).toMatchObject({
      publicId: response.casePublicId,
      customerAccountId: customer.accountId,
      serviceTier: BASE_DIAGNOSTIC_TARIFF_CODE,
      status: "access_granted",
      stateVersion: 2,
    });

    expect(initial.consents).toHaveLength(3);
    expect(
      initial.consents.map(row => ({
        documentId: row.documentId,
        documentVersion: row.documentVersion,
        contentHash: row.contentHash,
        consentType: row.consentType,
        accepted: row.accepted,
        customerAccountId: row.customerAccountId,
        diagnosticCaseId: row.diagnosticCaseId,
        actorCustomerSessionId: row.actorCustomerSessionId,
      }))
    ).toEqual(
      expect.arrayContaining(
        canonicalConsents(false).map(consent =>
          expect.objectContaining({
            ...consent,
            customerAccountId: customer.accountId,
            diagnosticCaseId: diagnosticCase.id,
            actorCustomerSessionId: customer.sessionId,
          })
        )
      )
    );

    expect(initial.snapshots).toHaveLength(1);
    const snapshot = initial.snapshots[0]!;
    expect(snapshot).toMatchObject({
      tariffCode: BASE_DIAGNOSTIC_TARIFF_CODE,
      serviceTier: BASE_DIAGNOSTIC_TARIFF_CODE,
      provenanceStatus: "draft_test_only",
      catalogVersion: TARIFF_CATALOG_VERSION,
      currency: "RUB",
    });
    expect(
      Object.keys(snapshot).some(key => key.toLowerCase().includes("price"))
    ).toBe(false);

    expect(initial.payments).toHaveLength(1);
    const payment = initial.payments[0]!;
    expect(payment).toMatchObject({
      customerAccountId: customer.accountId,
      diagnosticCaseId: diagnosticCase.id,
      tariffSnapshotId: snapshot.id,
      tariffCode: BASE_DIAGNOSTIC_TARIFF_CODE,
      campaignId: process.env.LEXY_R1_PROMO_CAMPAIGN_ID,
      sourceType: "promo",
      status: "promo_granted",
      chargedAmount: 0,
      currency: "RUB",
    });

    expect(initial.grants).toHaveLength(1);
    const grant = initial.grants[0]!;
    expect(grant).toMatchObject({
      customerAccountId: customer.accountId,
      diagnosticCaseId: diagnosticCase.id,
      paymentRecordId: payment.id,
      status: "active",
      expiresAt: null,
      revokedAt: null,
      revocationReasonCode: null,
    });

    expect(initial.audits).toHaveLength(2);
    expect(initial.audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorType: "customer_session",
          actorId: customer.sessionId,
          aggregateType: "diagnostic_case",
          aggregateId: diagnosticCase.id,
          eventType: "diagnostic_case.status_changed",
          fromStatus: "draft",
          toStatus: "access_granted",
          outcome: "succeeded",
          reasonCode: "promo_redemption",
          requestId: input.requestId,
          privacySafeMetadata: { stateVersion: 2 },
        }),
        expect.objectContaining({
          actorType: "customer_session",
          actorId: customer.sessionId,
          aggregateType: "payment_record",
          aggregateId: payment.id,
          eventType: "billing.promo_granted",
          toStatus: "promo_granted",
          outcome: "succeeded",
          requestId: input.requestId,
          correlationId: payment.correlationId,
          privacySafeMetadata: {
            paymentId: payment.id,
            caseId: diagnosticCase.id,
            grantId: grant.id,
            tariffCode: BASE_DIAGNOSTIC_TARIFF_CODE,
            chargedAmount: 0,
            currency: "RUB",
            campaignId: process.env.LEXY_R1_PROMO_CAMPAIGN_ID,
            test: true,
          },
        }),
      ])
    );
    expect(
      initial.audits.every(row => typeof row.idempotencyKeyHash === "string")
    ).toBe(true);

    expect(initial.outboxes).toHaveLength(2);
    expect(initial.outboxes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          aggregateType: "diagnostic_case",
          aggregateId: diagnosticCase.id,
          eventType: "diagnostic_case.status_changed",
          status: "pending",
          privacySafePayload: {
            caseId: diagnosticCase.id,
            stateVersion: 2,
            status: "access_granted",
          },
        }),
        expect.objectContaining({
          aggregateType: "payment_record",
          aggregateId: payment.id,
          eventType: "billing.promo_granted",
          status: "pending",
          privacySafePayload: {
            paymentId: payment.id,
            caseId: diagnosticCase.id,
            grantId: grant.id,
            tariffCode: BASE_DIAGNOSTIC_TARIFF_CODE,
            chargedAmount: 0,
            currency: "RUB",
            campaignId: process.env.LEXY_R1_PROMO_CAMPAIGN_ID,
            test: true,
          },
        }),
      ])
    );
    expect(initial.idempotency).toHaveLength(1);
    expect(initial.idempotency[0]).toMatchObject({
      status: "completed",
      responseJson: response,
    });
    assertNoPromoSecretSerialization(initial, input.idempotencyKey);

    await expect(
      redeemPromo({
        ...input,
        requestId: fixedId("request_promo_happy_replay"),
      })
    ).resolves.toEqual(response);
    expect(
      factIds(await loadAccountFacts(customer.accountId, [customer.sessionId]))
    ).toEqual(factIds(initial));

    const changedCanonicalError = await redeemPromo({
      ...input,
      requestId: fixedId("request_promo_happy_changed"),
      consents: canonicalConsents(true),
    }).catch(error => error);
    expectConflict(changedCanonicalError);
    expect(
      factIds(await loadAccountFacts(customer.accountId, [customer.sessionId]))
    ).toEqual(factIds(initial));

    const differentKeyError = await redeemPromo({
      ...input,
      requestId: fixedId("request_promo_happy_second_key"),
      idempotencyKey: fixedId("idem_promo_happy_second"),
    }).catch(error => error);
    expectConflict(differentKeyError);
    expect(
      factIds(await loadAccountFacts(customer.accountId, [customer.sessionId]))
    ).toEqual(factIds(initial));
  });

  it("treats a campaign change as an idempotency fingerprint conflict before replay", async () => {
    const customer = await provisionCustomer(
      TEST_EMAILS.campaignChange,
      "promo_campaign_change"
    );
    const input = redemptionInput(
      customer,
      "promo_campaign_change",
      TEST_DATES.campaignChange
    );
    const response = await redeemPromo(input);
    const initial = await loadAccountFacts(customer.accountId, [
      customer.sessionId,
    ]);
    expect(initial.idempotency).toHaveLength(1);
    expect(initial.idempotency[0]).toMatchObject({
      status: "completed",
      responseJson: response,
    });

    const originalCampaignId = process.env.LEXY_R1_PROMO_CAMPAIGN_ID;
    if (!originalCampaignId) {
      throw new Error("Promo integration campaign is unavailable");
    }
    const changedCampaignId =
      originalCampaignId === "PromoCampaignChanged"
        ? "PromoCampaignChanged2"
        : "PromoCampaignChanged";

    try {
      vi.stubEnv("LEXY_R1_PROMO_CAMPAIGN_ID", changedCampaignId);
      vi.resetModules();
      const campaignChangedService = await import("../billing/promoService");
      const error = await campaignChangedService
        .redeemPromo(input)
        .catch(caught => caught);
      expectConflict(error);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }

    const after = await loadAccountFacts(customer.accountId, [
      customer.sessionId,
    ]);
    expect(factIds(after)).toEqual(factIds(initial));
    expect(after.idempotency[0]).toMatchObject({
      requestHash: initial.idempotency[0]?.requestHash,
      status: "completed",
      responseJson: response,
    });
    assertNoPromoSecretSerialization(after, input.idempotencyKey);
  });

  it("settles concurrent distinct keys with one success and no loser orphans", async () => {
    const customer = await provisionCustomer(
      TEST_EMAILS.concurrent,
      "promo_concurrent"
    );
    const first = redemptionInput(
      customer,
      "promo_concurrent_a",
      TEST_DATES.concurrent
    );
    const second = redemptionInput(
      customer,
      "promo_concurrent_b",
      TEST_DATES.concurrent
    );
    const settled = await Promise.allSettled([
      redeemPromo(first),
      redeemPromo(second),
    ]);
    const fulfilled = settled.filter(result => result.status === "fulfilled");
    const rejected = settled.filter(result => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expectConflict((rejected[0] as PromiseRejectedResult).reason);
    const winner = (
      fulfilled[0] as PromiseFulfilledResult<
        Awaited<ReturnType<typeof redeemPromo>>
      >
    ).value;
    expect(winner).toMatchObject({
      status: "access_granted",
      accessStatus: "active",
    });

    const facts = await loadAccountFacts(customer.accountId, [
      customer.sessionId,
    ]);
    expect(facts.cases).toHaveLength(1);
    expect(facts.consents).toHaveLength(3);
    expect(facts.snapshots).toHaveLength(1);
    expect(facts.payments).toHaveLength(1);
    expect(facts.grants).toHaveLength(1);
    expect(facts.idempotency).toHaveLength(1);
    expect(facts.idempotency[0]?.status).toBe("completed");
    expect(facts.audits).toHaveLength(2);
    expect(facts.outboxes).toHaveLength(2);
    expect(facts.cases[0]?.publicId).toBe(winner.casePublicId);
  });

  it("rejects a derived invalid promo before persisting redemption facts", async () => {
    const customer = await provisionCustomer(
      TEST_EMAILS.invalidPromo,
      "promo_invalid"
    );
    const rawPromo = process.env.LEXY_R1_PROMO_VERIFIER;
    if (!rawPromo) throw new Error("Promo integration verifier is unavailable");
    const invalidPromo = createHash("sha256")
      .update(rawPromo)
      .digest("base64url");
    expect(invalidPromo === rawPromo).toBe(false);
    const input = redemptionInput(
      customer,
      "promo_invalid",
      TEST_DATES.invalidPromo,
      {
        promoValue: invalidPromo,
      }
    );

    await expect(redeemPromo(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expectNoRedemptionFacts(customer, [input.requestId]);
  });

  it("rejects a false mandatory consent before persisting redemption facts", async () => {
    const customer = await provisionCustomer(
      TEST_EMAILS.mandatoryConsent,
      "promo_mandatory"
    );
    const invalidConsents = canonicalConsents(false).map(consent =>
      consent.consentType === "terms"
        ? { ...consent, accepted: false }
        : consent
    );
    const input = redemptionInput(
      customer,
      "promo_mandatory",
      TEST_DATES.mandatoryConsent,
      {
        consents: invalidConsents,
      }
    );

    await expect(redeemPromo(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expectNoRedemptionFacts(customer, [input.requestId]);
  });

  it("rejects stale consent metadata before persisting redemption facts", async () => {
    const customer = await provisionCustomer(
      TEST_EMAILS.staleConsent,
      "promo_stale"
    );
    const invalidConsents = canonicalConsents(false).map(consent =>
      consent.consentType === "data_processing"
        ? { ...consent, documentVersion: `${consent.documentVersion}_stale` }
        : consent
    );
    const input = redemptionInput(
      customer,
      "promo_stale",
      TEST_DATES.staleConsent,
      {
        consents: invalidConsents,
      }
    );

    await expect(redeemPromo(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expectNoRedemptionFacts(customer, [input.requestId]);
  });

  it("enforces owned active policy, revocation evidence, and direct-DB expiry", async () => {
    const database = await db();
    const owner = await provisionCustomer(TEST_EMAILS.policy, "promo_policy");
    const other = await provisionCustomer(
      TEST_EMAILS.policyOther,
      "promo_policy_other"
    );
    const ownerResponse = await redeemPromo(
      redemptionInput(owner, "promo_policy", TEST_DATES.policy)
    );
    const otherResponse = await redeemPromo(
      redemptionInput(other, "promo_policy_other", TEST_DATES.policy)
    );
    const ownerFacts = await loadAccountFacts(owner.accountId, [
      owner.sessionId,
    ]);
    const otherFacts = await loadAccountFacts(other.accountId, [
      other.sessionId,
    ]);
    const ownerCase = ownerFacts.cases[0]!;
    const ownerPayment = ownerFacts.payments[0]!;
    const ownerGrant = ownerFacts.grants[0]!;
    const otherCase = otherFacts.cases[0]!;
    const otherGrant = otherFacts.grants[0]!;
    expect(ownerCase.publicId).toBe(ownerResponse.casePublicId);
    expect(otherCase.publicId).toBe(otherResponse.casePublicId);

    await expect(
      findActiveOwnedAccessGrant(
        database,
        owner.accountId,
        ownerCase.id,
        TEST_DATES.policy
      )
    ).resolves.toMatchObject({
      grant: { id: ownerGrant.id },
      payment: { id: ownerPayment.id },
    });
    await expect(
      findActiveOwnedAccessGrant(
        database,
        other.accountId,
        ownerCase.id,
        TEST_DATES.policy
      )
    ).resolves.toBeNull();

    const paymentIdsBefore = ownerFacts.payments.map(row => row.id);
    const consentIdsBefore = ownerFacts.consents.map(row => row.id).sort();
    const revokeRequestId = fixedId("request_promo_revoke");
    const revokeActorId = fixedId("promo_revoke_service");
    const revokedAt = new Date("2027-01-15T11:00:00.000Z");
    await expect(
      revokeAccessGrant({
        accessGrantId: ownerGrant.id,
        customerAccountId: owner.accountId,
        diagnosticCaseId: ownerCase.id,
        actorId: revokeActorId,
        requestId: revokeRequestId,
        reasonCode: "test_revocation",
        now: revokedAt,
      })
    ).resolves.toEqual({ status: "revoked" });

    const revokedRows = await database
      .select()
      .from(accessGrants)
      .where(eq(accessGrants.id, ownerGrant.id));
    expect(revokedRows).toHaveLength(1);
    expect(revokedRows[0]).toMatchObject({
      status: "revoked",
      revokedAt,
      revocationReasonCode: "test_revocation",
    });
    await expect(
      findActiveOwnedAccessGrant(
        database,
        owner.accountId,
        ownerCase.id,
        new Date("2027-01-15T12:00:00.000Z")
      )
    ).resolves.toBeNull();

    const afterRevocation = await loadAccountFacts(owner.accountId, [
      owner.sessionId,
      revokeActorId,
    ]);
    expect(afterRevocation.payments.map(row => row.id)).toEqual(
      paymentIdsBefore
    );
    expect(afterRevocation.consents.map(row => row.id).sort()).toEqual(
      consentIdsBefore
    );
    expect(afterRevocation.audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorType: "service",
          actorId: revokeActorId,
          aggregateType: "access_grant",
          aggregateId: ownerGrant.id,
          eventType: "billing.access_revoked",
          fromStatus: "active",
          toStatus: "revoked",
          outcome: "succeeded",
          reasonCode: "test_revocation",
          requestId: revokeRequestId,
          privacySafeMetadata: {
            paymentId: ownerPayment.id,
            caseId: ownerCase.id,
            test: true,
          },
        }),
      ])
    );
    expect(afterRevocation.outboxes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          aggregateType: "access_grant",
          aggregateId: ownerGrant.id,
          eventType: "billing.access_revoked",
          status: "pending",
          privacySafePayload: {
            grantId: ownerGrant.id,
            paymentId: ownerPayment.id,
            caseId: ownerCase.id,
            reasonCode: "test_revocation",
            test: true,
          },
        }),
      ])
    );

    const expiresAt = new Date("2027-01-15T09:00:00.000Z");
    await database
      .update(accessGrants)
      .set({ expiresAt, updatedAt: expiresAt })
      .where(
        and(
          eq(accessGrants.id, otherGrant.id),
          eq(accessGrants.diagnosticCaseId, otherCase.id),
          eq(accessGrants.customerAccountId, other.accountId)
        )
      );
    await expect(
      findActiveOwnedAccessGrant(
        database,
        other.accountId,
        otherCase.id,
        TEST_DATES.policy
      )
    ).resolves.toBeNull();
  });

  it("rolls back case, snapshot, consents, idempotency, payment, and grant on a late unique conflict", async () => {
    const database = await db();
    const customer = await provisionCustomer(
      TEST_EMAILS.rollback,
      "promo_rollback"
    );
    const blockerCaseId = fixedId("promo_rollback_block_case");
    const blockerPublicId = fixedId("promo_rollback_block_public");
    const blockerSnapshotId = fixedId("promo_rollback_block_tariff");
    const blockerPaymentId = fixedId("promo_rollback_block_payment");
    await database.insert(diagnosticCases).values({
      id: blockerCaseId,
      publicId: blockerPublicId,
      customerAccountId: customer.accountId,
      serviceTier: BASE_DIAGNOSTIC_TARIFF_CODE,
      status: "draft",
      stateVersion: 1,
      createdAt: TEST_DATES.rollback,
      updatedAt: TEST_DATES.rollback,
    });
    await database.insert(tariffSnapshots).values({
      id: blockerSnapshotId,
      tariffCode: BASE_DIAGNOSTIC_TARIFF_CODE,
      serviceTier: BASE_DIAGNOSTIC_TARIFF_CODE,
      provenanceStatus: "draft_test_only",
      catalogVersion: TARIFF_CATALOG_VERSION,
      currency: "RUB",
      createdAt: TEST_DATES.rollback,
    });
    await database.insert(paymentRecords).values({
      id: blockerPaymentId,
      customerAccountId: customer.accountId,
      diagnosticCaseId: blockerCaseId,
      tariffSnapshotId: blockerSnapshotId,
      tariffCode: BASE_DIAGNOSTIC_TARIFF_CODE,
      campaignId: process.env.LEXY_R1_PROMO_CAMPAIGN_ID!,
      sourceType: "promo",
      status: "promo_granted",
      chargedAmount: 0,
      currency: "RUB",
      correlationId: fixedId("promo_rollback_correlation"),
      grantedAt: TEST_DATES.rollback,
      createdAt: TEST_DATES.rollback,
    });

    const input = redemptionInput(
      customer,
      "promo_rollback",
      TEST_DATES.rollback
    );
    const before = await loadAccountFacts(customer.accountId, [
      customer.sessionId,
    ]);
    const globalSnapshotIdsBefore = (
      await database.select({ id: tariffSnapshots.id }).from(tariffSnapshots)
    )
      .map(row => row.id)
      .sort();
    const globalOutboxIdsBefore = (
      await database.select({ id: outboxEvents.id }).from(outboxEvents)
    )
      .map(row => row.id)
      .sort();
    const error = await redeemPromo(input).catch(caught => caught);
    expectConflict(error);

    const after = await loadAccountFacts(customer.accountId, [
      customer.sessionId,
    ]);
    expect(factIds(after)).toEqual(factIds(before));
    expect(after.cases).toHaveLength(1);
    expect(after.cases[0]?.id).toBe(blockerCaseId);
    expect(after.snapshots).toHaveLength(1);
    expect(after.snapshots[0]?.id).toBe(blockerSnapshotId);
    expect(after.payments).toHaveLength(1);
    expect(after.payments[0]?.id).toBe(blockerPaymentId);
    expect(after.consents).toHaveLength(0);
    expect(after.grants).toHaveLength(0);
    expect(after.idempotency).toHaveLength(0);
    expect(after.audits).toHaveLength(0);
    expect(after.outboxes).toHaveLength(0);
    expect(
      (await database.select({ id: tariffSnapshots.id }).from(tariffSnapshots))
        .map(row => row.id)
        .sort()
    ).toEqual(globalSnapshotIdsBefore);
    expect(
      (await database.select({ id: outboxEvents.id }).from(outboxEvents))
        .map(row => row.id)
        .sort()
    ).toEqual(globalOutboxIdsBefore);
    const requestAudits = await database
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.requestId, input.requestId));
    expect(requestAudits).toHaveLength(0);
  });

  it("rolls back every redemption fact when audit persistence throws after inserts", async () => {
    const customer = await provisionCustomer(
      TEST_EMAILS.auditRollback,
      "promo_audit_rollback"
    );
    const input = redemptionInput(
      customer,
      "promo_audit_rollback",
      TEST_DATES.auditRollback
    );
    const injectedFailure = new Error("injected audit persistence failure");
    let faultReached = false;
    const detachedFactsBefore = await loadDetachedFactIds();

    const error = await redeemPromo(input, {
      appendAuditEvent: async executor => {
        await expectStagedRedemptionFacts(executor, customer, input, 0);
        faultReached = true;
        throw injectedFailure;
      },
      appendOutboxEvent,
    }).catch(caught => caught);

    expect(faultReached).toBe(true);
    expect(error).toBe(injectedFailure);
    await expectNoRedemptionFacts(customer, [input.requestId]);
    expect(await loadDetachedFactIds()).toEqual(detachedFactsBefore);
  });

  it("rolls back every redemption fact when outbox persistence throws after inserts", async () => {
    const customer = await provisionCustomer(
      TEST_EMAILS.outboxRollback,
      "promo_outbox_rollback"
    );
    const input = redemptionInput(
      customer,
      "promo_outbox_rollback",
      TEST_DATES.outboxRollback
    );
    const injectedFailure = new Error("injected outbox persistence failure");
    let faultReached = false;
    const detachedFactsBefore = await loadDetachedFactIds();

    const error = await redeemPromo(input, {
      appendAuditEvent,
      appendOutboxEvent: async executor => {
        await expectStagedRedemptionFacts(executor, customer, input, 1);
        faultReached = true;
        throw injectedFailure;
      },
    }).catch(caught => caught);

    expect(faultReached).toBe(true);
    expect(error).toBe(injectedFailure);
    await expectNoRedemptionFacts(customer, [input.requestId]);
    expect(await loadDetachedFactIds()).toEqual(detachedFactsBefore);
  });
});
