import creditPolicyRaw from "../../../shared/billing/credit_policy_v1.json?raw";
import recommendationMappingRaw from "../../../shared/legal-core/recommendation_mapping_v1.json?raw";
import type {
  CreditEntitlement,
  InsertCreditEntitlement,
} from "../../../drizzle/schema";
import { TARIFF_CATALOG_VERSION } from "../billing/tariffService";
import type { R1Executor } from "../database";
import {
  canonicalSerialize,
  sha256Hex,
  type CanonicalJsonValue,
} from "../questionnaire/canonicalJson";
import { reportContentSha256 } from "../reports/reportIntegrity";
import { validateReportSchema } from "../reports/reportSchemaValidator";
import type {
  PersistedReportSourceBundle,
  ValidatedReportSnapshot,
} from "../reports/types";
import { insertCreditEntitlementExactlyOnce } from "./creditEntitlementRepository";

const policyDocument = JSON.parse(creditPolicyRaw) as {
  version: string;
  status: string;
  policy: {
    policyId: string;
    status: string;
    currency: string;
    creditAmountRub: number;
    sourceTariffId: string;
    qualifyingSourcePaymentStatuses: readonly string[];
    validity: { durationCalendarDays: number; businessTimeZone: string };
  };
};
const recommendationDocument = JSON.parse(recommendationMappingRaw) as {
  creditEligibility: {
    policyId: string;
    sourceTariffId: string;
    currency: string;
    creditAmountRub: number;
    entries: readonly { productCode: string; eligible: boolean; status: string }[];
  };
};

export const CREDIT_POLICY_ID = "base-diagnostic-credit-6900-rub-v1" as const;
export const CREDIT_POLICY_VERSION = "1.0.0-draft.1" as const;
export const CREDIT_SOURCE_TARIFF_ID = "lexy-advanced-diagnostic" as const;
export const CREDIT_AMOUNT_RUB = 6900 as const;
export const CREDIT_BUSINESS_TIME_ZONE = "Europe/Moscow" as const;
export const CREDIT_DURATION_CALENDAR_DAYS = 14 as const;
export const CREDIT_AUTOMATIC_REDEMPTION_ENABLED = false as const;

export type CreditEligibleProductCode =
  | "start_product"
  | "safe_sales"
  | "rights_and_ip"
  | "data_and_infrastructure"
  | "enterprise_readiness";

export type ReportCreditEntitlementSnapshot = Readonly<{
  entitlementId: string;
  customerAccountId: string;
  sourcePaymentRecordId: string;
  sourceTariffId: typeof CREDIT_SOURCE_TARIFF_ID;
  sourceTariffVersion: string;
  sourceReportSnapshotId: string;
  policyId: typeof CREDIT_POLICY_ID;
  policyVersion: typeof CREDIT_POLICY_VERSION;
  amountRub: typeof CREDIT_AMOUNT_RUB;
  currency: "RUB";
  eligibleProductCodes: readonly [CreditEligibleProductCode];
  issuedAt: string;
  expiresAt: string;
  businessTimeZone: typeof CREDIT_BUSINESS_TIME_ZONE;
  status: "available";
  automaticRedemptionEnabled: false;
}>;

export type CreditEntitlementPlan = Readonly<{
  record: InsertCreditEntitlement;
  snapshot: ReportCreditEntitlementSnapshot;
}>;

export class CreditEntitlementPolicyError extends Error {
  constructor(readonly code: "policy_invalid" | "source_ineligible" | "snapshot_invalid") {
    super(code);
    this.name = "CreditEntitlementPolicyError";
  }
}

const ELIGIBLE_PRODUCTS = new Set<CreditEligibleProductCode>([
  "start_product",
  "safe_sales",
  "rights_and_ip",
  "data_and_infrastructure",
  "enterprise_readiness",
]);

function object(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? value as Record<string, unknown>
    : null;
}

function assertPinnedPolicy(): void {
  const credit = recommendationDocument.creditEligibility;
  if (
    policyDocument.version !== CREDIT_POLICY_VERSION ||
    policyDocument.status !== "draft_pending_legal_approval" ||
    policyDocument.policy.status !== "draft_pending_legal_approval" ||
    policyDocument.policy.policyId !== CREDIT_POLICY_ID ||
    policyDocument.policy.currency !== "RUB" ||
    policyDocument.policy.creditAmountRub !== CREDIT_AMOUNT_RUB ||
    policyDocument.policy.sourceTariffId !== CREDIT_SOURCE_TARIFF_ID ||
    !policyDocument.policy.qualifyingSourcePaymentStatuses.includes("promo_granted") ||
    policyDocument.policy.validity.durationCalendarDays !== CREDIT_DURATION_CALENDAR_DAYS ||
    policyDocument.policy.validity.businessTimeZone !== CREDIT_BUSINESS_TIME_ZONE ||
    credit.policyId !== CREDIT_POLICY_ID ||
    credit.sourceTariffId !== CREDIT_SOURCE_TARIFF_ID ||
    credit.currency !== "RUB" ||
    credit.creditAmountRub !== CREDIT_AMOUNT_RUB
  ) {
    throw new CreditEntitlementPolicyError("policy_invalid");
  }
}

function moscowCalendarDate(value: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CREDIT_BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: "year" | "month" | "day") =>
    Number(parts.find(valuePart => valuePart.type === type)?.value);
  const result = { year: part("year"), month: part("month"), day: part("day") };
  if (!Number.isSafeInteger(result.year) || !Number.isSafeInteger(result.month) || !Number.isSafeInteger(result.day)) {
    throw new CreditEntitlementPolicyError("policy_invalid");
  }
  return result;
}

/** Europe/Moscow is UTC+03:00 for the R1 policy horizon (2026+). */
export function calculateCreditExpiry(issuedAt: Date): Date {
  if (!(issuedAt instanceof Date) || !Number.isFinite(issuedAt.getTime())) {
    throw new TypeError("Invalid credit issuance clock");
  }
  const local = moscowCalendarDate(issuedAt);
  return new Date(Date.UTC(
    local.year,
    local.month - 1,
    local.day + CREDIT_DURATION_CALENDAR_DAYS - 1,
    20,
    59,
    59,
    999,
  ));
}

function productCodeFromSnapshot(snapshot: ValidatedReportSnapshot): string {
  const recommendation = object(snapshot.recommendation);
  return typeof recommendation?.productCode === "string"
    ? recommendation.productCode
    : "";
}

function assertQualifiedSource(
  source: PersistedReportSourceBundle,
  snapshot: ValidatedReportSnapshot,
  issuedAt: Date,
): void {
  const identity = object(snapshot.identity);
  if (
    validateReportSchema(snapshot).length > 0 ||
    identity?.snapshotState !== "ready" ||
    identity.reportId !== source.reportSnapshot.id ||
    source.reportSnapshot.status !== "processing" ||
    source.reportSnapshot.payloadJson !== null ||
    source.reportSnapshot.payloadHash !== null ||
    source.reportSnapshot.contentHash !== null
  ) {
    throw new CreditEntitlementPolicyError("snapshot_invalid");
  }
  if (
    source.payment.customerAccountId !== source.reportSnapshot.customerAccountId ||
    source.payment.diagnosticCaseId !== source.reportSnapshot.diagnosticCaseId ||
    source.payment.id !== source.accessGrant.paymentRecordId ||
    source.payment.sourceType !== "promo" ||
    source.payment.status !== "promo_granted" ||
    source.payment.chargedAmount !== 0 ||
    source.payment.currency !== "RUB" ||
    source.payment.tariffCode !== "lexy-advanced-diagnostic" ||
    source.tariffSnapshot.id !== source.payment.tariffSnapshotId ||
    source.tariffSnapshot.tariffCode !== "lexy-advanced-diagnostic" ||
    source.tariffSnapshot.serviceTier !== "lexy-advanced-diagnostic" ||
    source.tariffSnapshot.catalogVersion !== TARIFF_CATALOG_VERSION ||
    source.tariffSnapshot.provenanceStatus !== "draft_test_only" ||
    source.tariffSnapshot.currency !== "RUB" ||
    source.accessGrant.status !== "active" ||
    source.accessGrant.revokedAt !== null ||
    source.accessGrant.revocationReasonCode !== null ||
    (source.accessGrant.expiresAt !== null && source.accessGrant.expiresAt.getTime() <= issuedAt.getTime())
  ) {
    throw new CreditEntitlementPolicyError("source_ineligible");
  }
}

/**
 * Produces a deterministic issuance fact. `null` is allowed only when the pinned
 * product mapping explicitly marks the exactly-one recommendation ineligible.
 */
export function planCreditEntitlement(
  source: PersistedReportSourceBundle,
  snapshot: ValidatedReportSnapshot,
  issuedAt: Date,
): CreditEntitlementPlan | null {
  assertPinnedPolicy();
  assertQualifiedSource(source, snapshot, issuedAt);
  const productCode = productCodeFromSnapshot(snapshot);
  const mapping = recommendationDocument.creditEligibility.entries.find(
    entry => entry.productCode === productCode,
  );
  if (!mapping || mapping.status !== "draft_pending_legal_approval") {
    throw new CreditEntitlementPolicyError("policy_invalid");
  }
  if (!mapping.eligible) {
    if (productCode !== "expert_review") {
      throw new CreditEntitlementPolicyError("policy_invalid");
    }
    return null;
  }
  if (!ELIGIBLE_PRODUCTS.has(productCode as CreditEligibleProductCode)) {
    throw new CreditEntitlementPolicyError("policy_invalid");
  }

  const eligibleProductCode = productCode as CreditEligibleProductCode;
  const expiresAt = calculateCreditExpiry(issuedAt);
  const id = `credit_${sha256Hex(
    `${source.payment.id}:${source.reportSnapshot.id}:${CREDIT_POLICY_ID}`,
  ).slice(0, 40)}`;
  const snapshotValue: ReportCreditEntitlementSnapshot = Object.freeze({
    entitlementId: id,
    customerAccountId: source.reportSnapshot.customerAccountId,
    sourcePaymentRecordId: source.payment.id,
    sourceTariffId: CREDIT_SOURCE_TARIFF_ID,
    sourceTariffVersion: source.tariffSnapshot.catalogVersion,
    sourceReportSnapshotId: source.reportSnapshot.id,
    policyId: CREDIT_POLICY_ID,
    policyVersion: CREDIT_POLICY_VERSION,
    amountRub: CREDIT_AMOUNT_RUB,
    currency: "RUB",
    eligibleProductCodes: Object.freeze([eligibleProductCode]) as readonly [CreditEligibleProductCode],
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    businessTimeZone: CREDIT_BUSINESS_TIME_ZONE,
    status: "available",
    automaticRedemptionEnabled: CREDIT_AUTOMATIC_REDEMPTION_ENABLED,
  });
  return Object.freeze({
    record: {
      id,
      customerAccountId: source.reportSnapshot.customerAccountId,
      diagnosticCaseId: source.reportSnapshot.diagnosticCaseId,
      sourcePaymentRecordId: source.payment.id,
      sourceReportSnapshotId: source.reportSnapshot.id,
      sourceTariffId: CREDIT_SOURCE_TARIFF_ID,
      sourceTariffVersion: source.tariffSnapshot.catalogVersion,
      policyId: CREDIT_POLICY_ID,
      policyVersion: CREDIT_POLICY_VERSION,
      amountRub: CREDIT_AMOUNT_RUB,
      currency: "RUB",
      eligibleProductCode,
      issuedAt,
      expiresAt,
      businessTimeZone: CREDIT_BUSINESS_TIME_ZONE,
      status: "available",
      automaticRedemptionEnabled: false,
      revokedAt: null,
      revocationReasonCode: null,
      createdAt: issuedAt,
      updatedAt: issuedAt,
    },
    snapshot: snapshotValue,
  });
}

export function attachCreditEntitlement(
  snapshot: ValidatedReportSnapshot,
  entitlement: ReportCreditEntitlementSnapshot,
): ValidatedReportSnapshot {
  const next = JSON.parse(canonicalSerialize(snapshot)) as Record<string, CanonicalJsonValue>;
  if (next.creditEntitlement !== null) {
    throw new CreditEntitlementPolicyError("snapshot_invalid");
  }
  next.creditEntitlement = entitlement as unknown as CanonicalJsonValue;
  const checksums = object(next.checksums);
  if (!checksums) throw new CreditEntitlementPolicyError("snapshot_invalid");
  checksums.snapshotPayloadSha256 = reportContentSha256(next);
  if (validateReportSchema(next).length > 0) {
    throw new CreditEntitlementPolicyError("snapshot_invalid");
  }
  return Object.freeze(next) as ValidatedReportSnapshot;
}

export async function persistCreditEntitlement(
  executor: R1Executor,
  plan: CreditEntitlementPlan,
): Promise<CreditEntitlement> {
  return insertCreditEntitlementExactlyOnce(executor, plan.record);
}
