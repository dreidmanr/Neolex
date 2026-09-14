import { canonicalSha256 } from "./canonicalJson";
import type {
  QuestionnaireBranch,
  QuestionnaireBundle,
  QuestionnaireQuestion,
  QuestionnaireTriggerPolicy,
} from "./configBundle";
import {
  answerIncludesOption,
  validateEffectiveAnswers,
  type CanonicalAnswer,
  type EffectiveAnswers,
} from "./validation";

export interface QuestionnaireProgress {
  readonly activeAnsweredCount: number;
  readonly requiredAnsweredCount: number;
  readonly requiredActiveCount: number;
  readonly complete: boolean;
  readonly ratio: number;
}

export interface DerivedQuestionnaireState {
  readonly visibleQuestionIds: readonly string[];
  readonly visibleSetHash: string;
  readonly deactivatedQuestionIds: readonly string[];
  readonly requiredVisibleQuestionIds: readonly string[];
  readonly activeAnswers: EffectiveAnswers;
  readonly manualFollowUpRequired: boolean;
  readonly manualFollowUpTriggerIds: readonly string[];
  readonly progress: QuestionnaireProgress;
}

function activationMatches(
  answers: EffectiveAnswers,
  activation: { readonly questionId: string; readonly answerOptionIds: readonly string[] },
): boolean {
  const source = answers[activation.questionId];
  return activation.answerOptionIds.some(optionId => answerIncludesOption(source, optionId));
}

function matchingPolicy(
  answers: EffectiveAnswers,
  policy: QuestionnaireTriggerPolicy,
): boolean {
  return answerIncludesOption(answers[policy.sourceQuestionId], policy.sourceAnswerOptionId);
}

function activeBranchQuestionVisible(
  bundle: QuestionnaireBundle,
  answers: EffectiveAnswers,
  branch: QuestionnaireBranch,
  question: QuestionnaireQuestion,
): boolean {
  if (!branch.activeInPilot || !activationMatches(answers, branch.activation)) return false;

  // Branch activation is mandatory. A question's configured condition then
  // contributes only inputs beyond that activation. This preserves the source
  // condition's any/all semantics while making b8_q3 require both its branch's
  // B2C activation and its configured b8_q1=yes/mixed secondary input.
  return question.branchConditions.every(condition => {
    const secondaryInputs = condition.inputs.filter(
      input => input.questionId !== branch.activation.questionId,
    );
    if (secondaryInputs.length === 0) return true;
    const matches = secondaryInputs.map(input => activationMatches(answers, input));
    return condition.operator === "all" ? matches.every(Boolean) : matches.some(Boolean);
  });
}

function deriveVisibleSet(bundle: QuestionnaireBundle, answers: EffectiveAnswers): Set<string> {
  const visible = new Set(bundle.activeCoreQuestionIds);
  for (const branch of bundle.branches) {
    if (!branch.activeInPilot) continue;
    for (const questionId of branch.questionIds) {
      if (!bundle.activeBranchQuestionIds.includes(questionId)) continue;
      const question = bundle.questionById[questionId];
      if (question && activeBranchQuestionVisible(bundle, answers, branch, question)) {
        visible.add(questionId);
      }
    }
  }
  return visible;
}

/**
 * Pure derivation from a validated bundle and canonical effective answers.
 * previousVisibleQuestionIds is optional history used only to report answers
 * that were just deactivated; it never grants visibility.
 */
export function deriveQuestionnaireState(
  bundle: QuestionnaireBundle,
  effectiveAnswers: EffectiveAnswers,
  previousVisibleQuestionIds: readonly string[] = [],
): DerivedQuestionnaireState {
  const answers = validateEffectiveAnswers(bundle, effectiveAnswers);
  const visible = deriveVisibleSet(bundle, answers);
  const visibleQuestionIds = Object.freeze(
    bundle.orderedQuestionIds.filter(questionId => visible.has(questionId)),
  );
  const requiredVisibleQuestionIds = Object.freeze(
    visibleQuestionIds.filter(questionId => bundle.questionById[questionId]?.required === true),
  );

  const previous = new Set(previousVisibleQuestionIds);
  const deactivatedQuestionIds = Object.freeze(
    bundle.orderedQuestionIds.filter(
      questionId => previous.has(questionId) && !visible.has(questionId) && answers[questionId] !== undefined,
    ),
  );

  const activeAnswersRecord: Record<string, CanonicalAnswer> = {};
  for (const questionId of visibleQuestionIds) {
    const answer = answers[questionId];
    if (answer !== undefined) activeAnswersRecord[questionId] = answer;
  }
  const activeAnswers = Object.freeze(activeAnswersRecord);

  const manualFollowUpTriggerIds = Object.freeze(
    bundle.triggerPolicies
      .filter(policy => policy.manualFollowUpRequired && matchingPolicy(answers, policy))
      .map(policy => policy.id)
      .sort(),
  );

  const activeAnsweredCount = Object.keys(activeAnswers).length;
  const requiredAnsweredCount = requiredVisibleQuestionIds.filter(
    questionId => activeAnswers[questionId] !== undefined,
  ).length;
  const requiredActiveCount = requiredVisibleQuestionIds.length;
  const progress = Object.freeze({
    activeAnsweredCount,
    requiredAnsweredCount,
    requiredActiveCount,
    complete: requiredAnsweredCount === requiredActiveCount,
    ratio: requiredActiveCount === 0 ? 1 : requiredAnsweredCount / requiredActiveCount,
  });

  return Object.freeze({
    visibleQuestionIds,
    visibleSetHash: canonicalSha256(visibleQuestionIds),
    deactivatedQuestionIds,
    requiredVisibleQuestionIds,
    activeAnswers,
    manualFollowUpRequired: manualFollowUpTriggerIds.length > 0,
    manualFollowUpTriggerIds,
    progress,
  });
}
