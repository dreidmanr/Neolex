import legalBasisRaw from "../../../../shared/legal-core/legal_basis_catalog_v1.json?raw";
import questionnaireRaw from "../../../../shared/legal-core/questionnaire_v2.json?raw";
import recommendationRaw from "../../../../shared/legal-core/recommendation_mapping_v1.json?raw";
import riskCatalogRaw from "../../../../shared/legal-core/risk_catalog_v1.json?raw";
import rulesRaw from "../../../../shared/legal-core/rules_v1.json?raw";
import {
  loadTechnicalQuestionnaireBundle,
  validateQuestionnaireBundle,
} from "../../questionnaire/configBundle";
import {
  canonicalSerialize,
  sha256Hex,
  type CanonicalJsonValue,
} from "../../questionnaire/canonicalJson";
import { assertQuestionnaireTestAllowed } from "../../releaseGate";
import { validatePredicateReferences } from "./astEvaluator";
import {
  LEGAL_CORE_RELEASE_ID,
  LEGAL_CORE_STATUS,
  LEGAL_CORE_TECHNICAL_USE,
  LEGAL_CORE_VERSION,
  type LegalBasisDefinition,
  type LegalCoreArtifactName,
  type LegalCoreArtifactSources,
  type LegalCoreConfigBundle,
  type RecommendationMapping,
  type RiskDefinition,
  type RulesArtifact,
} from "./types";

export const LEGAL_CORE_CONTENT_SHA256 = Object.freeze({
  rules: "91a9a1ee2c6db4fe61095562c62922c21783c3d999b69bc27a1e1924a06b3aff",
  riskCatalog: "aa69fe27067f8fc52d3623554567af81f6ad241f590579e1bfd8e6bbbd7c2061",
  recommendationMapping: "788bd346810412b243f1f8bf8e849bc015f710166a623bd1ee5ecfd2718d2780",
  legalBasisCatalog: "a23a152afad501aeebd2d5abfc2c1d7e0d34eecad381e4c08e1483b8694cb4e9",
  questionnaire: "4c97f37bf0b443b1d8667da7916badf81740e7f45eeef9d45d3c9092eb0dc218",
} satisfies Record<LegalCoreArtifactName, string>);

export const LEGAL_CORE_CANONICAL_SHA256 = Object.freeze({
  rules: "ec14c3eac64ee401c12b7bff1d72002920e17ae93e52722fea9608ee0099b826",
  riskCatalog: "82e33c85cadc14b48071f24c0b2d2a67ea16439db212fd27c00807fc4b542917",
  recommendationMapping: "83b8070e504cdbc10b94528bf8f67abdee797c3ec546f1c99d79a43dc88e2df5",
  legalBasisCatalog: "327b1a4f12707a70af4e26b40c5f3eb7d900a25b8ce0987ed8b845d8c34b26bc",
  questionnaire: "763e441579a158fba281af35d63e688ef08b6c0841525fd8c750c56ba7f48b96",
} satisfies Record<LegalCoreArtifactName, string>);

const RULESET_HASH_DOMAIN = "lexy:r1:ruleset-bundle:v1\u0000";

export class LegalCoreConfigValidationError extends Error {
  constructor(message: string) {
    super(`Invalid technical legal-core bundle: ${message}`);
    this.name = "LegalCoreConfigValidationError";
  }
}

function fail(message: string): never {
  throw new LegalCoreConfigValidationError(message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainObject(value)) fail(`${label} must be a plain object`);
  return value;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) fail(`${label} must be a non-empty string`);
  return value;
}

function strings(value: unknown, label: string): string[] {
  const values = array(value, label).map((item, index) => string(item, `${label}[${index}]`));
  assertUnique(values, label);
  return values;
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) fail(`${label} contains duplicates`);
}

function assertPinnedMeta(metaValue: unknown, label: string): void {
  const meta = object(metaValue, label);
  if (meta.releaseId !== LEGAL_CORE_RELEASE_ID) fail(`${label}.releaseId is not pinned`);
  if (meta.version !== LEGAL_CORE_VERSION) fail(`${label}.version is not pinned`);
  if (meta.status !== LEGAL_CORE_STATUS) fail(`${label}.status is not the legal draft status`);
}

function parseSource(name: LegalCoreArtifactName, source: unknown, enforcePin: boolean): unknown {
  if (typeof source === "string") {
    if (enforcePin) {
      const hash = sha256Hex(source);
      if (hash !== LEGAL_CORE_CONTENT_SHA256[name]) fail(`${name} raw SHA-256 mismatch (${hash})`);
    }
    try {
      return JSON.parse(source) as unknown;
    } catch {
      fail(`${name} static import is not valid JSON`);
    }
  }
  if (enforcePin) {
    let hash: string;
    try {
      hash = sha256Hex(canonicalSerialize(source as CanonicalJsonValue));
    } catch {
      fail(`${name} static import is not canonical JSON`);
    }
    if (hash !== LEGAL_CORE_CANONICAL_SHA256[name]) {
      fail(`${name} canonical SHA-256 mismatch (${hash})`);
    }
  }
  return source;
}

function validateRiskCatalog(value: unknown): readonly RiskDefinition[] {
  const catalog = object(value, "riskCatalog");
  if (catalog.catalogId !== "risk_catalog_v1") fail("risk catalog ID is not pinned");
  assertPinnedMeta(catalog.catalogMeta, "riskCatalog.catalogMeta");
  const review = object(catalog.reviewStatus, "riskCatalog.reviewStatus");
  if (review.reviewedByLawyer !== false) fail("risk catalog must remain unreviewed draft");
  const definitions = array(catalog.riskDefinitions, "riskCatalog.riskDefinitions") as unknown as RiskDefinition[];
  if (definitions.length !== 25) fail("risk catalog must contain exactly 25 definitions");
  const ids = definitions.map((definition, index) => {
    const item = object(definition, `riskDefinitions[${index}]`);
    const id = string(item.id, `riskDefinitions[${index}].id`);
    if (!/^LEXR0-RISK-[0-9]{3}$/.test(id)) fail(`${id} has an invalid risk ID`);
    assertPinnedMeta(item.objectMeta, `${id}.objectMeta`);
    const evidence = object(item.evidenceRequirements, `${id}.evidenceRequirements`);
    if (evidence.automaticDocumentConfirmationAllowed !== false || evidence.defaultEvidenceStatus !== "questionnaire_based") {
      fail(`${id} enables unsupported automatic document confirmation`);
    }
    strings(item.allowedLegalBasisIds, `${id}.allowedLegalBasisIds`);
    strings(item.allowedRecommendationProductCodes, `${id}.allowedRecommendationProductCodes`);
    if (typeof item.manualReviewRequired !== "boolean") fail(`${id}.manualReviewRequired must be boolean`);
    return id;
  });
  assertUnique(ids, "risk IDs");
  return Object.freeze(definitions);
}

function validateLegalBasisCatalog(value: unknown): readonly LegalBasisDefinition[] {
  const catalog = object(value, "legalBasisCatalog");
  if (catalog.catalogId !== "legal_basis_catalog_v1") fail("legal-basis catalog ID is not pinned");
  assertPinnedMeta(catalog.catalogMeta, "legalBasisCatalog.catalogMeta");
  const review = object(catalog.reviewStatus, "legalBasisCatalog.reviewStatus");
  if (review.reviewedByLawyer !== false) fail("legal-basis catalog must remain unreviewed draft");
  const bases = array(catalog.legalBases, "legalBasisCatalog.legalBases") as unknown as LegalBasisDefinition[];
  const ids = bases.map((basis, index) => {
    const item = object(basis, `legalBases[${index}]`);
    const id = string(item.id, `legalBases[${index}].id`);
    assertPinnedMeta(item.objectMeta, `${id}.objectMeta`);
    if (item.verificationStatus !== "draft_pending_legal_review") fail(`${id} has a non-draft verification status`);
    strings(item.riskIds, `${id}.riskIds`);
    return id;
  });
  const coverage = object(catalog.coverage, "legalBasisCatalog.coverage");
  const coverageIds = strings(coverage.riskIds, "legalBasisCatalog.coverage.riskIds");
  const linkedRiskIds = new Set(bases.flatMap(basis => basis.riskIds));
  if (coverageIds.length !== linkedRiskIds.size || coverageIds.some(id => !linkedRiskIds.has(id))) {
    fail("legal-basis coverage disagrees with linked risk IDs");
  }
  assertUnique(ids, "legal-basis IDs");
  return Object.freeze(bases);
}

function validateRecommendation(value: unknown): RecommendationMapping {
  const mapping = object(value, "recommendationMapping");
  if (mapping.mappingId !== "recommendation_mapping_v1") fail("recommendation mapping ID is not pinned");
  assertPinnedMeta(mapping.mappingMeta, "recommendationMapping.mappingMeta");
  const selection = object(mapping.selectionContract, "recommendationMapping.selectionContract");
  if (selection.resultCardinality !== 1 || selection.languageModelParticipation !== "forbidden") {
    fail("recommendation selection must be exact-one and language-model-free");
  }
  if (selection.failSafeProductCode !== "expert_review" || selection.fallbackProductCode !== "start_product") {
    fail("recommendation fail-safe/fallback codes are not pinned");
  }
  const guarantees = object(mapping.deterministicGuarantees, "recommendationMapping.deterministicGuarantees");
  if (
    guarantees.exactlyOneProduct !== true ||
    guarantees.criticalAndManualReviewPrecedeScoring !== true ||
    guarantees.creditUsesProductCodeOnly !== true ||
    guarantees.clientDisplayTextAffectsDecision !== false ||
    guarantees.languageModelAffectsDecision !== false
  ) {
    fail("recommendation deterministic guarantees are weakened");
  }
  const credit = object(mapping.creditEligibility, "recommendationMapping.creditEligibility");
  if (credit.eligibilityKey !== "productCode" || credit.textMatchingForbidden !== true) {
    fail("credit eligibility must use productCode only");
  }
  return mapping as unknown as RecommendationMapping;
}

function validateRules(value: unknown): RulesArtifact {
  const rules = object(value, "rules");
  if (rules.rulesetId !== "rules_v1") fail("ruleset ID is not pinned");
  assertPinnedMeta(rules, "rules");
  const review = object(rules.reviewStatus, "rules.reviewStatus");
  if (review.reviewedByLawyer !== false) fail("rules must remain unreviewed draft");
  const releaseFlags = object(rules.releaseFlags, "rules.releaseFlags");
  const release0 = object(releaseFlags.release0, "rules.releaseFlags.release0");
  const pilot = object(releaseFlags.release1Pilot, "rules.releaseFlags.release1Pilot");
  if (release0.architectureOnly !== true || release0.runtimeIntegration !== false || pilot.enabledNow !== false) {
    fail("rules artifact is not technical-only");
  }
  const contract = object(rules.engineContract, "rules.engineContract");
  const expectedPhases = [
    "consistency",
    "branching",
    "risk_activation",
    "critical_override",
    "follow_up",
    "escalation",
    "document_request",
    "aggregation",
  ];
  if (
    contract.deterministic !== true ||
    contract.predicateFormat !== "declarative_json_ast_v1" ||
    contract.unknownReferencePolicy !== "fail_closed_configuration_error" ||
    canonicalSerialize(contract.executionPhases as CanonicalJsonValue) !== canonicalSerialize(expectedPhases)
  ) {
    fail("rules engine contract is not pinned to deterministic ordered phases");
  }
  const typed = rules as unknown as RulesArtifact;
  if (typed.riskRules.length !== 25 || typed.criticalOverrideRules.length !== 8 || typed.branchRules.length !== 8) {
    fail("rules coverage counts are invalid");
  }
  return typed;
}

function semanticValidate(bundle: LegalCoreConfigBundle): void {
  const riskIds = new Set(bundle.riskDefinitions.map(item => item.id));
  const basisIds = new Set(bundle.legalBases.map(item => item.id));
  const questionIds = new Set(bundle.questionnaire.questions.map(item => item.id));
  const branchIds = new Set(bundle.questionnaire.branches.map(item => item.id));
  const optionsByQuestionId = new Map(
    bundle.questionnaire.questions.map(question => [
      question.id,
      new Set(question.options.map(option => option.id)) as ReadonlySet<string>,
    ] as const),
  );
  const documentIds = new Set(bundle.rules.requestedDocumentCategories.map(item => item.id));
  assertUnique(bundle.rules.requestedDocumentCategories.map(item => item.id), "document category IDs");

  const references = { questionIds, optionsByQuestionId, riskIds, branchIds };
  const predicateRules = [
    ...bundle.rules.consistencyRules,
    ...bundle.rules.branchRules,
    ...bundle.rules.riskRules,
    ...bundle.rules.criticalOverrideRules,
    ...bundle.rules.followUpRules,
    ...bundle.rules.escalationRules,
    ...bundle.rules.requestedDocumentCategoryRules,
  ];
  assertUnique(predicateRules.map(rule => rule.id), "rule IDs");
  for (const rule of predicateRules) validatePredicateReferences(rule.when, references);

  const riskRuleIds = bundle.rules.riskRules.map(rule => rule.riskId);
  assertUnique(riskRuleIds, "risk rule risk IDs");
  if (riskRuleIds.length !== riskIds.size || riskRuleIds.some(id => !riskIds.has(id))) {
    fail("risk rules do not cover the risk catalog exactly once");
  }

  function assertQuestionRefs(ids: readonly string[], label: string): void {
    for (const id of ids) if (!questionIds.has(id)) fail(`${label} references unknown question ${id}`);
  }
  function assertRiskRefs(ids: readonly string[], label: string): void {
    for (const id of ids) if (!riskIds.has(id)) fail(`${label} references unknown risk ${id}`);
  }
  function assertDocumentRefs(ids: readonly string[], label: string): void {
    for (const id of ids) if (!documentIds.has(id)) fail(`${label} references unknown document category ${id}`);
  }

  for (const definition of bundle.riskDefinitions) {
    assertQuestionRefs(definition.evidenceRequirements.questionnaireEvidence, `${definition.id} evidence`);
    for (const basisId of definition.allowedLegalBasisIds) {
      const basis = bundle.legalBasisById[basisId];
      if (!basis || !basis.riskIds.includes(definition.id)) {
        fail(`${definition.id} references unlinked legal basis ${basisId}`);
      }
    }
  }
  for (const basis of bundle.legalBases) {
    assertRiskRefs(basis.riskIds, `${basis.id}.riskIds`);
    for (const riskId of basis.riskIds) {
      if (!bundle.riskById[riskId]?.allowedLegalBasisIds.includes(basis.id)) {
        fail(`${basis.id} is not reciprocally linked from ${riskId}`);
      }
    }
  }
  for (const rule of bundle.rules.riskRules) {
    assertQuestionRefs(rule.result.evidence.sourceQuestionIds, `${rule.id}.sourceQuestionIds`);
    assertDocumentRefs(rule.result.evidence.requestedDocumentCategoryIds, `${rule.id}.requestedDocumentCategoryIds`);
    const definition = bundle.riskById[rule.riskId];
    if (rule.result.criticalOverrideEligible !== definition.criticalOverride) {
      fail(`${rule.id} critical override eligibility disagrees with risk catalog`);
    }
  }
  for (const rule of bundle.rules.criticalOverrideRules) assertRiskRefs(rule.targetRiskIds, `${rule.id}.targetRiskIds`);
  for (const rule of bundle.rules.branchRules) {
    if (!branchIds.has(rule.targetBranchId)) fail(`${rule.id} targets unknown branch ${rule.targetBranchId}`);
    assertQuestionRefs(rule.result.targetQuestionIds, `${rule.id}.targetQuestionIds`);
  }
  for (const category of bundle.rules.requestedDocumentCategories) {
    assertRiskRefs(category.potentialConfirmationTargetRiskIds, `${category.id}.riskIds`);
  }
  for (const rule of bundle.rules.requestedDocumentCategoryRules) {
    if (!documentIds.has(rule.result.requestCategoryId)) fail(`${rule.id} requests unknown category`);
    assertRiskRefs(rule.result.supportingRiskIds, `${rule.id}.supportingRiskIds`);
  }

  const products = new Set(bundle.recommendationMapping.productCatalog.map(item => item.productCode));
  assertUnique(Array.from(products), "product codes");
  if (products.size !== 6) fail("recommendation product catalog must contain six unique codes");
  const routing = bundle.recommendationMapping.riskRouting;
  assertUnique(routing.map(item => item.riskId), "recommendation risk routes");
  if (routing.length !== riskIds.size) fail("recommendation routing must cover every risk once");
  for (const route of routing) {
    const risk = bundle.riskById[route.riskId];
    if (!risk) fail(`recommendation references unknown risk ${route.riskId}`);
    if (!products.has(route.primaryProductCode)) fail(`${route.riskId} routes to unknown product`);
    if (!risk.allowedRecommendationProductCodes.includes(route.primaryProductCode)) {
      fail(`${route.riskId} routes to a product disallowed by the risk catalog`);
    }
  }
  const sourceRisk = object(
    object(bundle.recommendationMapping as unknown, "recommendationMapping").sourceCatalogs,
    "recommendationMapping.sourceCatalogs",
  ).riskCatalog;
  const sourceMeta = object(sourceRisk, "recommendationMapping.sourceCatalogs.riskCatalog");
  if (
    sourceMeta.catalogId !== "risk_catalog_v1" ||
    sourceMeta.version !== LEGAL_CORE_VERSION ||
    sourceMeta.status !== LEGAL_CORE_STATUS
  ) {
    fail("recommendation risk-catalog source pin is invalid");
  }


  // This core intentionally consumes IDs and draft metadata only; no display/legal text is emitted.
  if (basisIds.size === 0) fail("legal-basis catalog must not be empty");
}

function makeBundle(values: LegalCoreArtifactSources): LegalCoreConfigBundle {
  const questionnaire = validateQuestionnaireBundle(values.questionnaire);
  const riskDefinitions = validateRiskCatalog(values.riskCatalog);
  const legalBases = validateLegalBasisCatalog(values.legalBasisCatalog);
  const riskById = Object.freeze(Object.fromEntries(riskDefinitions.map(item => [item.id, item])));
  const legalBasisById = Object.freeze(Object.fromEntries(legalBases.map(item => [item.id, item])));
  const bundle: LegalCoreConfigBundle = Object.freeze({
    technicalUse: LEGAL_CORE_TECHNICAL_USE,
    releaseId: LEGAL_CORE_RELEASE_ID,
    version: LEGAL_CORE_VERSION,
    status: LEGAL_CORE_STATUS,
    reviewedByLawyer: false,
    contentHashes: LEGAL_CORE_CONTENT_SHA256,
    questionnaire,
    rules: validateRules(values.rules),
    riskDefinitions,
    riskById,
    legalBases,
    legalBasisById,
    recommendationMapping: validateRecommendation(values.recommendationMapping),
  });
  semanticValidate(bundle);
  return bundle;
}

/** Injectable validation entry point. Pins are intentionally not enforced for malformed-config tests. */
export function validateLegalCoreConfigBundle(sources: LegalCoreArtifactSources): LegalCoreConfigBundle {
  return makeBundle(sources);
}

/** Pinned static server-only loader for the five technical draft artifacts. */
export function loadTechnicalLegalCoreConfigBundle(
  sources: LegalCoreArtifactSources = {
    rules: rulesRaw,
    riskCatalog: riskCatalogRaw,
    recommendationMapping: recommendationRaw,
    legalBasisCatalog: legalBasisRaw,
    questionnaire: questionnaireRaw,
  },
): LegalCoreConfigBundle {
  const usingDefaults =
    sources.rules === rulesRaw &&
    sources.riskCatalog === riskCatalogRaw &&
    sources.recommendationMapping === recommendationRaw &&
    sources.legalBasisCatalog === legalBasisRaw &&
    sources.questionnaire === questionnaireRaw;
  const parsed = Object.freeze({
    rules: parseSource("rules", sources.rules, usingDefaults),
    riskCatalog: parseSource("riskCatalog", sources.riskCatalog, usingDefaults),
    recommendationMapping: parseSource("recommendationMapping", sources.recommendationMapping, usingDefaults),
    legalBasisCatalog: parseSource("legalBasisCatalog", sources.legalBasisCatalog, usingDefaults),
    questionnaire: parseSource("questionnaire", sources.questionnaire, usingDefaults),
  });
  if (usingDefaults) {
    // Reuse the independently pinned questionnaire loader too.
    loadTechnicalQuestionnaireBundle(questionnaireRaw);
  }
  return makeBundle(parsed);
}

export const technicalLegalCoreConfigBundle = loadTechnicalLegalCoreConfigBundle();

/** Stable identity of the exact legal-core artifact set used for technical scoring. */
export function legalCoreRulesetBundleHash(bundle: LegalCoreConfigBundle): string {
  return sha256Hex(
    RULESET_HASH_DOMAIN + canonicalSerialize({
      releaseId: bundle.releaseId,
      rulesetId: bundle.rules.rulesetId,
      version: bundle.version,
      contentHashes: bundle.contentHashes,
    }),
  );
}

export const TECHNICAL_LEGAL_CORE_RULESET_BUNDLE_HASH = legalCoreRulesetBundleHash(
  technicalLegalCoreConfigBundle,
);

/** Runtime integration must call this gate; pure evaluation itself has no environment dependency. */
export function assertTechnicalLegalCoreAllowed(
  bundle: LegalCoreConfigBundle = technicalLegalCoreConfigBundle,
): void {
  if (
    bundle.technicalUse !== LEGAL_CORE_TECHNICAL_USE ||
    bundle.releaseId !== LEGAL_CORE_RELEASE_ID ||
    bundle.version !== LEGAL_CORE_VERSION ||
    bundle.status !== LEGAL_CORE_STATUS ||
    bundle.reviewedByLawyer !== false ||
    Object.entries(LEGAL_CORE_CONTENT_SHA256).some(
      ([name, hash]) => bundle.contentHashes[name as LegalCoreArtifactName] !== hash,
    )
  ) {
    fail("runtime bundle pins do not match the technical-test-only draft release");
  }
  assertQuestionnaireTestAllowed();
}
