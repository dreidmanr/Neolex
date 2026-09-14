import type {
  GoalCode,
  LegalCoreConfigBundle,
  ProductCode,
  RecommendationInput,
  RecommendationResult,
  SegmentCode,
  Severity,
} from "./types";

export class RecommendationEvaluationError extends Error {
  constructor(message: string) {
    super(`Invalid recommendation evaluation: ${message}`);
    this.name = "RecommendationEvaluationError";
  }
}

function fail(message: string): never {
  throw new RecommendationEvaluationError(message);
}

function uniqueSorted<T extends string>(values: readonly T[]): readonly T[] {
  return Object.freeze(Array.from(new Set(values)).sort() as T[]);
}

function conditionMatches(
  field: string,
  operator: string,
  value: string | boolean | null,
  input: RecommendationInput,
  bundle: LegalCoreConfigBundle,
): boolean {
  if (field === "integrityStatus" && operator === "equals") return input.integrityStatus === value;
  if (field === "manualReviewRequiredRiskIds" && operator === "non_empty") {
    return input.manualReviewRequiredRiskIds.length > 0;
  }
  if (field === "effectiveSeveritiesByRiskId" && operator === "contains_value") {
    return Object.values(input.effectiveSeveritiesByRiskId).includes(value as Severity);
  }
  if (field === "appliedCriticalOverrideRiskIds" && operator === "non_empty") {
    return input.appliedCriticalOverrideRiskIds.length > 0;
  }
  if (field === "escalationRequired" && operator === "equals") return input.escalationRequired === value;
  if (field === "normalizedGoalCodes" && operator === "contains") {
    return input.normalizedGoalCodes.includes(value as GoalCode);
  }
  if (field === "activeRiskIds" && operator === "contains_unmapped_or_disallowed_risk") {
    const routes = new Map(bundle.recommendationMapping.riskRouting.map(route => [route.riskId, route]));
    return input.activeRiskIds.some(riskId => {
      const route = routes.get(riskId);
      const risk = bundle.riskById[riskId];
      return !route || !risk || !risk.allowedRecommendationProductCodes.includes(route.primaryProductCode);
    });
  }
  fail(`unsupported stop-factor condition ${field}.${operator}`);
}

function creditForProduct(bundle: LegalCoreConfigBundle, productCode: ProductCode): RecommendationResult["credit"] {
  const credit = bundle.recommendationMapping.creditEligibility;
  const entry = credit.entries.find(item => item.productCode === productCode);
  if (!entry) fail(`credit entry missing for ${productCode}`);
  return Object.freeze({
    policyId: credit.policyId,
    eligible: entry.eligible,
    status: entry.status,
  });
}

/** Pure exact-one selector. Display names and other free text are never read. */
export function evaluateRecommendation(
  bundle: LegalCoreConfigBundle,
  input: RecommendationInput,
): RecommendationResult {
  const mapping = bundle.recommendationMapping;
  const selection = mapping.selectionContract;
  const activeRiskIds = uniqueSorted(input.activeRiskIds);
  const manualIds = uniqueSorted(input.manualReviewRequiredRiskIds);
  const overrideIds = uniqueSorted(input.appliedCriticalOverrideRiskIds);
  const segments = uniqueSorted(input.normalizedSegmentCodes);
  const goals = uniqueSorted(input.normalizedGoalCodes);
  const normalized: RecommendationInput = Object.freeze({
    ...input,
    activeRiskIds,
    manualReviewRequiredRiskIds: manualIds,
    appliedCriticalOverrideRiskIds: overrideIds,
    normalizedSegmentCodes: segments,
    normalizedGoalCodes: goals,
  });

  const stopFactor = [...selection.stopFactors]
    .sort((left, right) => left.priority - right.priority || left.stopFactorId.localeCompare(right.stopFactorId))
    .find(item => conditionMatches(item.condition.field, item.condition.operator, item.condition.value, normalized, bundle));
  if (stopFactor) {
    const productCode = stopFactor.resultProductCode;
    return Object.freeze({
      productCode,
      selectionKind: "stop_factor",
      matchedRuleIds: Object.freeze([stopFactor.stopFactorId]),
      scores: Object.freeze([]),
      credit: creditForProduct(bundle, productCode),
    });
  }

  const candidates = selection.standardCandidateProductCodes;
  const scores = new Map<Exclude<ProductCode, "expert_review">, number>(candidates.map(code => [code, 0]));
  const matchedRuleIds: string[] = [];
  const routes = new Map(mapping.riskRouting.map(route => [route.riskId, route.primaryProductCode] as const));
  for (const riskId of activeRiskIds) {
    const productCode = routes.get(riskId);
    const severity = normalized.effectiveSeveritiesByRiskId[riskId];
    if (!productCode || !severity) fail(`missing route or severity for ${riskId}`);
    if (productCode === "expert_review") fail(`${riskId} unexpectedly reached ordinary scoring`);
    const previous = scores.get(productCode);
    if (previous === undefined) fail(`${riskId} routes outside standard candidates`);
    scores.set(productCode, previous + selection.severityWeights[severity]);
    matchedRuleIds.push(`RISK-ROUTE:${riskId}`);
  }
  for (const code of segments) {
    for (const boost of selection.segmentBoosts.filter(item => item.segmentCode === code)) {
      scores.set(boost.productCode, (scores.get(boost.productCode) ?? 0) + boost.points);
      matchedRuleIds.push(boost.ruleId);
    }
  }
  for (const code of goals) {
    if (code === "expert_review") fail("expert_review goal bypassed its stop factor");
    for (const boost of selection.goalBoosts.filter(item => item.goalCode === code)) {
      scores.set(boost.productCode, (scores.get(boost.productCode) ?? 0) + boost.points);
      matchedRuleIds.push(boost.ruleId);
    }
  }

  const scoreRows = Object.freeze(
    candidates.map(productCode => Object.freeze({ productCode, score: scores.get(productCode) ?? 0 })),
  );
  const positive = scoreRows.filter(row => row.score > 0);
  if (positive.length === 0) {
    const productCode = selection.fallbackProductCode;
    return Object.freeze({
      productCode,
      selectionKind: "fallback",
      matchedRuleIds: Object.freeze([selection.fallbackRuleId]),
      scores: scoreRows,
      credit: creditForProduct(bundle, productCode),
    });
  }
  const maximum = Math.max(...positive.map(row => row.score));
  const tied = new Set(positive.filter(row => row.score === maximum).map(row => row.productCode));
  const productCode = selection.tieBreakOrder.find(code => tied.has(code));
  if (!productCode) fail("tie-break order did not select a candidate");
  return Object.freeze({
    productCode,
    selectionKind: "scored",
    matchedRuleIds: Object.freeze(uniqueSorted(matchedRuleIds)),
    scores: scoreRows,
    credit: creditForProduct(bundle, productCode),
  });
}

export function deriveNormalizedCodes(
  bundle: LegalCoreConfigBundle,
  answerRefs: ReadonlySet<string>,
): Readonly<{ segments: readonly SegmentCode[]; goals: readonly GoalCode[] }> {
  const matchedSegments = bundle.recommendationMapping.inputContract.normalizedSegmentCatalog
    .filter(entry => {
      if (entry.segmentCode !== "early_saas_b2b") {
        return entry.sourceOptionRefs.some(ref => answerRefs.has(ref));
      }
      const productMatch = entry.sourceOptionRefs
        .filter(ref => ref.startsWith("b1_q2:"))
        .some(ref => answerRefs.has(ref));
      const stageMatch = entry.sourceOptionRefs
        .filter(ref => ref.startsWith("b1_q5:"))
        .some(ref => answerRefs.has(ref));
      return productMatch && stageMatch;
    })
    .map(entry => entry.segmentCode);
  const segments = matchedSegments.some(code => code !== "general")
    ? matchedSegments.filter(code => code !== "general")
    : matchedSegments;
  const goals = bundle.recommendationMapping.inputContract.normalizedGoalCatalog
    .filter(entry => entry.sourceOptionRefs.some(ref => answerRefs.has(ref)))
    .map(entry => entry.goalCode);
  return Object.freeze({
    segments: uniqueSorted(segments),
    goals: uniqueSorted(goals),
  });
}
