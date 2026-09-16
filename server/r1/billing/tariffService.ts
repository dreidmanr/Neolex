import { TRPCError } from "@trpc/server";
import { assertPromoAccessTestAllowed } from "../releaseGate";

export const ADVANCED_DIAGNOSTIC_TARIFF_CODE = "lexy-advanced-diagnostic" as const;

export type PromoOffer = {
  tariffCode: typeof ADVANCED_DIAGNOSTIC_TARIFF_CODE;
  serviceTier: typeof ADVANCED_DIAGNOSTIC_TARIFF_CODE;
  currency: "RUB";
  provenanceStatus: "draft_test_only";
};

const OFFER = Object.freeze({
  tariffCode: ADVANCED_DIAGNOSTIC_TARIFF_CODE,
  serviceTier: ADVANCED_DIAGNOSTIC_TARIFF_CODE,
  currency: "RUB",
  provenanceStatus: "draft_test_only",
} satisfies PromoOffer);

export function getOffer(): PromoOffer {
  assertPromoAccessTestAllowed();
  return { ...OFFER };
}

export function requireTariff(
  tariffCode: string,
): PromoOffer {
  if (tariffCode !== ADVANCED_DIAGNOSTIC_TARIFF_CODE) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Offer is unavailable" });
  }
  return { ...OFFER };
}

export const TARIFF_CATALOG_VERSION = "r1drafttestv1" as const;
