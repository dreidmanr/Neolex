import { deriveQuestionnaireState } from "../../questionnaire/visibility";
import {
  validateEffectiveAnswers,
  type CanonicalAnswer,
  type EffectiveAnswers,
} from "../../questionnaire/validation";
import type {
  FixtureAnswerValue,
  FixtureAnswers,
  LegalCoreConfigBundle,
  ValidatedR1Profile,
  ValidationReasonCode,
} from "./types";
import { isCanonicalAnswer } from "./types";

export interface InvalidR1Profile {
  readonly valid: false;
  readonly reasonCode: ValidationReasonCode;
  readonly missingRequiredQuestionIds: readonly string[];
  readonly invalidReason?: string;
}

export interface ValidR1Profile {
  readonly valid: true;
  readonly profile: ValidatedR1Profile;
}

export type R1ProfileValidationResult = InvalidR1Profile | ValidR1Profile;

function canonicalizePrimitiveAnswer(
  bundle: LegalCoreConfigBundle,
  questionId: string,
  value: Exclude<FixtureAnswerValue, CanonicalAnswer>,
): CanonicalAnswer {
  const question = bundle.questionnaire.questionById[questionId];
  if (!question) throw new TypeError(`unknown question ${questionId}`);
  const selected =
    bundle.questionnaire.activeCoreQuestionIds.includes(questionId) ||
    bundle.questionnaire.activeBranchQuestionIds.includes(questionId);
  if (!selected || !question.activeInPilot || question.type === "file") {
    throw new TypeError(`question ${questionId} is inactive`);
  }

  if (question.type === "text") {
    if (typeof value !== "string") throw new TypeError(`${questionId} requires text`);
    const text = value.normalize("NFC").trim();
    if (text.length === 0) throw new TypeError(`${questionId} text must not be empty`);
    if (Array.from(text).length > 10_000) throw new TypeError(`${questionId} text is too long`);
    return Object.freeze({ kind: "text", text });
  }
  if (question.type === "single") {
    if (typeof value !== "string") throw new TypeError(`${questionId} requires one option ID`);
    if (!question.options.some(option => option.id === value)) {
      throw new TypeError(`${questionId} contains unknown option ${value}`);
    }
    return Object.freeze({ kind: "single", optionId: value });
  }
  if (question.type === "multi") {
    if (!Array.isArray(value) || value.length === 0 || value.some(optionId => typeof optionId !== "string")) {
      throw new TypeError(`${questionId} requires option IDs`);
    }
    const optionIds = value as readonly string[];
    if (new Set(optionIds).size !== optionIds.length) {
      throw new TypeError(`${questionId} contains duplicate options`);
    }
    const selectedOptions = new Set(optionIds);
    for (const optionId of Array.from(selectedOptions)) {
      if (!question.options.some(option => option.id === optionId)) {
        throw new TypeError(`${questionId} contains unknown option ${optionId}`);
      }
    }
    return Object.freeze({
      kind: "multi",
      optionIds: Object.freeze(
        question.options.map(option => option.id).filter(optionId => selectedOptions.has(optionId)),
      ),
    });
  }
  throw new TypeError(`${questionId} uses an unsupported input type`);
}

function canonicalizeAnswers(
  bundle: LegalCoreConfigBundle,
  fixtureAnswers: FixtureAnswers,
): EffectiveAnswers {
  if (fixtureAnswers === null || typeof fixtureAnswers !== "object" || Array.isArray(fixtureAnswers)) {
    throw new TypeError("canonicalAnswers must be a plain object");
  }
  const record: Record<string, CanonicalAnswer> = {};
  for (const questionId of Object.keys(fixtureAnswers).sort()) {
    const input = fixtureAnswers[questionId];
    if (input === undefined || input === null) throw new TypeError(`${questionId} answer is missing`);
    record[questionId] = isCanonicalAnswer(input)
      ? input
      : canonicalizePrimitiveAnswer(bundle, questionId, input);
  }
  return validateEffectiveAnswers(bundle.questionnaire, record);
}

/** Pure validator for fixture-style answers. Inactive answers are validated, then excluded by visibility. */
export function validateR1Profile(
  bundle: LegalCoreConfigBundle,
  fixtureAnswers: FixtureAnswers,
  previousVisibleQuestionIds: readonly string[] = [],
): R1ProfileValidationResult {
  let answers: EffectiveAnswers;
  try {
    answers = canonicalizeAnswers(bundle, fixtureAnswers);
  } catch (error) {
    return Object.freeze({
      valid: false,
      reasonCode: "invalid_canonical_answers",
      missingRequiredQuestionIds: Object.freeze([]),
      invalidReason: error instanceof Error ? error.message : "invalid canonical answers",
    });
  }

  const state = deriveQuestionnaireState(bundle.questionnaire, answers, previousVisibleQuestionIds);
  const missingRequiredQuestionIds = Object.freeze(
    state.requiredVisibleQuestionIds.filter(questionId => state.activeAnswers[questionId] === undefined),
  );
  if (missingRequiredQuestionIds.length > 0) {
    return Object.freeze({
      valid: false,
      reasonCode: "required_active_answers_missing",
      missingRequiredQuestionIds,
    });
  }

  const activeAnswerQuestionIds = Object.freeze(
    state.visibleQuestionIds.filter(questionId => state.activeAnswers[questionId] !== undefined),
  );
  const active = new Set(activeAnswerQuestionIds);
  const inactiveAnswerQuestionIds = Object.freeze(
    bundle.questionnaire.orderedQuestionIds.filter(
      questionId => answers[questionId] !== undefined && !active.has(questionId),
    ),
  );

  return Object.freeze({
    valid: true,
    profile: Object.freeze({
      answers,
      activeAnswers: state.activeAnswers,
      activeAnswerQuestionIds,
      inactiveAnswerQuestionIds,
      visibleQuestionIds: state.visibleQuestionIds,
      requiredVisibleQuestionIds: state.requiredVisibleQuestionIds,
      missingRequiredQuestionIds,
      manualFollowUpRequired: state.manualFollowUpRequired,
      manualFollowUpTriggerIds: state.manualFollowUpTriggerIds,
    }),
  });
}
