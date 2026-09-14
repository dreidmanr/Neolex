import { TRPCError } from "@trpc/server";
import { assertPromoAccessTestAllowed } from "../releaseGate";

export const BASE_DIAGNOSTIC_TARIFF_CODE = "base_diagnostic" as const;

export type PromoOffer = {
  tariffCode: typeof BASE_DIAGNOSTIC_TARIFF_CODE;
  serviceTier: typeof BASE_DIAGNOSTIC_TARIFF_CODE;
  currency: "RUB";
  provenanceStatus: "draft_test_only";
};

const OFFER = Object.freeze({
  tariffCode: BASE_DIAGNOSTIC_TARIFF_CODE,
  serviceTier: BASE_DIAGNOSTIC_TARIFF_CODE,
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
  if (tariffCode !== BASE_DIAGNOSTIC_TARIFF_CODE) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Offer is unavailable" });
  }
  return { ...OFFER };
}

export const TARIFF_CATALOG_VERSION = "r1drafttestv1" as const;
