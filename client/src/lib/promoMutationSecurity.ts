import type { QueryClient } from "@tanstack/react-query";

export const PROMO_REDEEM_MUTATION_KEY = [
  ["pilot", "access", "redeemPromo"],
] as const;

export type LogicalPromoRetryState = {
  canonicalSignature: string | null;
  idempotencyKey: string | null;
};

type CanonicalConsentAssertion = {
  documentId: string;
  documentVersion: string;
  contentHash: string;
  consentType: string;
  accepted: boolean;
};

export function createLogicalPromoRetryState(
  canonicalSignature: string | null = null
): LogicalPromoRetryState {
  return { canonicalSignature, idempotencyKey: null };
}

export function buildPromoCanonicalSignature(
  tariffCode: string,
  consents: readonly CanonicalConsentAssertion[]
): string {
  return JSON.stringify({ tariffCode, consents });
}

export function synchronizePromoCanonicalSignature(
  state: LogicalPromoRetryState,
  canonicalSignature: string
): void {
  if (state.canonicalSignature === canonicalSignature) return;
  state.canonicalSignature = canonicalSignature;
  state.idempotencyKey = null;
}

export function acquireLogicalPromoRetryKey(
  state: LogicalPromoRetryState,
  canonicalSignature: string,
  generate: () => string | null
): string | null {
  synchronizePromoCanonicalSignature(state, canonicalSignature);
  if (state.idempotencyKey) return state.idempotencyKey;
  state.idempotencyKey = generate();
  return state.idempotencyKey;
}

export function markLogicalPromoRequestSucceeded(
  state: LogicalPromoRetryState
): void {
  state.canonicalSignature = null;
  state.idempotencyKey = null;
}

export function disposeSettledPromoMutation(
  queryClient: QueryClient,
  variables: unknown,
  resetObserver: () => void
): void {
  resetObserver();
  const cache = queryClient.getMutationCache();
  const settledAttempts = cache
    .findAll({ mutationKey: PROMO_REDEEM_MUTATION_KEY, exact: true })
    .filter(
      mutation =>
        mutation.state.status !== "pending" &&
        mutation.state.variables === variables
    );

  for (const mutation of settledAttempts) cache.remove(mutation);
}
