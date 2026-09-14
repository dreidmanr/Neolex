import { evaluatePredicate } from "./astEvaluator";
import { technicalLegalCoreConfigBundle } from "./configBundle";
import { validateR1Profile } from "./r1ProfileValidator";
import { deriveNormalizedCodes, evaluateRecommendation } from "./recommendationEvaluator";
import {
  LEGAL_CORE_RELEASE_ID,
  LEGAL_CORE_STATUS,
  LEGAL_CORE_TECHNICAL_USE,
  LEGAL_CORE_VERSION,
  answerRef,
  optionIdsForAnswer,
  type AstEvaluationContext,
  type BranchId,
  type EvaluatedRisk,
  type GoalCode,
  type LegalCoreConfigBundle,
  type LegalCoreFlag,
  type RequestedDocumentCategoryResult,
  type RiskLevel,
  type RuleTrace,
  type SegmentCode,
  type Severity,
  type TechnicalLegalCoreInput,
  type TechnicalLegalCoreOutcome,
} from "./types";

const BRANCH_IDS: readonly BranchId[] = [
  "consumer",
  "partners",
  "dispute_detail",
  "investment",
  "contractors",
];
const PHASE_ORDER = new Map([
  ["consistency", 0],
  ["branching", 1],
  ["risk_activation", 2],
  ["critical_override", 3],
  ["follow_up", 4],
  ["escalation", 5],
  ["document_request", 6],
  ["aggregation", 7],
]);

function rank<T extends string>(order: readonly T[], value: T): number {
  const index = order.indexOf(value);
  if (index < 0) throw new Error(`Unranked legal-core value: ${value}`);
  return index;
}

function maxLevel<T extends string>(order: readonly T[], left: T, right: T): T {
  return rank(order, left) >= rank(order, right) ? left : right;
}

function uniqueSorted<T extends string>(values: readonly T[]): readonly T[] {
  return Object.freeze(Array.from(new Set(values)).sort() as T[]);
}

function makeContext(
  answers: AstEvaluationContext["answers"],
  activeRiskIds: ReadonlySet<string>,
  activeBranches: AstEvaluationContext["activeBranches"],
  flags: ReadonlySet<LegalCoreFlag>,
  activeBranchQuestionCount: number,
): AstEvaluationContext {
  return Object.freeze({ answers, activeRiskIds, activeBranches, flags, activeBranchQuestionCount });
}

function sortedRules<T extends { readonly id: string; readonly priority?: number }>(rules: readonly T[]): readonly T[] {
  return [...rules].sort((left, right) =>
    (left.priority ?? Number.MAX_SAFE_INTEGER) - (right.priority ?? Number.MAX_SAFE_INTEGER) ||
    left.id.localeCompare(right.id),
  );
}

function sortTraces(traces: readonly RuleTrace[]): readonly RuleTrace[] {
  return Object.freeze([...traces].sort((left, right) =>
    (PHASE_ORDER.get(left.phase) ?? Number.MAX_SAFE_INTEGER) -
      (PHASE_ORDER.get(right.phase) ?? Number.MAX_SAFE_INTEGER) ||
    left.ruleId.localeCompare(right.ruleId) ||
    (left.riskId ?? "").localeCompare(right.riskId ?? ""),
  ));
}

function riskComparator(bundle: LegalCoreConfigBundle) {
  const severity = bundle.rules.levelModel.severityOrder;
  const impact = bundle.rules.levelModel.impactOrder;
  const urgency = bundle.rules.levelModel.urgencyOrder;
  return (left: EvaluatedRisk, right: EvaluatedRisk): number =>
    rank(severity, right.level.severity) - rank(severity, left.level.severity) ||
    Number(right.criticalOverrideApplied) - Number(left.criticalOverrideApplied) ||
    rank(impact, right.level.impact) - rank(impact, left.level.impact) ||
    rank(urgency, right.level.urgency) - rank(urgency, left.level.urgency) ||
    left.riskId.localeCompare(right.riskId);
}

function severityOfDocument(
  bundle: LegalCoreConfigBundle,
  riskIds: readonly string[],
  risksById: ReadonlyMap<string, EvaluatedRisk>,
): Severity {
  let value: Severity = "low";
  for (const riskId of riskIds) {
    const risk = risksById.get(riskId);
    if (risk) value = maxLevel(bundle.rules.levelModel.severityOrder, value, risk.level.severity);
  }
  return value;
}

function documentRequests(
  bundle: LegalCoreConfigBundle,
  context: AstEvaluationContext,
  risksById: ReadonlyMap<string, EvaluatedRisk>,
  traces: RuleTrace[],
): Readonly<{
  primary: readonly RequestedDocumentCategoryResult[];
  optional: readonly RequestedDocumentCategoryResult[];
}> {
  const categoryById = new Map(bundle.rules.requestedDocumentCategories.map(item => [item.id, item]));
  const support = new Map<string, Set<string>>();
  for (const rule of sortedRules(bundle.rules.requestedDocumentCategoryRules)) {
    const evaluated = evaluatePredicate(rule.when, context);
    if (!evaluated.value) continue;
    const activeSupport = rule.result.supportingRiskIds.filter(id => context.activeRiskIds.has(id));
    if (activeSupport.length === 0) continue;
    const categorySupport = support.get(rule.result.requestCategoryId) ?? new Set<string>();
    activeSupport.forEach(id => categorySupport.add(id));
    support.set(rule.result.requestCategoryId, categorySupport);
    traces.push(Object.freeze({ phase: "document_request", ruleId: rule.id, atoms: evaluated.atoms }));
  }
  const results = Array.from(support.entries()).map(([categoryId, ids]) => {
    const supportingRiskIds = Array.from(ids).sort();
    return Object.freeze({
      categoryId,
      supportingRiskIds: Object.freeze(supportingRiskIds),
      weight: severityOfDocument(bundle, supportingRiskIds, risksById),
    });
  });
  results.sort((left, right) => {
    const severityOrder = bundle.rules.levelModel.severityOrder;
    const categoryLeft = categoryById.get(left.categoryId);
    const categoryRight = categoryById.get(right.categoryId);
    return rank(severityOrder, right.weight) - rank(severityOrder, left.weight) ||
      left.supportingRiskIds[0]!.localeCompare(right.supportingRiskIds[0]!) ||
      (categoryLeft?.baseTieBreakPriority ?? Number.MAX_SAFE_INTEGER) -
        (categoryRight?.baseTieBreakPriority ?? Number.MAX_SAFE_INTEGER) ||
      left.categoryId.localeCompare(right.categoryId);
  });
  const limit = bundle.rules.aggregationPolicy.requestedDocuments.maxPrimaryCategories;
  return Object.freeze({
    primary: Object.freeze(results.slice(0, limit)),
    optional: Object.freeze(results.slice(limit)),
  });
}

function validationOutcome(
  reasonCode: "required_active_answers_missing" | "invalid_canonical_answers",
  missingRequiredQuestionIds: readonly string[],
  invalidReason?: string,
): TechnicalLegalCoreOutcome {
  return Object.freeze({
    kind: "validation",
    technicalUse: LEGAL_CORE_TECHNICAL_USE,
    releaseId: LEGAL_CORE_RELEASE_ID,
    version: LEGAL_CORE_VERSION,
    status: LEGAL_CORE_STATUS,
    validation: Object.freeze({
      valid: false,
      blocksRecommendation: true,
      reasonCode,
      missingRequiredQuestionIds,
      ...(invalidReason === undefined ? {} : { invalidReason }),
    }),
    recommendation: null,
  });
}

/**
 * Pure, deterministic server-side legal-core entry point for the DB/outbox worker.
 * It accepts canonical fixture-shaped answer IDs only and returns draft technical IDs/metadata.
 */
export function evaluateTechnicalLegalCore(
  input: TechnicalLegalCoreInput,
  bundle: LegalCoreConfigBundle = technicalLegalCoreConfigBundle,
): TechnicalLegalCoreOutcome {
  const validated = validateR1Profile(bundle, input.canonicalAnswers, input.previousVisibleQuestionIds);
  if (!validated.valid) {
    return validationOutcome(
      validated.reasonCode,
      validated.missingRequiredQuestionIds,
      validated.invalidReason,
    );
  }
  const profile = validated.profile;
  const flags = new Set<LegalCoreFlag>();
  const traces: RuleTrace[] = [];
  const queues = new Set<string>();
  const activeRiskIds = new Set<string>();
  const activeBranchesMutable = Object.fromEntries(BRANCH_IDS.map(id => [id, false])) as Record<BranchId, boolean>;
  const visibleQuestionIds = new Set(profile.visibleQuestionIds);
  for (const branch of bundle.questionnaire.branches) {
    if (branch.activeInPilot && branch.questionIds.some(questionId => visibleQuestionIds.has(questionId))) {
      activeBranchesMutable[branch.id as BranchId] = true;
    }
  }

  // Phase 1: consistency uses visibility-filtered answers only.
  let context = makeContext(profile.activeAnswers, activeRiskIds, activeBranchesMutable, flags, 0);
  for (const rule of sortedRules(bundle.rules.consistencyRules)) {
    const evaluated = evaluatePredicate(rule.when, context);
    if (!evaluated.value) continue;
    flags.add(rule.result.setFlag);
    traces.push(Object.freeze({ phase: "consistency", ruleId: rule.id, atoms: evaluated.atoms }));
    context = makeContext(profile.activeAnswers, activeRiskIds, activeBranchesMutable, flags, 0);
  }

  // Phase 2: branching is rule-driven, while disabled branch triggers remain follow-up-only.
  for (const rule of sortedRules(bundle.rules.branchRules)) {
    const evaluated = evaluatePredicate(rule.when, context);
    if (!evaluated.value) continue;
    const configuredBranch = bundle.questionnaire.branches.find(item => item.id === rule.targetBranchId);
    if (rule.result.action === "activate_questions" && configuredBranch?.activeInPilot) {
      activeBranchesMutable[rule.targetBranchId] = true;
    }
    if (rule.result.manualFollowUpRequired) flags.add("manual_follow_up_required");
    traces.push(Object.freeze({ phase: "branching", ruleId: rule.id, atoms: evaluated.atoms }));
    context = makeContext(profile.activeAnswers, activeRiskIds, activeBranchesMutable, flags, 0);
  }
  if (profile.manualFollowUpRequired) flags.add("manual_follow_up_required");
  const activeBranches = Object.freeze({ ...activeBranchesMutable });
  const activeBranchQuestionCount = bundle.questionnaire.activeBranchQuestionIds
    .filter(questionId => visibleQuestionIds.has(questionId)).length;
  context = makeContext(profile.activeAnswers, activeRiskIds, activeBranches, flags, activeBranchQuestionCount);

  // Phase 3: activate and OR/maximum-merge risks by stable risk ID.
  const riskAccumulator = new Map<string, {
    level: RiskLevel;
    matchedRiskRuleIds: string[];
    traceAtoms: RuleTrace["atoms"] extends readonly (infer A)[] ? A[] : never[];
    sourceQuestionIds: Set<string>;
    overrideRuleIds: string[];
    criticalOverrideApplied: boolean;
    lawyerReviewFromRule: boolean;
  }>();
  for (const rule of sortedRules(bundle.rules.riskRules)) {
    const evaluated = evaluatePredicate(rule.when, context);
    if (!evaluated.value) continue;
    activeRiskIds.add(rule.riskId);
    const current = riskAccumulator.get(rule.riskId);
    const level = current
      ? Object.freeze({
          severity: maxLevel(bundle.rules.levelModel.severityOrder, current.level.severity, rule.result.level.severity),
          probability: maxLevel(bundle.rules.levelModel.probabilityOrder, current.level.probability, rule.result.level.probability),
          impact: maxLevel(bundle.rules.levelModel.impactOrder, current.level.impact, rule.result.level.impact),
          urgency: maxLevel(bundle.rules.levelModel.urgencyOrder, current.level.urgency, rule.result.level.urgency),
        })
      : Object.freeze({ ...rule.result.level });
    riskAccumulator.set(rule.riskId, {
      level,
      matchedRiskRuleIds: [...(current?.matchedRiskRuleIds ?? []), rule.id],
      traceAtoms: [...(current?.traceAtoms ?? []), ...evaluated.atoms],
      sourceQuestionIds: new Set([...Array.from(current?.sourceQuestionIds ?? []), ...rule.result.evidence.sourceQuestionIds]),
      overrideRuleIds: current?.overrideRuleIds ?? [],
      criticalOverrideApplied: current?.criticalOverrideApplied ?? false,
      lawyerReviewFromRule:
        (current?.lawyerReviewFromRule ?? false) || rule.result.lawyerReviewRequiredWhenActive,
    });
    traces.push(Object.freeze({ phase: "risk_activation", ruleId: rule.id, riskId: rule.riskId, atoms: evaluated.atoms }));
    context = makeContext(profile.activeAnswers, activeRiskIds, activeBranches, flags, activeBranchQuestionCount);
  }

  // Phase 4: all matching overrides apply to active target risks only.
  for (const rule of sortedRules(bundle.rules.criticalOverrideRules)) {
    const evaluated = evaluatePredicate(rule.when, context);
    if (!evaluated.value) continue;
    for (const riskId of rule.targetRiskIds.filter(id => activeRiskIds.has(id))) {
      const risk = riskAccumulator.get(riskId);
      if (!risk) continue;
      risk.level = Object.freeze({
        ...risk.level,
        severity: maxLevel(bundle.rules.levelModel.severityOrder, risk.level.severity, rule.result.minimumSeverity),
      });
      risk.criticalOverrideApplied = true;
      risk.lawyerReviewFromRule = true;
      risk.overrideRuleIds.push(rule.id);
      flags.add(rule.result.overrideAppliedFlag);
      traces.push(Object.freeze({ phase: "critical_override", ruleId: rule.id, riskId, atoms: evaluated.atoms }));
    }
    context = makeContext(profile.activeAnswers, activeRiskIds, activeBranches, flags, activeBranchQuestionCount);
  }

  // Phase 5: follow-up flags and queue requirements.
  for (const rule of sortedRules(bundle.rules.followUpRules)) {
    const evaluated = evaluatePredicate(rule.when, context);
    if (!evaluated.value) continue;
    flags.add(rule.result.setFlag);
    if (rule.result.queueCode) queues.add(rule.result.queueCode);
    traces.push(Object.freeze({ phase: "follow_up", ruleId: rule.id, atoms: evaluated.atoms }));
    context = makeContext(profile.activeAnswers, activeRiskIds, activeBranches, flags, activeBranchQuestionCount);
  }

  // Phase 6: configured escalation queues. No routing or outbox side effect occurs here.
  for (const rule of sortedRules(bundle.rules.escalationRules)) {
    const evaluated = evaluatePredicate(rule.when, context);
    if (!evaluated.value) continue;
    flags.add(rule.result.setFlag);
    if (rule.result.queueCode) queues.add(rule.result.queueCode);
    traces.push(Object.freeze({ phase: "escalation", ruleId: rule.id, atoms: evaluated.atoms }));
    context = makeContext(profile.activeAnswers, activeRiskIds, activeBranches, flags, activeBranchQuestionCount);
  }

  // Aggregated risk blocks only preserve technical IDs and exact answer/atom provenance.
  const risks = Array.from(riskAccumulator.entries()).map(([riskId, accumulated]) => {
    const definition = bundle.riskById[riskId]!;
    const manualReviewRequired = definition.manualReviewRequired || accumulated.lawyerReviewFromRule;
    const sourceQuestionIds = Array.from(accumulated.sourceQuestionIds).sort();
    const questionnaireAnswerRefs = sourceQuestionIds.flatMap(questionId =>
      optionIdsForAnswer(profile.activeAnswers[questionId]).map(optionId => answerRef(questionId, optionId)),
    ).sort();
    return Object.freeze({
      riskId,
      level: accumulated.level,
      criticalOverrideApplied: accumulated.criticalOverrideApplied,
      appliedOverrideRuleIds: uniqueSorted(accumulated.overrideRuleIds),
      manualReviewRequired,
      legalBasisIds: uniqueSorted(definition.allowedLegalBasisIds),
      evidence: Object.freeze({
        status: manualReviewRequired ? "manual_review_required" : "questionnaire_based",
        automaticDocumentConfirmationAllowed: false,
        sourceQuestionIds: Object.freeze(sourceQuestionIds),
        questionnaireAnswerRefs: Object.freeze(questionnaireAnswerRefs),
        traceAtoms: Object.freeze(accumulated.traceAtoms),
      }),
      matchedRiskRuleIds: uniqueSorted(accumulated.matchedRiskRuleIds),
    } satisfies EvaluatedRisk);
  }).sort(riskComparator(bundle));
  const risksById = new Map(risks.map(risk => [risk.riskId, risk] as const));
  context = makeContext(profile.activeAnswers, activeRiskIds, activeBranches, flags, activeBranchQuestionCount);
  const requestedDocuments = documentRequests(bundle, context, risksById, traces);

  const activeRiskIdList = uniqueSorted(Array.from(activeRiskIds));
  const manualReviewRequiredRiskIds = uniqueSorted(
    risks.filter(risk => risk.manualReviewRequired).map(risk => risk.riskId),
  );
  const appliedCriticalOverrideRiskIds = uniqueSorted(
    risks.filter(risk => risk.criticalOverrideApplied).map(risk => risk.riskId),
  );
  const overallRiskProfile = risks.length === 0 ? "low" : risks[0]!.level.severity;
  const activeAnswerRefs = new Set(
    profile.activeAnswerQuestionIds.flatMap(questionId =>
      optionIdsForAnswer(profile.activeAnswers[questionId]).map(optionId => answerRef(questionId, optionId)),
    ),
  );
  const normalized = deriveNormalizedCodes(bundle, activeAnswerRefs);
  const manualFollowUpRequired = flags.has("manual_follow_up_required");
  const lawyerReviewRequired = flags.has("lawyer_review_required");
  const manualReviewRequired = manualReviewRequiredRiskIds.length > 0 || manualFollowUpRequired;
  const requiredQueueCodes = uniqueSorted(Array.from(queues));
  const escalationRequired = lawyerReviewRequired || manualReviewRequired || requiredQueueCodes.length > 0;
  const effectiveSeveritiesByRiskId = Object.freeze(Object.fromEntries(
    risks.map(risk => [risk.riskId, risk.level.severity]),
  ));
  const recommendation = evaluateRecommendation(bundle, {
    integrityStatus: "valid",
    activeRiskIds: activeRiskIdList,
    effectiveSeveritiesByRiskId,
    appliedCriticalOverrideRiskIds,
    manualReviewRequiredRiskIds,
    escalationRequired,
    normalizedSegmentCodes: normalized.segments as readonly SegmentCode[],
    normalizedGoalCodes: normalized.goals as readonly GoalCode[],
  });

  const matchedRuleIds = uniqueSorted([
    ...traces.map(trace => trace.ruleId),
    ...profile.manualFollowUpTriggerIds,
    ...recommendation.matchedRuleIds,
  ]);
  const legalBasisIds = uniqueSorted(risks.flatMap(risk => risk.legalBasisIds));
  return Object.freeze({
    kind: "evaluated",
    technicalUse: LEGAL_CORE_TECHNICAL_USE,
    releaseId: LEGAL_CORE_RELEASE_ID,
    version: LEGAL_CORE_VERSION,
    status: LEGAL_CORE_STATUS,
    validation: Object.freeze({ valid: true, blocksRecommendation: false }),
    activeAnswerQuestionIds: profile.activeAnswerQuestionIds,
    inactiveAnswerQuestionIds: profile.inactiveAnswerQuestionIds,
    visibleQuestionIds: profile.visibleQuestionIds,
    activeBranchIds: Object.freeze(BRANCH_IDS.filter(id => activeBranches[id])),
    activeRisks: Object.freeze(risks),
    activeRiskIds: activeRiskIdList,
    overallRiskProfile,
    leadRiskId: risks[0]?.riskId ?? null,
    flags: uniqueSorted(Array.from(flags)),
    manualReviewRequiredRiskIds,
    appliedCriticalOverrideRiskIds,
    escalation: Object.freeze({
      required: escalationRequired,
      manualReviewRequired,
      manualFollowUpRequired,
      lawyerReviewRequired,
      requiredQueueCodes,
      queueCode: null,
      status: escalationRequired ? "required_not_routed" : "not_required",
    }),
    evidenceStatus: manualReviewRequired ? "manual_review_required" : "questionnaire_based",
    legalBasisIds,
    requestedDocumentCategories: requestedDocuments.primary,
    optionalRequestedDocumentCategories: requestedDocuments.optional,
    normalizedSegmentCodes: normalized.segments,
    normalizedGoalCodes: normalized.goals,
    matchedRuleIds,
    traces: sortTraces(traces),
    recommendation,
    configuration: Object.freeze({
      rulesetId: bundle.rules.rulesetId,
      mappingId: bundle.recommendationMapping.mappingId,
      contentHashes: bundle.contentHashes,
    }),
  });
}
