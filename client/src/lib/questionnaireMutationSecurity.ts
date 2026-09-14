import type { MutationKey, QueryClient, QueryKey } from "@tanstack/react-query";
import type { QuestionnaireAnswerInputDto } from "@shared/r1/questionnaire";

export const QUESTIONNAIRE_SAVE_MUTATION_KEY = [
  ["pilot", "cases", "saveAnswer"],
] as const;

export const QUESTIONNAIRE_SUBMIT_MUTATION_KEY = [
  ["pilot", "cases", "submit"],
] as const;

export type LogicalQuestionnaireRetryState = {
  semanticSignature: string | null;
  opaqueKey: string | null;
};

export function createLogicalQuestionnaireRetryState(): LogicalQuestionnaireRetryState {
  return { semanticSignature: null, opaqueKey: null };
}

export function buildQuestionnaireSaveSignature(
  questionId: string,
  expectedDraftRevision: number,
  value: QuestionnaireAnswerInputDto
): string {
  return JSON.stringify({ questionId, expectedDraftRevision, value });
}

export function buildQuestionnaireSubmitSignature(
  publicId: string,
  draftRevision: number
): string {
  return JSON.stringify({ publicId, draftRevision });
}

export function synchronizeQuestionnaireRetrySignature(
  state: LogicalQuestionnaireRetryState,
  semanticSignature: string
): void {
  if (state.semanticSignature === semanticSignature) return;
  state.semanticSignature = semanticSignature;
  state.opaqueKey = null;
}

export function acquireQuestionnaireRetryKey(
  state: LogicalQuestionnaireRetryState,
  semanticSignature: string,
  generate: () => string | null
): string | null {
  synchronizeQuestionnaireRetrySignature(state, semanticSignature);
  if (state.opaqueKey) return state.opaqueKey;
  state.opaqueKey = generate();
  return state.opaqueKey;
}

export function finishQuestionnaireLogicalRequest(
  state: LogicalQuestionnaireRetryState
): void {
  state.semanticSignature = null;
  state.opaqueKey = null;
}

export function createOpaqueQuestionnaireKey(): string | null {
  const cryptoObject = globalThis.crypto;
  if (!cryptoObject) return null;
  if (typeof cryptoObject.randomUUID === "function") {
    return cryptoObject.randomUUID();
  }

  if (typeof cryptoObject.getRandomValues !== "function") return null;
  const bytes = cryptoObject.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function disposeSettledQuestionnaireMutation(
  queryClient: QueryClient,
  mutationKey: MutationKey,
  variables: unknown,
  resetObserver: () => void
): void {
  resetObserver();
  const cache = queryClient.getMutationCache();
  const settledAttempts = cache
    .findAll({ mutationKey, exact: true })
    .filter(
      mutation =>
        mutation.state.status !== "pending" &&
        mutation.state.variables === variables
    );

  for (const mutation of settledAttempts) cache.remove(mutation);
}

export function removeExactQuestionnaireDraftQuery(
  queryClient: QueryClient,
  queryKey: QueryKey
): void {
  queryClient.removeQueries({ queryKey, exact: true });
}
