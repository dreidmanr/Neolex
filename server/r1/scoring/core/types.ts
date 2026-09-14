import type { QuestionnaireBundle } from "../../questionnaire/configBundle";
import type { CanonicalAnswer, EffectiveAnswers } from "../../questionnaire/validation";

export const LEGAL_CORE_RELEASE_ID = "lexy-r0-2026-09-12" as const;
export const LEGAL_CORE_VERSION = "1.0.0-draft.1" as const;
export const LEGAL_CORE_STATUS = "draft_pending_legal_approval" as const;
export const LEGAL_CORE_TECHNICAL_USE = "technical_test_only" as const;

export type Severity = "low" | "medium" | "high" | "critical";
export type Probability = "low" | "medium" | "high";
export type Impact = "limited" | "significant" | "substantial" | "blocking";
export type Urgency = "monitor" | "90_days" | "60_days" | "30_days" | "immediate";
export type EvidenceStatus = "questionnaire_based" | "manual_review_required";
export type ProductCode =
  | "start_product"
  | "safe_sales"
  | "rights_and_ip"
  | "data_and_infrastructure"
  | "enterprise_readiness"
  | "expert_review";
export type SegmentCode =
  | "early_saas_b2b"
  | "b2c_sales"
  | "ip_development"
  | "data_intensive"
  | "investment_enterprise"
  | "general";
export type GoalCode =
  | "launch"
  | "ip"
  | "safe_sales"
  | "data"
  | "partnership"
  | "investment_enterprise"
  | "expert_review"
  | "general";
export type BranchId = "consumer" | "partners" | "dispute_detail" | "investment" | "contractors";
export type LegalCoreFlag =
  | "critical_override_applied"
  | "answers_inconsistent"
  | "manual_follow_up_required"
  | "lawyer_review_required";

export type AnswerPredicate = Readonly<{
  op: "answer_contains_any" | "answer_contains_all";
  questionId: string;
  optionIds: readonly string[];
}>;
export type RiskPredicate = Readonly<{
  op: "risk_is_active_any";
  riskIds: readonly string[];
}>;
export type BranchPredicate = Readonly<{
  op: "branch_is_active";
  branchId: BranchId;
  expected: boolean;
}>;
export type FlagPredicate = Readonly<{
  op: "flag_is_set";
  flag: LegalCoreFlag;
  expected: true;
}>;
export type BranchCountPredicate = Readonly<{
  op: "active_branch_question_count_greater_than";
  value: number;
}>;
export type Predicate =
  | Readonly<{ op: "all_of" | "any_of"; args: readonly Predicate[] }>
  | Readonly<{ op: "not"; arg: Predicate }>
  | AnswerPredicate
  | RiskPredicate
  | BranchPredicate
  | FlagPredicate
  | BranchCountPredicate;

export type AtomProvenance = Readonly<{
  op:
    | "answer_contains_any"
    | "answer_contains_all"
    | "risk_is_active_any"
    | "branch_is_active"
    | "flag_is_set"
    | "active_branch_question_count_greater_than";
  result: boolean;
  questionId?: string;
  configuredOptionIds?: readonly string[];
  matchedOptionIds?: readonly string[];
  riskIds?: readonly string[];
  matchedRiskIds?: readonly string[];
  branchId?: BranchId;
  expectedBoolean?: boolean;
  actualBoolean?: boolean;
  flag?: LegalCoreFlag;
  configuredNumber?: number;
  actualNumber?: number;
}>;

export interface AstEvaluationContext {
  readonly answers: EffectiveAnswers;
  readonly activeRiskIds: ReadonlySet<string>;
  readonly activeBranches: Readonly<Record<BranchId, boolean>>;
  readonly flags: ReadonlySet<LegalCoreFlag>;
  readonly activeBranchQuestionCount: number;
}

export interface AstEvaluationResult {
  readonly value: boolean;
  readonly atoms: readonly AtomProvenance[];
}

export interface RiskLevel {
  readonly severity: Severity;
  readonly probability: Probability;
  readonly impact: Impact;
  readonly urgency: Urgency;
}

export interface RiskRule {
  readonly id: string;
  readonly version: string;
  readonly priority: number;
  readonly riskId: string;
  readonly evaluationStage: "risk_activation";
  readonly when: Predicate;
  readonly result: Readonly<{
    active: true;
    level: RiskLevel;
    criticalOverrideEligible: boolean;
    lawyerReviewRequiredWhenActive: boolean;
    evidence: Readonly<{
      status: "questionnaire_based";
      sourceQuestionIds: readonly string[];
      automaticDocumentConfirmationAllowed: false;
      requestedDocumentCategoryIds: readonly string[];
      tracePolicy: string;
    }>;
  }>;
}

export interface CriticalOverrideRule {
  readonly id: string;
  readonly version: string;
  readonly evaluationStage: "critical_override";
  readonly when: Predicate;
  readonly targetRiskIds: readonly string[];
  readonly result: Readonly<{
    minimumSeverity: Severity;
    lawyerReviewRequired: true;
    overrideAppliedFlag: "critical_override_applied";
  }>;
}

export interface BranchRule {
  readonly id: string;
  readonly version: string;
  readonly priority: number;
  readonly sourceQuestionId: string;
  readonly sourceOptionId: string;
  readonly targetBranchId: BranchId;
  readonly when: Predicate;
  readonly result: Readonly<{
    action: "activate_questions" | "manual_follow_up_required";
    targetQuestionIds: readonly string[];
    manualFollowUpRequired: boolean;
    reason: string;
  }>;
}

export interface FlagRule {
  readonly id: string;
  readonly version: string;
  readonly evaluationStage?: "consistency";
  readonly when: Predicate;
  readonly result: Readonly<{
    setFlag: LegalCoreFlag;
    queueCode?: string;
  }>;
}

export interface DocumentCategory {
  readonly id: string;
  readonly potentialConfirmationTargetRiskIds: readonly string[];
  readonly baseTieBreakPriority: number;
}

export interface DocumentRule {
  readonly id: string;
  readonly version: string;
  readonly when: Predicate;
  readonly result: Readonly<{
    requestCategoryId: string;
    supportingRiskIds: readonly string[];
  }>;
}

export interface RiskDefinition {
  readonly id: string;
  readonly objectMeta: Readonly<{
    releaseId: string;
    version: string;
    status: string;
  }>;
  readonly defaultSeverity: Severity;
  readonly criticalOverride: boolean;
  readonly evidenceRequirements: Readonly<{
    questionnaireEvidence: readonly string[];
    automaticDocumentConfirmationAllowed: false;
    defaultEvidenceStatus: "questionnaire_based";
  }>;
  readonly allowedLegalBasisIds: readonly string[];
  readonly manualReviewRequired: boolean;
  readonly allowedRecommendationProductCodes: readonly ProductCode[];
}

export interface LegalBasisDefinition {
  readonly id: string;
  readonly objectMeta: Readonly<{ releaseId: string; version: string; status: string }>;
  readonly riskIds: readonly string[];
  readonly verificationStatus: "draft_pending_legal_review";
}

export interface NormalizedCodeEntry<TCode extends string> {
  readonly sourceOptionRefs: readonly string[];
  readonly segmentCode?: TCode;
  readonly goalCode?: TCode;
}

export interface RecommendationMapping {
  readonly mappingId: "recommendation_mapping_v1";
  readonly mappingMeta: Readonly<{
    releaseId: string;
    version: string;
    status: string;
  }>;
  readonly inputContract: Readonly<{
    normalizedSegmentCatalog: readonly (NormalizedCodeEntry<SegmentCode> & { segmentCode: SegmentCode })[];
    normalizedGoalCatalog: readonly (NormalizedCodeEntry<GoalCode> & { goalCode: GoalCode })[];
  }>;
  readonly productCatalog: readonly Readonly<{ productCode: ProductCode }>[];
  readonly selectionContract: Readonly<{
    resultCardinality: 1;
    languageModelParticipation: "forbidden";
    standardCandidateProductCodes: readonly Exclude<ProductCode, "expert_review">[];
    failSafeProductCode: "expert_review";
    fallbackProductCode: "start_product";
    fallbackRuleId: string;
    stopFactors: readonly Readonly<{
      stopFactorId: string;
      priority: number;
      condition: Readonly<{
        field: string;
        operator: string;
        value: string | boolean | null;
      }>;
      resultProductCode: "expert_review";
    }>[];
    severityWeights: Readonly<Record<Severity, number>>;
    segmentBoosts: readonly Readonly<{
      ruleId: string;
      segmentCode: SegmentCode;
      productCode: Exclude<ProductCode, "expert_review">;
      points: number;
    }>[];
    goalBoosts: readonly Readonly<{
      ruleId: string;
      goalCode: Exclude<GoalCode, "expert_review">;
      productCode: Exclude<ProductCode, "expert_review">;
      points: number;
    }>[];
    tieBreakOrder: readonly Exclude<ProductCode, "expert_review">[];
  }>;
  readonly riskRouting: readonly Readonly<{
    riskId: string;
    primaryProductCode: ProductCode;
  }>[];
  readonly creditEligibility: Readonly<{
    policyId: string;
    sourceTariffId: string;
    currency: "RUB";
    creditAmountRub: number;
    eligibilityKey: "productCode";
    textMatchingForbidden: true;
    entries: readonly Readonly<{
      productCode: ProductCode;
      eligible: boolean;
      status: string;
    }>[];
  }>;
}

export interface RulesArtifact {
  readonly rulesetId: "rules_v1";
  readonly releaseId: string;
  readonly version: string;
  readonly status: string;
  readonly reviewStatus: Readonly<{ reviewedByLawyer: false }>;
  readonly releaseFlags: Readonly<{
    release0: Readonly<{ architectureOnly: true; runtimeIntegration: false }>;
    release1Pilot: Readonly<{ planned: true; enabledNow: false }>;
  }>;
  readonly engineContract: Readonly<{
    deterministic: true;
    executionPhases: readonly string[];
    predicateFormat: "declarative_json_ast_v1";
    unknownReferencePolicy: "fail_closed_configuration_error";
  }>;
  readonly levelModel: Readonly<{
    severityOrder: readonly Severity[];
    probabilityOrder: readonly Probability[];
    impactOrder: readonly Impact[];
    urgencyOrder: readonly Urgency[];
    criticalOverrideFloor: Severity;
  }>;
  readonly riskRules: readonly RiskRule[];
  readonly criticalOverrideRules: readonly CriticalOverrideRule[];
  readonly branchRules: readonly BranchRule[];
  readonly consistencyRules: readonly FlagRule[];
  readonly followUpRules: readonly FlagRule[];
  readonly escalationRules: readonly FlagRule[];
  readonly requestedDocumentCategories: readonly DocumentCategory[];
  readonly requestedDocumentCategoryRules: readonly DocumentRule[];
  readonly aggregationPolicy: Readonly<{
    requestedDocuments: Readonly<{ maxPrimaryCategories: number }>;
  }>;
}

export interface LegalCoreConfigBundle {
  readonly technicalUse: typeof LEGAL_CORE_TECHNICAL_USE;
  readonly releaseId: typeof LEGAL_CORE_RELEASE_ID;
  readonly version: typeof LEGAL_CORE_VERSION;
  readonly status: typeof LEGAL_CORE_STATUS;
  readonly reviewedByLawyer: false;
  readonly contentHashes: Readonly<Record<LegalCoreArtifactName, string>>;
  readonly questionnaire: QuestionnaireBundle;
  readonly rules: RulesArtifact;
  readonly riskDefinitions: readonly RiskDefinition[];
  readonly riskById: Readonly<Record<string, RiskDefinition>>;
  readonly legalBases: readonly LegalBasisDefinition[];
  readonly legalBasisById: Readonly<Record<string, LegalBasisDefinition>>;
  readonly recommendationMapping: RecommendationMapping;
}

export type LegalCoreArtifactName =
  | "rules"
  | "riskCatalog"
  | "recommendationMapping"
  | "legalBasisCatalog"
  | "questionnaire";
export type LegalCoreArtifactSources = Readonly<Record<LegalCoreArtifactName, unknown>>;

export type FixtureAnswerValue = string | readonly string[] | CanonicalAnswer;
export type FixtureAnswers = Readonly<Record<string, FixtureAnswerValue>>;

export interface TechnicalLegalCoreInput {
  readonly canonicalAnswers: FixtureAnswers;
  readonly previousVisibleQuestionIds?: readonly string[];
}

export type ValidationReasonCode =
  | "required_active_answers_missing"
  | "invalid_canonical_answers";

export interface LegalCoreValidationFailure {
  readonly kind: "validation";
  readonly technicalUse: typeof LEGAL_CORE_TECHNICAL_USE;
  readonly releaseId: typeof LEGAL_CORE_RELEASE_ID;
  readonly version: typeof LEGAL_CORE_VERSION;
  readonly status: typeof LEGAL_CORE_STATUS;
  readonly validation: Readonly<{
    valid: false;
    blocksRecommendation: true;
    reasonCode: ValidationReasonCode;
    missingRequiredQuestionIds: readonly string[];
    invalidReason?: string;
  }>;
  readonly recommendation: null;
}

export interface RuleTrace {
  readonly phase: string;
  readonly ruleId: string;
  readonly riskId?: string;
  readonly atoms: readonly AtomProvenance[];
}

export interface EvaluatedRisk {
  readonly riskId: string;
  readonly level: RiskLevel;
  readonly criticalOverrideApplied: boolean;
  readonly appliedOverrideRuleIds: readonly string[];
  readonly manualReviewRequired: boolean;
  readonly legalBasisIds: readonly string[];
  readonly evidence: Readonly<{
    status: EvidenceStatus;
    automaticDocumentConfirmationAllowed: false;
    sourceQuestionIds: readonly string[];
    questionnaireAnswerRefs: readonly string[];
    traceAtoms: readonly AtomProvenance[];
  }>;
  readonly matchedRiskRuleIds: readonly string[];
}

export interface RecommendationInput {
  readonly integrityStatus: "valid" | "invalid";
  readonly activeRiskIds: readonly string[];
  readonly effectiveSeveritiesByRiskId: Readonly<Record<string, Severity>>;
  readonly appliedCriticalOverrideRiskIds: readonly string[];
  readonly manualReviewRequiredRiskIds: readonly string[];
  readonly escalationRequired: boolean;
  readonly normalizedSegmentCodes: readonly SegmentCode[];
  readonly normalizedGoalCodes: readonly GoalCode[];
}

export interface RecommendationResult {
  readonly productCode: ProductCode;
  readonly selectionKind: "stop_factor" | "scored" | "fallback";
  readonly matchedRuleIds: readonly string[];
  readonly scores: readonly Readonly<{ productCode: Exclude<ProductCode, "expert_review">; score: number }>[];
  readonly credit: Readonly<{
    policyId: string;
    eligible: boolean;
    status: string;
  }>;
}

export interface RequestedDocumentCategoryResult {
  readonly categoryId: string;
  readonly supportingRiskIds: readonly string[];
  readonly weight: Severity;
}

export interface TechnicalLegalCoreSuccess {
  readonly kind: "evaluated";
  readonly technicalUse: typeof LEGAL_CORE_TECHNICAL_USE;
  readonly releaseId: typeof LEGAL_CORE_RELEASE_ID;
  readonly version: typeof LEGAL_CORE_VERSION;
  readonly status: typeof LEGAL_CORE_STATUS;
  readonly validation: Readonly<{ valid: true; blocksRecommendation: false }>;
  readonly activeAnswerQuestionIds: readonly string[];
  readonly inactiveAnswerQuestionIds: readonly string[];
  readonly visibleQuestionIds: readonly string[];
  readonly activeBranchIds: readonly BranchId[];
  readonly activeRisks: readonly EvaluatedRisk[];
  readonly activeRiskIds: readonly string[];
  readonly overallRiskProfile: Severity;
  readonly leadRiskId: string | null;
  readonly flags: readonly LegalCoreFlag[];
  readonly manualReviewRequiredRiskIds: readonly string[];
  readonly appliedCriticalOverrideRiskIds: readonly string[];
  readonly escalation: Readonly<{
    required: boolean;
    manualReviewRequired: boolean;
    manualFollowUpRequired: boolean;
    lawyerReviewRequired: boolean;
    requiredQueueCodes: readonly string[];
    queueCode: null;
    status: "required_not_routed" | "not_required";
  }>;
  readonly evidenceStatus: EvidenceStatus;
  readonly legalBasisIds: readonly string[];
  readonly requestedDocumentCategories: readonly RequestedDocumentCategoryResult[];
  readonly optionalRequestedDocumentCategories: readonly RequestedDocumentCategoryResult[];
  readonly normalizedSegmentCodes: readonly SegmentCode[];
  readonly normalizedGoalCodes: readonly GoalCode[];
  readonly matchedRuleIds: readonly string[];
  readonly traces: readonly RuleTrace[];
  readonly recommendation: RecommendationResult;
  readonly configuration: Readonly<{
    rulesetId: "rules_v1";
    mappingId: "recommendation_mapping_v1";
    contentHashes: Readonly<Record<LegalCoreArtifactName, string>>;
  }>;
}

export type TechnicalLegalCoreOutcome =
  | LegalCoreValidationFailure
  | TechnicalLegalCoreSuccess;

export interface ValidatedR1Profile {
  readonly answers: EffectiveAnswers;
  readonly activeAnswers: EffectiveAnswers;
  readonly activeAnswerQuestionIds: readonly string[];
  readonly inactiveAnswerQuestionIds: readonly string[];
  readonly visibleQuestionIds: readonly string[];
  readonly requiredVisibleQuestionIds: readonly string[];
  readonly missingRequiredQuestionIds: readonly string[];
  readonly manualFollowUpRequired: boolean;
  readonly manualFollowUpTriggerIds: readonly string[];
}

export function isCanonicalAnswer(value: FixtureAnswerValue): value is CanonicalAnswer {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "kind" in value;
}

export function optionIdsForAnswer(answer: CanonicalAnswer | undefined): readonly string[] {
  if (answer?.kind === "single") return [answer.optionId];
  if (answer?.kind === "multi") return answer.optionIds;
  return [];
}

export function answerRef(questionId: string, optionId: string): string {
  return `${questionId}:${optionId}`;
}

export type { CanonicalAnswer, EffectiveAnswers };
