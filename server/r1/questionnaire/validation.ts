import type {
  QuestionnaireBundle,
  QuestionnaireQuestion,
} from "./configBundle";

export type SingleAnswer = Readonly<{ kind: "single"; optionId: string }>;
export type MultiAnswer = Readonly<{ kind: "multi"; optionIds: readonly string[] }>;
export type TextAnswer = Readonly<{ kind: "text"; text: string }>;
export type CanonicalAnswer = SingleAnswer | MultiAnswer | TextAnswer;
export type AnswerInput = CanonicalAnswer | null;
export type EffectiveAnswers = Readonly<Record<string, CanonicalAnswer>>;

export class QuestionnaireAnswerValidationError extends Error {
  constructor(message: string) {
    super(`Invalid questionnaire answer: ${message}`);
    this.name = "QuestionnaireAnswerValidationError";
  }
}

function fail(message: string): never {
  throw new QuestionnaireAnswerValidationError(message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  questionId: string,
): void {
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    fail(`${questionId} has an invalid answer shape`);
  }
}

function selectedQuestion(
  bundle: QuestionnaireBundle,
  questionId: string,
): QuestionnaireQuestion {
  const question = bundle.questionById[questionId];
  if (!question) fail(`unknown question ${questionId}`);
  const selected =
    bundle.activeCoreQuestionIds.includes(questionId) ||
    bundle.activeBranchQuestionIds.includes(questionId);
  if (!selected || !question.activeInPilot || question.type === "file") {
    fail(`question ${questionId} is inactive`);
  }
  return question;
}

function normalizeSingle(
  question: QuestionnaireQuestion,
  input: Record<string, unknown>,
): SingleAnswer {
  assertExactKeys(input, ["kind", "optionId"], question.id);
  if (input.kind !== "single" || typeof input.optionId !== "string") {
    fail(`${question.id} requires a single-option answer`);
  }
  if (!question.options.some(option => option.id === input.optionId)) {
    fail(`${question.id} contains unknown option ${input.optionId}`);
  }
  return Object.freeze({ kind: "single", optionId: input.optionId });
}

function normalizeMulti(
  question: QuestionnaireQuestion,
  input: Record<string, unknown>,
): MultiAnswer {
  assertExactKeys(input, ["kind", "optionIds"], question.id);
  if (input.kind !== "multi" || !Array.isArray(input.optionIds)) {
    fail(`${question.id} requires a multi-option answer`);
  }
  if (input.optionIds.length === 0) fail(`${question.id} multi answer must not be empty`);
  if (input.optionIds.some(optionId => typeof optionId !== "string")) {
    fail(`${question.id} optionIds must contain only strings`);
  }
  const optionIds = input.optionIds as string[];
  if (new Set(optionIds).size !== optionIds.length) {
    fail(`${question.id} multi answer contains duplicate options`);
  }
  const selected = new Set(optionIds);
  for (const optionId of Array.from(selected)) {
    if (!question.options.some(option => option.id === optionId)) {
      fail(`${question.id} contains unknown option ${optionId}`);
    }
  }
  const normalized = question.options
    .map(option => option.id)
    .filter(optionId => selected.has(optionId));
  return Object.freeze({ kind: "multi", optionIds: Object.freeze(normalized) });
}

function normalizeText(
  question: QuestionnaireQuestion,
  input: Record<string, unknown>,
): TextAnswer | null {
  assertExactKeys(input, ["kind", "text"], question.id);
  if (input.kind !== "text" || typeof input.text !== "string") {
    fail(`${question.id} requires a text answer`);
  }
  const text = input.text.normalize("NFC").trim();
  if (Array.from(text).length > 10_000) {
    fail(`${question.id} text exceeds 10000 Unicode code points`);
  }
  if (text.length === 0) return null;
  return Object.freeze({ kind: "text", text });
}

function normalizeForQuestion(
  question: QuestionnaireQuestion,
  input: unknown,
): CanonicalAnswer | null {
  if (input === null) {
    if (question.type === "text") return null;
    fail(`${question.id} cannot be cleared with null`);
  }
  if (!isPlainObject(input)) fail(`${question.id} answer must be a plain object`);
  if (question.type === "single") return normalizeSingle(question, input);
  if (question.type === "multi") return normalizeMulti(question, input);
  if (question.type === "text") return normalizeText(question, input);
  fail(`${question.id} uses an unsupported input type`);
}

/**
 * Validates untrusted save input and returns the sole persisted answer shape.
 * Visibility and all question authority are supplied by server-derived state.
 */
export function validateAndNormalizeAnswer(
  bundle: QuestionnaireBundle,
  questionId: string,
  input: unknown,
  visibleIds: ReadonlySet<string> | readonly string[],
): CanonicalAnswer | null {
  const question = selectedQuestion(bundle, questionId);
  const visible = visibleIds instanceof Set ? visibleIds : new Set(visibleIds);
  if (!visible.has(questionId)) fail(`question ${questionId} is not visible`);
  return normalizeForQuestion(question, input);
}

/**
 * Fails closed if persisted data is not already in canonical normalized form.
 */
export function validateCanonicalAnswer(
  bundle: QuestionnaireBundle,
  questionId: string,
  input: unknown,
): CanonicalAnswer {
  const question = selectedQuestion(bundle, questionId);
  const normalized = normalizeForQuestion(question, input);
  if (normalized === null) fail(`${questionId} persisted answer cannot be null`);

  if (question.type === "multi") {
    const original = (input as { optionIds: unknown }).optionIds;
    if (
      !Array.isArray(original) ||
      original.some((value, index) => value !== (normalized as MultiAnswer).optionIds[index]) ||
      original.length !== (normalized as MultiAnswer).optionIds.length
    ) {
      fail(`${questionId} persisted multi answer is not canonically ordered`);
    }
  }
  if (question.type === "text" && (input as { text: unknown }).text !== (normalized as TextAnswer).text) {
    fail(`${questionId} persisted text answer is not normalized`);
  }
  return normalized;
}

export function validateEffectiveAnswers(
  bundle: QuestionnaireBundle,
  effectiveAnswers: unknown,
): EffectiveAnswers {
  if (!isPlainObject(effectiveAnswers)) fail("effective answers must be a plain object");
  const normalized: Record<string, CanonicalAnswer> = {};
  for (const questionId of Object.keys(effectiveAnswers).sort()) {
    normalized[questionId] = validateCanonicalAnswer(
      bundle,
      questionId,
      effectiveAnswers[questionId],
    );
  }
  return Object.freeze(normalized);
}

export function answerIncludesOption(
  answer: CanonicalAnswer | undefined,
  optionId: string,
): boolean {
  return answer?.kind === "single"
    ? answer.optionId === optionId
    : answer?.kind === "multi"
      ? answer.optionIds.includes(optionId)
      : false;
}
