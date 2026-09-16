import legalBasisRaw from "../../../shared/legal-core/legal_basis_catalog_v1.json?raw";
import phraseCatalogRaw from "../../../shared/legal-core/approved_phrases_v1.json?raw";
import questionnaireRaw from "../../../shared/legal-core/questionnaire_v2.json?raw";
import recommendationRaw from "../../../shared/legal-core/recommendation_mapping_v1.json?raw";
import riskCatalogRaw from "../../../shared/legal-core/risk_catalog_v1.json?raw";
import rulesRaw from "../../../shared/legal-core/rules_v1.json?raw";
import {
  canonicalSerialize,
  sha256Hex,
  type CanonicalJsonValue,
} from "../questionnaire/canonicalJson";
import type {
  BuildReportSnapshotInput,
  ReportCandidate,
  ValidatedReportSources,
} from "./types";
import {
  REPORT_SCHEMA_ID,
  REPORT_SCHEMA_VERSION,
  REPORT_TEST_WATERMARK,
} from "./types";

type JsonObject = Record<string, CanonicalJsonValue>;

interface RiskCatalogSource {
  readonly riskDefinitions: readonly Readonly<{
    id: string;
    domain: string;
    approvedLanguageIds: readonly string[];
    businessImpacts: readonly string[];
    requiredActions: readonly string[];
    roadmapPeriod: string;
    allowedLegalBasisIds: readonly string[];
  }>[];
}

interface PhraseCatalogSource {
  readonly reportPhrases: readonly Readonly<{ id: string; text: string }>[];
  readonly evidenceStatusPhrases: readonly Readonly<{
    id: string;
    evidenceStatus: string;
    text: string;
  }>[];
  readonly riskPhrases: readonly Readonly<{
    id: string;
    riskId: string;
    title: string;
    findingTemplate: string;
    legalConstructionTemplate: string;
    businessImportanceTemplate: string;
    recommendedActionTemplate: string;
    evidenceCaveatTemplate: string;
  }>[];
}

interface LegalBasisCatalogSource {
  readonly legalBases: readonly Readonly<{
    id: string;
    objectMeta: Readonly<{ version: string }>;
    act: Readonly<{ title: string }>;
    article: Readonly<{ reference: string }>;
    approvedDraftWording: Readonly<{ short: string }>;
    officialSource: Readonly<{ url: string }>;
    checkedAt: string;
    verificationStatus: string;
  }>[];
}

interface RecommendationSource {
  readonly productCatalog: readonly Readonly<{
    productCode: string;
    displayName: string;
    productKind: string;
  }>[];
}

interface QuestionnaireSource {
  readonly branches: readonly Readonly<{
    id: string;
    questionIds: readonly string[];
    activation: Readonly<{ sourceQuestionId: string }>;
  }>[];
}

interface RulesSource {
  readonly requestedDocumentCategories: readonly Readonly<{
    id: string;
    title: string;
    potentialConfirmationTargetRiskIds: readonly string[];
  }>[];
}

const risks = JSON.parse(riskCatalogRaw) as RiskCatalogSource;
const phrases = JSON.parse(phraseCatalogRaw) as PhraseCatalogSource;
const legalBases = JSON.parse(legalBasisRaw) as LegalBasisCatalogSource;
const questionnaire = JSON.parse(questionnaireRaw) as QuestionnaireSource;
const recommendations = JSON.parse(recommendationRaw) as RecommendationSource;
const rules = JSON.parse(rulesRaw) as RulesSource;

const riskById = new Map(risks.riskDefinitions.map(value => [value.id, value]));
const phraseByRiskId = new Map(phrases.riskPhrases.map(value => [value.riskId, value]));
const reportPhraseById = new Map(phrases.reportPhrases.map(value => [value.id, value.text]));
const evidencePhraseByStatus = new Map(
  phrases.evidenceStatusPhrases.map(value => [value.evidenceStatus, value]),
);
const legalBasisById = new Map(legalBases.legalBases.map(value => [value.id, value]));
const productByCode = new Map(recommendations.productCatalog.map(value => [value.productCode, value]));
const documentCategoryById = new Map(
  rules.requestedDocumentCategories.map(value => [value.id, value]),
);

function stable<T>(values: readonly T[], key: (value: T) => string): T[] {
  return [...values].sort((left, right) => key(left).localeCompare(key(right)));
}

function configRef(
  artifactId: string,
  version: string,
  checksumSha256: string,
): JsonObject {
  return {
    artifactId,
    version,
    status: "draft_pending_legal_approval",
    checksumSha256,
  };
}

function sourceVersions(input: BuildReportSnapshotInput): JsonObject {
  const pins = input.pinnedConfiguration;
  const hash = pins.sourceArtifactHashes;
  const version = REPORT_SCHEMA_VERSION;
  return {
    questionnaire: configRef("questionnaire_v2", version, hash.questionnaire),
    riskCatalog: configRef("risk_catalog_v1", version, hash.riskCatalog),
    ruleset: configRef("rules_v1", version, hash.rules),
    legalBasisCatalog: configRef("legal_basis_catalog_v1", version, hash.legalBasisCatalog),
    phraseCatalog: configRef("approved_phrases_v1", version, hash.phraseCatalog),
    recommendationMapping: configRef(
      "recommendation_mapping_v1",
      version,
      hash.recommendationMapping,
    ),
    tariffCatalog: configRef("tariffs_v1", version, hash.tariffCatalog),
    creditPolicy: configRef("credit_policy_v1", version, hash.creditPolicy),
    reportSchema: configRef(
      pins.reportSchema.artifactId,
      pins.reportSchema.version,
      pins.reportSchema.checksumSha256,
    ),
    reportTemplate: configRef(
      pins.reportTemplate.artifactId,
      pins.reportTemplate.version,
      pins.reportTemplate.checksumSha256,
    ),
    generator: configRef(
      pins.generator.artifactId,
      pins.generator.version,
      pins.generator.checksumSha256,
    ),
  };
}

function traceRuleKind(phase: string): string {
  if (phase === "branching") return "branch";
  if (phase === "risk_activation") return "risk_activation";
  if (phase === "critical_override") return "critical_override";
  if (phase === "document_request") return "document_request";
  return phase;
}

function activatedRules(sources: ValidatedReportSources): CanonicalJsonValue[] {
  const traced = sources.outcome.traces.map(trace => {
    const payload: JsonObject = {
      evaluationStage: trace.phase,
      riskIds: trace.riskId ? [trace.riskId] : [],
      ruleId: trace.ruleId,
      ruleKind: traceRuleKind(trace.phase),
    };
    return {
      ruleId: trace.ruleId,
      ruleVersion: REPORT_SCHEMA_VERSION,
      sourceArtifactId: "rules_v1",
      ruleKind: traceRuleKind(trace.phase),
      evaluationStage: trace.phase,
      riskIds: trace.riskId ? [trace.riskId] : [],
      traceAtoms: trace.atoms
        .filter(atom => atom.questionId !== undefined)
        .map(atom => ({
          questionId: atom.questionId!,
          answerRevision:
            sources.verifiedSourceBundle?.answerRevisionByQuestionId[atom.questionId!] ?? 0,
          optionIds: [...(atom.matchedOptionIds ?? atom.configuredOptionIds ?? [])],
          matched: atom.result,
        }))
        .filter(atom => atom.answerRevision > 0),
      resultChecksumSha256: sha256Hex(canonicalSerialize(payload)),
    } satisfies JsonObject;
  });
  const tracedIds = new Set(traced.map(value => value.ruleId));
  const recommendationRules = sources.outcome.recommendation.matchedRuleIds
    .filter(ruleId => !tracedIds.has(ruleId))
    .map(ruleId => {
      const payload: JsonObject = {
        productCode: sources.outcome.recommendation.productCode,
        ruleId,
        selectionKind: sources.outcome.recommendation.selectionKind,
      };
      return {
        ruleId,
        ruleVersion: REPORT_SCHEMA_VERSION,
        sourceArtifactId: "recommendation_mapping_v1",
        ruleKind: "recommendation",
        evaluationStage: "recommendation",
        riskIds: [],
        traceAtoms: [],
        resultChecksumSha256: sha256Hex(canonicalSerialize(payload)),
      } satisfies JsonObject;
    });
  return stable([...traced, ...recommendationRules], value => String(value.ruleId));
}

function riskBlocks(sources: ValidatedReportSources): CanonicalJsonValue[] {
  return sources.outcome.activeRisks.map((evaluated, index) => {
    const risk = riskById.get(evaluated.riskId);
    const phrase = phraseByRiskId.get(evaluated.riskId);
    if (!risk || !phrase) throw new Error(`Pinned risk content is missing for ${evaluated.riskId}`);
    const evidencePhrase = evidencePhraseByStatus.get(evaluated.evidence.status);
    if (!evidencePhrase) throw new Error(`Pinned evidence phrase is missing for ${evaluated.riskId}`);
    const consequenceId = `CONSEQ-${evaluated.riskId.replace("LEXR0-RISK-", "RISK-")}`;
    const requestedDocumentCategoryIds = stable(
      [...sources.outcome.requestedDocumentCategories, ...sources.outcome.optionalRequestedDocumentCategories]
        .filter(category => category.supportingRiskIds.includes(evaluated.riskId))
        .map(category => category.categoryId),
      value => value,
    );
    return {
      riskId: evaluated.riskId,
      phraseId: phrase.id,
      domain: risk.domain,
      title: phrase.title,
      whatIdentified: phrase.findingTemplate,
      legalConstructionDefect: phrase.legalConstructionTemplate,
      businessImportance: phrase.businessImportanceTemplate,
      level: { ...evaluated.level },
      priority: index + 1,
      activatedRuleIds: stable(
        [...evaluated.matchedRiskRuleIds, ...evaluated.appliedOverrideRuleIds],
        value => value,
      ),
      criticalOverrideApplied: evaluated.criticalOverrideApplied,
      evidence: {
        status: evaluated.evidence.status,
        statusPhraseId: evidencePhrase.id,
        questionnaireAnswerRefs: [...evaluated.evidence.questionnaireAnswerRefs],
        documentEvidence: [],
        limitation: phrase.evidenceCaveatTemplate,
      },
      legalBasisIds: [...evaluated.legalBasisIds],
      consequenceIds: [consequenceId],
      financialRiskOrientation: null,
      affectedAreas: ["operations"],
      recommendedActions: [...risk.requiredActions],
      roadmapPeriod: risk.roadmapPeriod === "immediate"
        ? "day0"
        : risk.roadmapPeriod === "30_days"
          ? "day30"
          : risk.roadmapPeriod === "60_days"
            ? "day60"
            : "day90",
      manualReviewRequired: evaluated.manualReviewRequired,
      requestedDocumentCategoryIds,
    } satisfies JsonObject;
  });
}

function legalBasisSnapshots(sources: ValidatedReportSources): CanonicalJsonValue[] {
  return sources.outcome.legalBasisIds.map(id => {
    const basis = legalBasisById.get(id);
    if (!basis) throw new Error(`Pinned legal basis is missing for ${id}`);
    return {
      legalBasisId: basis.id,
      catalogVersion: basis.objectMeta.version,
      actTitle: basis.act.title,
      articleReference: basis.article.reference,
      displayWording: basis.approvedDraftWording.short,
      officialSourceUrl: basis.officialSource.url,
      sourceCheckedAt: basis.checkedAt,
      verificationStatusAtGeneration: basis.verificationStatus,
    } satisfies JsonObject;
  });
}

function requestedDocuments(
  categories: ValidatedReportSources["outcome"]["requestedDocumentCategories"],
): CanonicalJsonValue[] {
  return categories.map((category, index) => {
    const source = documentCategoryById.get(category.categoryId);
    if (!source) throw new Error(`Pinned document category is missing for ${category.categoryId}`);
    return {
      categoryId: category.categoryId,
      title: source.title,
      priority: index + 1,
      supportingRiskIds: [...category.supportingRiskIds],
      confirmationTargetRiskIds: source.potentialConfirmationTargetRiskIds.filter(riskId =>
        category.supportingRiskIds.includes(riskId)
      ),
    } satisfies JsonObject;
  });
}

function consequences(sources: ValidatedReportSources): CanonicalJsonValue[] {
  return sources.outcome.activeRisks.map(evaluated => {
    const risk = riskById.get(evaluated.riskId);
    if (!risk) throw new Error(`Pinned risk is missing for ${evaluated.riskId}`);
    return {
      consequenceId: `CONSEQ-${evaluated.riskId.replace("LEXR0-RISK-", "RISK-")}`,
      riskIds: [evaluated.riskId],
      category: "operations",
      statement: risk.businessImpacts.join(" "),
      financialOrientation: null,
      assumptions: [],
    } satisfies JsonObject;
  });
}

function roadmap(sources: ValidatedReportSources): JsonObject {
  const result: Record<string, CanonicalJsonValue[]> = {
    day0: [],
    day30: [],
    day60: [],
    day90: [],
  };
  for (const evaluated of sources.outcome.activeRisks) {
    const risk = riskById.get(evaluated.riskId);
    if (!risk) throw new Error(`Pinned risk is missing for ${evaluated.riskId}`);
    const period = risk.roadmapPeriod === "immediate"
      ? "day0"
      : risk.roadmapPeriod === "30_days"
        ? "day30"
        : risk.roadmapPeriod === "60_days"
          ? "day60"
          : "day90";
    risk.requiredActions.forEach((action, index) => {
      result[period]!.push({
        taskId: `TASK-${evaluated.riskId.replace("LEXR0-RISK-", "RISK-")}-${index + 1}`,
        riskIds: [evaluated.riskId],
        action,
        ownerRole: null,
        completionEvidence: "Требуется документальное подтверждение выполнения действия.",
        requiresExpertReview: evaluated.manualReviewRequired,
      });
    });
  }
  return result;
}

function recommendation(sources: ValidatedReportSources): JsonObject {
  const selected = productByCode.get(sources.outcome.recommendation.productCode);
  if (!selected) throw new Error("Pinned recommendation product is missing");
  const fixedPackageOfferAllowed = !sources.outcome.escalation.required &&
    sources.outcome.recommendation.productCode !== "expert_review";
  return {
    cardinality: 1,
    productCode: sources.outcome.recommendation.productCode,
    displayName: selected.displayName,
    productKind: selected.productKind === "пакет документов и сопровождения"
      ? "document_and_support_package"
      : selected.productCode === "expert_review"
        ? "expert_review_request"
        : "document_and_remediation_package",
    mappingId: "recommendation_mapping_v1",
    mappingVersion: REPORT_SCHEMA_VERSION,
    selectionRuleIds: [...sources.outcome.recommendation.matchedRuleIds],
    rationale: reportPhraseById.get("PH-RECOMMENDATION-LEAD-V1")!,
    fixedPackageOfferAllowed,
  };
}

/**
 * Renders every v1 section that can be proven from the two immutable source rows.
 * It deliberately omits canonicalAnswers (per-answer revision/timestamp absent),
 * payment/access, credit issuance, and committed integrity rather than inventing them.
 */
export function renderReportCandidate(
  input: BuildReportSnapshotInput,
  sources: ValidatedReportSources,
): ReportCandidate {
  const activeRiskBlocks = riskBlocks(sources);
  const severityDistribution = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const risk of sources.outcome.activeRisks) severityDistribution[risk.level.severity] += 1;
  const activeRules = activatedRules(sources);
  const candidate: JsonObject = {
    schemaId: REPORT_SCHEMA_ID,
    schemaVersion: REPORT_SCHEMA_VERSION,
    identity: {
      reportId: input.identity.reportId,
      diagnosticId: sources.submission.diagnosticCaseId,
      customerAccountId: sources.submission.customerAccountId,
      reportVersion: input.identity.reportVersion,
      snapshotState: "ready",
      immutable: true,
      generatedAt: input.identity.generatedAt,
      supersedesReportId: input.identity.supersedesReportId,
      sourceReportRequestId: input.identity.sourceReportRequestId,
      idempotencyKeyHash: input.identity.idempotencyKeyHash,
    },
    checksums: {
      algorithm: "sha256",
      canonicalization: "RFC8785",
      snapshotChecksumScope: "report_object_without_checksums.snapshotPayloadSha256",
      snapshotPayloadSha256: "0".repeat(64),
      canonicalAnswersSha256: sources.submission.inputSnapshotHash,
      riskEngineOutputSha256: sources.evaluation.outcomeHash!,
      configBundleSha256: sources.evaluation.rulesetHash,
    },
    sourceVersions: sourceVersions(input),
    presentation: {
      titlePhraseId: "PH-REPORT-TITLE-V1",
      reportTitle: reportPhraseById.get("PH-REPORT-TITLE-V1")!,
      productName: "Lexy",
      reportDate: input.identity.generatedAt.slice(0, 10),
      documentStatus: "draft_preliminary",
      executiveSummary: `${REPORT_TEST_WATERMARK}. Профиль риска сформирован детерминированными правилами по immutable submission.`,
      factualInputs: [],
    },
    ...(sources.verifiedSourceBundle
      ? { canonicalAnswers: sources.verifiedSourceBundle.canonicalAnswers as unknown as CanonicalJsonValue }
      : {}),
    branchState: {
      evaluationRevision: sources.submission.submissionVersion,
      activeBranches: sources.outcome.activeBranchIds.map(branchId => {
        const branch = technicalBranch(branchId);
        const activationRuleIds = sources.outcome.traces
          .filter(trace => trace.phase === "branching")
          .map(trace => trace.ruleId);
        return {
          branchId,
          state: "active",
          questionIds: [...branch.questionIds],
          activationRuleIds,
          activatedByAnswerRefs: activationAnswerRefs(branch.activation.sourceQuestionId, sources),
        };
      }),
      inactiveBranches: [],
      activeBranchQuestionCount: sources.outcome.visibleQuestionIds.filter(id =>
        sources.outcome.activeBranchIds.some(branchId => technicalBranch(branchId).questionIds.includes(id))
      ).length,
    },
    riskProfile: {
      overallSeverity: sources.outcome.overallRiskProfile,
      aggregationMethod: "maximum_active_risk_severity",
      criticalOverridePrecedence: true,
      leadRiskIds: sources.outcome.leadRiskId ? [sources.outcome.leadRiskId] : [],
      activeRiskIds: [...sources.outcome.activeRiskIds],
      severityDistribution,
      normalizedSegmentCodes: [...sources.outcome.normalizedSegmentCodes],
      normalizedGoalCodes: [...sources.outcome.normalizedGoalCodes],
      flags: [...sources.outcome.flags],
    },
    activatedRules: activeRules,
    riskBlocks: activeRiskBlocks,
    legalBasisSnapshots: legalBasisSnapshots(sources),
    documentAssessment: {
      primaryRequestedCategories: requestedDocuments(sources.outcome.requestedDocumentCategories),
      optionalRequestedCategories: requestedDocuments(
        sources.outcome.optionalRequestedDocumentCategories,
      ),
      findings: [],
    },
    consequences: consequences(sources),
    roadmap: roadmap(sources),
    readinessAssessment: null,
    escalation: {
      required: sources.outcome.escalation.required,
      flags: sources.outcome.flags.filter(flag =>
        flag === "manual_follow_up_required" || flag === "lawyer_review_required"
      ),
      reasonRuleIds: sources.outcome.traces
        .filter(trace => trace.phase === "follow_up" || trace.phase === "escalation")
        .map(trace => trace.ruleId),
      requiredQueueCodes: [...sources.outcome.escalation.requiredQueueCodes],
      queueCode: null,
      queueEvent: null,
      status: sources.outcome.escalation.status,
      responsibleRole: null,
      slaDueAt: null,
      nextActionAt: null,
      clientSummary: sources.outcome.escalation.required
        ? "Требуется экспертная проверка; постановка в очередь этим builder не создаётся."
        : "Дополнительная экспертная эскалация правилами не определена.",
      clientCta: sources.outcome.escalation.required ? "Запросить экспертный разбор" : null,
      fixedPackageOfferAllowed: !sources.outcome.escalation.required,
      automaticReportMode: sources.outcome.escalation.required
        ? "preliminary_summary_only"
        : "full",
    },
    recommendation: recommendation(sources),
    ...(sources.verifiedSourceBundle
      ? {
          paymentAccessProvenance:
            sources.verifiedSourceBundle.paymentAccessProvenance as unknown as CanonicalJsonValue,
        }
      : {}),
    creditEntitlement: null,
    limitations: [{
      limitationId: "LIMIT-TECHNICAL-DRAFT",
      category: "technical_scope",
      statement: `${REPORT_TEST_WATERMARK}. ${reportPhraseById.get("PH-SCOPE-LIMITATION-V1")!}`,
      affectedRiskIds: [...sources.outcome.activeRiskIds],
      requiresFollowUp: true,
    }],
    rendererMetadata: {
      canonicalContentLocale: "ru-RU",
      web: {
        rendererId: input.pinnedConfiguration.reportTemplate.artifactId,
        rendererVersion: input.pinnedConfiguration.reportTemplate.version,
        renderedAt: null,
        artifactChecksumSha256: null,
      },
      pdf: {
        rendererId: "not_rendered",
        rendererVersion: input.pinnedConfiguration.reportTemplate.version,
        renderedAt: null,
        artifactId: null,
        artifactChecksumSha256: null,
      },
      parity: {
        contentSource: "same_report_snapshot",
        requiredSections: [
          "riskBlocks",
          "legalBasisSnapshots",
          "roadmap",
          "recommendation",
          "creditEntitlement",
          "limitations",
        ],
        verificationStatus: "pending",
        verifiedAt: null,
      },
    },
    ...(sources.verifiedSourceBundle
      ? {
          integrity: {
            schemaValidationStatus: "passed",
            referenceValidationStatus: "passed",
            canonicalAnswerValidationStatus: "passed",
            recommendationCardinality: 1,
            immutableWriteStatus: "committed_once",
            validationErrors: [],
          },
        }
      : {}),
  };
  const checksumTarget = JSON.parse(canonicalSerialize(candidate)) as JsonObject;
  const checksumObject = checksumTarget.checksums as JsonObject;
  delete checksumObject.snapshotPayloadSha256;
  (candidate.checksums as JsonObject).snapshotPayloadSha256 = sha256Hex(
    canonicalSerialize(checksumTarget),
  );
  return Object.freeze(candidate);
}

function technicalBranch(branchId: string) {
  const known = STATIC_BRANCHES[branchId];
  if (!known) throw new Error(`Pinned branch is missing for ${branchId}`);
  return known;
}

const STATIC_BRANCHES = Object.freeze(Object.fromEntries(
  questionnaire.branches.map(branch => [branch.id, Object.freeze({
    questionIds: Object.freeze([...branch.questionIds]),
    activation: Object.freeze({ sourceQuestionId: branch.activation.sourceQuestionId }),
  })]),
));

function activationAnswerRefs(
  questionId: string,
  sources: ValidatedReportSources,
): string[] {
  const answer = (sources.snapshotPayload.activeAnswers as Record<string, unknown>)[questionId];
  if (!answer || typeof answer !== "object") return [];
  const record = answer as { kind?: unknown; optionId?: unknown; optionIds?: unknown };
  if (record.kind === "single" && typeof record.optionId === "string") {
    return [`${questionId}:${record.optionId}`];
  }
  if (record.kind === "multi" && Array.isArray(record.optionIds)) {
    return record.optionIds.filter((value): value is string => typeof value === "string")
      .map(value => `${questionId}:${value}`);
  }
  return [];
}
