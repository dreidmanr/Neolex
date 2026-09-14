import { createHmac, timingSafeEqual } from "node:crypto";

const PROMO_VERIFIER_DOMAIN = "lexy:r1:promo-verifier:v1\u0000";

function verifierDigest(value: string, pepper: string): Buffer {
  return createHmac("sha256", pepper)
    .update(PROMO_VERIFIER_DOMAIN)
    .update(value, "utf8")
    .digest();
}

export function verifyPromoValue(
  promoValue: string,
  configuredVerifier: string,
  pepper: string,
): boolean {
  if (
    typeof promoValue !== "string" ||
    promoValue.length < 1 ||
    promoValue.length > 512 ||
    configuredVerifier.length < 32 ||
    pepper.length < 32
  ) {
    return false;
  }
  const incoming = verifierDigest(promoValue, pepper);
  const configured = verifierDigest(configuredVerifier, pepper);
  return timingSafeEqual(incoming, configured);
}
