import { createHmac } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { DiagnosticCase } from "../../../drizzle/schema";
import { ENV } from "../../_core/env";
import { appendAuditEvent } from "../audit/auditRepository";
import { compareAndSwapCaseStatus, insertCase } from "../cases/caseRepository";
import { requireR1Database } from "../database";
import {
  claimIdempotencyRecord,
  completeIdempotencyRecord,
} from "../idempotency/idempotencyRepository";
import { newR1Id } from "../ids";
import {
  insertCaseConsents,
  validateConsentAssertions,
  type ConsentAssertion,
} from "../legal/consentService";
import { appendOutboxEvent } from "../outbox/outboxRepository";
import { throwConflict } from "../policy/errors";
import { assertPromoAccessTestAllowed } from "../releaseGate";
import {
  insertAccessGrant,
  insertPaymentRecord,
  insertTariffSnapshot,
} from "./paymentRepository";
import { verifyPromoValue } from "./promoVerifier";
import { requireTariff, TARIFF_CATALOG_VERSION } from "./tariffService";

export const REDEEM_PROMO_SCOPE = "pilot.access.redeem_promo" as const;
const IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1000;
const KEY_DOMAIN = "lexy:r1:promo-idempotency-key:v1\u0000";
const REQUEST_DOMAIN = "lexy:r1:promo-request:v1\u0000";

export type RedeemPromoResponse = {
  casePublicId: string;
  status: "access_granted";
  tariffCode: string;
  accessStatus: "active";
};

export type RedeemPromoInput = {
  customerAccountId: string;
  customerSessionId: string;
  requestId: string;
  tariffCode: string;
  promoValue: string;
  idempotencyKey: string;
  consents: readonly ConsentAssertion[];
  now?: Date;
};

function keyedHash(domain: string, value: string): string {
  return createHmac("sha256", ENV.promoVerifierPepper)
    .update(domain)
    .update(value, "utf8")
    .digest("hex");
}

function requestFingerprint(
  tariffCode: string,
  consents: readonly ConsentAssertion[],
): string {
  return keyedHash(REQUEST_DOMAIN, JSON.stringify({
    campaignId: ENV.promoCampaignId,
    tariffCode,
    consents: consents.map(consent => ({
      documentId: consent.documentId,
      documentVersion: consent.documentVersion,
      contentHash: consent.contentHash,
      consentType: consent.consentType,
      accepted: consent.accepted,
    })),
  }));
}

function parseStoredResponse(value: unknown): RedeemPromoResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stored command response is invalid" });
  }
  const response = value as Record<string, unknown>;
  if (
    Object.keys(response).sort().join(",") !==
      "accessStatus,casePublicId,status,tariffCode" ||
    typeof response.casePublicId !== "string" ||
    response.status !== "access_granted" ||
    response.tariffCode !== "base_diagnostic" ||
    response.accessStatus !== "active"
  ) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stored command response is invalid" });
  }
  return response as RedeemPromoResponse;
}

function isDuplicateEntry(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  return candidate.code === "ER_DUP_ENTRY" || candidate.cause?.code === "ER_DUP_ENTRY";
}

function rejectPromo(): never {
  throw new TRPCError({ code: "BAD_REQUEST", message: "Promo could not be redeemed" });
}

export type RedeemPromoServiceDependencies = {
  appendAuditEvent: typeof appendAuditEvent;
  appendOutboxEvent: typeof appendOutboxEvent;
};

const DEFAULT_REDEEM_PROMO_DEPENDENCIES: RedeemPromoServiceDependencies = {
  appendAuditEvent,
  appendOutboxEvent,
};

export async function redeemPromo(
  input: RedeemPromoInput,
  dependencies: RedeemPromoServiceDependencies = DEFAULT_REDEEM_PROMO_DEPENDENCIES,
): Promise<RedeemPromoResponse> {
  assertPromoAccessTestAllowed();
  if (!verifyPromoValue(input.promoValue, ENV.promoVerifier, ENV.promoVerifierPepper)) {
    rejectPromo();
  }
  const consents = validateConsentAssertions(input.consents);
  const requestHash = requestFingerprint(input.tariffCode, consents);
  const idempotencyKeyHash = keyedHash(KEY_DOMAIN, input.idempotencyKey);
  const database = await requireR1Database();
  const now = input.now ?? new Date();

  try {
    return await database.transaction(async tx => {
      const claim = await claimIdempotencyRecord(tx, {
        customerAccountId: input.customerAccountId,
        scope: REDEEM_PROMO_SCOPE,
        keyHash: idempotencyKeyHash,
      }, requestHash, new Date(now.getTime() + IDEMPOTENCY_RETENTION_MS));

      if (claim.record.requestHash !== requestHash) {
        throwConflict("Idempotency key was used for a different request");
      }
      if (!claim.claimed) {
        if (claim.record.status === "completed") {
          return parseStoredResponse(claim.record.responseJson);
        }
        throwConflict("An equivalent request is already in progress or unavailable");
      }

      const tariff = requireTariff(input.tariffCode);
      const caseId = newR1Id("case");
      const casePublicId = newR1Id("public");
      const snapshotId = newR1Id("tariff");
      const paymentId = newR1Id("payment");
      const grantId = newR1Id("grant");
      const correlationId = newR1Id("correlation");
      const diagnosticCase: DiagnosticCase = {
        id: caseId,
        publicId: casePublicId,
        customerAccountId: input.customerAccountId,
        serviceTier: tariff.serviceTier,
        status: "draft",
        stateVersion: 1,
        createdAt: now,
        updatedAt: now,
      };
      await insertCase(tx, diagnosticCase);
      await insertTariffSnapshot(tx, {
        id: snapshotId,
        tariffCode: tariff.tariffCode,
        serviceTier: tariff.serviceTier,
        provenanceStatus: tariff.provenanceStatus,
        catalogVersion: TARIFF_CATALOG_VERSION,
        currency: tariff.currency,
        createdAt: now,
      });
      await insertCaseConsents(tx, {
        customerAccountId: input.customerAccountId,
        diagnosticCaseId: caseId,
        actorCustomerSessionId: input.customerSessionId,
        assertions: consents,
        acceptedAt: now,
      });
      await insertPaymentRecord(tx, {
        id: paymentId,
        customerAccountId: input.customerAccountId,
        diagnosticCaseId: caseId,
        tariffSnapshotId: snapshotId,
        tariffCode: tariff.tariffCode,
        campaignId: ENV.promoCampaignId,
        sourceType: "promo",
        status: "promo_granted",
        chargedAmount: 0,
        currency: tariff.currency,
        correlationId,
        grantedAt: now,
        createdAt: now,
      });
      await insertAccessGrant(tx, {
        id: grantId,
        customerAccountId: input.customerAccountId,
        diagnosticCaseId: caseId,
        paymentRecordId: paymentId,
        status: "active",
        grantedAt: now,
        expiresAt: null,
        revokedAt: null,
        revocationReasonCode: null,
        createdAt: now,
        updatedAt: now,
      });
      const transitioned = await compareAndSwapCaseStatus(tx, {
        id: caseId,
        customerAccountId: input.customerAccountId,
        fromStatus: "draft",
        toStatus: "access_granted",
        expectedStateVersion: 1,
        now,
      });
      if (!transitioned) throwConflict("Case state changed concurrently");

      await dependencies.appendAuditEvent(tx, {
        actorType: "customer_session",
        actorId: input.customerSessionId,
        aggregateType: "diagnostic_case",
        aggregateId: caseId,
        eventType: "diagnostic_case.status_changed",
        fromStatus: "draft",
        toStatus: "access_granted",
        outcome: "succeeded",
        reasonCode: "promo_redemption",
        requestId: input.requestId,
        idempotencyKeyHash,
        privacySafeMetadata: { stateVersion: 2 },
        createdAt: now,
      });
      await dependencies.appendOutboxEvent(tx, {
        aggregateType: "diagnostic_case",
        aggregateId: caseId,
        eventType: "diagnostic_case.status_changed",
        privacySafePayload: { caseId, stateVersion: 2, status: "access_granted" },
        createdAt: now,
      });
      const promoFacts = {
        paymentId,
        caseId,
        grantId,
        tariffCode: tariff.tariffCode,
        chargedAmount: 0 as const,
        currency: tariff.currency,
        campaignId: ENV.promoCampaignId,
        test: true as const,
      };
      await dependencies.appendAuditEvent(tx, {
        actorType: "customer_session",
        actorId: input.customerSessionId,
        aggregateType: "payment_record",
        aggregateId: paymentId,
        eventType: "billing.promo_granted",
        outcome: "succeeded",
        toStatus: "promo_granted",
        requestId: input.requestId,
        correlationId,
        idempotencyKeyHash,
        privacySafeMetadata: promoFacts,
        createdAt: now,
      });
      await dependencies.appendOutboxEvent(tx, {
        aggregateType: "payment_record",
        aggregateId: paymentId,
        eventType: "billing.promo_granted",
        privacySafePayload: promoFacts,
        createdAt: now,
      });

      const response: RedeemPromoResponse = {
        casePublicId,
        status: "access_granted",
        tariffCode: tariff.tariffCode,
        accessStatus: "active",
      };
      await completeIdempotencyRecord(tx, claim.record.id, response);
      return response;
    });
  } catch (error) {
    if (isDuplicateEntry(error)) {
      throwConflict("Promo redemption conflicts with existing state");
    }
    throw error;
  }
}
