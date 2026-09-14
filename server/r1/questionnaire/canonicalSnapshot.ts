import {
  canonicalSerialize,
  sha256Hex,
  type CanonicalJsonValue,
} from "./canonicalJson";
import type { QuestionnaireBundle } from "./configBundle";
import type { CanonicalAnswer, EffectiveAnswers } from "./validation";
import { validateCanonicalAnswer } from "./validation";
import type { DerivedQuestionnaireState } from "./visibility";

export interface QuestionnaireSnapshot {
  readonly releaseId: string;
  readonly version: string;
  readonly contentHash: string;
  readonly visibleQuestionIds: readonly string[];
  readonly visibleSetHash: string;
  readonly manualFollowUpTriggerIds: readonly string[];
  readonly activeAnswers: EffectiveAnswers;
  readonly draftRevision: number;
  readonly snapshotJson: string;
  readonly inputSnapshotHash: string;
}

function canonicalAnswerValue(answer: CanonicalAnswer): CanonicalJsonValue {
  if (answer.kind === "single") return { kind: "single", optionId: answer.optionId };
  if (answer.kind === "multi") return { kind: "multi", optionIds: [...answer.optionIds] };
  return { kind: "text", text: answer.text };
}

/**
 * Builds the server-storage snapshot only. It intentionally contains no labels,
 * rules, raw configuration, customer/session identifiers, or legal evaluation.
 */
export function buildQuestionnaireSnapshot(
  bundle: QuestionnaireBundle,
  state: DerivedQuestionnaireState,
  effectiveAnswers: EffectiveAnswers,
  draftRevision: number,
): QuestionnaireSnapshot {
  if (!Number.isSafeInteger(draftRevision) || draftRevision < 0) {
    throw new TypeError("draftRevision must be a non-negative safe integer");
  }
  if (state.visibleSetHash !== sha256Hex(canonicalSerialize(state.visibleQuestionIds))) {
    throw new TypeError("Questionnaire state visibleSetHash is inconsistent");
  }

  const visible = new Set(state.visibleQuestionIds);
  const activeAnswers: Record<string, CanonicalAnswer> = {};
  for (const questionId of Object.keys(effectiveAnswers).sort()) {
    if (!visible.has(questionId)) continue;
    activeAnswers[questionId] = validateCanonicalAnswer(
      bundle,
      questionId,
      effectiveAnswers[questionId],
    );
  }

  const sortedTriggers = [...state.manualFollowUpTriggerIds].sort();
  const payload: CanonicalJsonValue = {
    activeAnswers: Object.fromEntries(
      Object.keys(activeAnswers)
        .sort()
        .map(questionId => [questionId, canonicalAnswerValue(activeAnswers[questionId]!)]),
    ),
    contentHash: bundle.contentHash,
    draftRevision,
    manualFollowUpTriggerIds: sortedTriggers,
    releaseId: bundle.releaseId,
    version: bundle.version,
    visibleQuestionIds: [...state.visibleQuestionIds],
    visibleSetHash: state.visibleSetHash,
  };
  const snapshotJson = canonicalSerialize(payload);

  return Object.freeze({
    releaseId: bundle.releaseId,
    version: bundle.version,
    contentHash: bundle.contentHash,
    visibleQuestionIds: Object.freeze([...state.visibleQuestionIds]),
    visibleSetHash: state.visibleSetHash,
    manualFollowUpTriggerIds: Object.freeze(sortedTriggers),
    activeAnswers: Object.freeze(activeAnswers),
    draftRevision,
    snapshotJson,
    inputSnapshotHash: sha256Hex(snapshotJson),
  });
}
