import legalBasisRaw from "../../../shared/legal-core/legal_basis_catalog_v1.json?raw";
import phraseCatalogRaw from "../../../shared/legal-core/approved_phrases_v1.json?raw";
import recommendationRaw from "../../../shared/legal-core/recommendation_mapping_v1.json?raw";
import riskCatalogRaw from "../../../shared/legal-core/risk_catalog_v1.json?raw";
import rulesRaw from "../../../shared/legal-core/rules_v1.json?raw";
import {
  canonicalSerialize,
  sha256Hex,
  type CanonicalJsonValue,
} from "../questionnaire/canonicalJson";
import type {
  ReportCandidate,
  ReportValidationIssue,
  ValidatedReportSources,
} from "./types";

interface Catalogs {
  readonly riskIds: ReadonlySet<string>;
  readonly phraseIds: ReadonlySet<string>;
  readonly legalBasisIds: ReadonlySet<string>;
  readonly ruleIds: ReadonlySet<string>;
  readonly productCodes: ReadonlySet<string>;
  readonly documentCategoryIds: ReadonlySet<string>;
}

const riskCatalog = JSON.parse(riskCatalogRaw) as {
  riskDefinitions: readonly { id: string }[];
};
const phraseCatalog = JSON.parse(phraseCatalogRaw) as {
  reportPhrases: readonly { id: string }[];
  evidenceStatusPhrases: readonly { id: string }[];
  riskPhrases: readonly { id: string }[];
};
const legalBasisCatalog = JSON.parse(legalBasisRaw) as {
  legalBases: readonly { id: string }[];
};
const rules = JSON.parse(rulesRaw) as {
  consistencyRules: readonly { id: string }[];
  branchRules: readonly { id: string }[];
  riskRules: readonly { id: string }[];
  criticalOverrideRules: readonly { id: string }[];
  followUpRules: readonly { id: string }[];
  escalationRules: readonly { id: string }[];
  requestedDocumentCategoryRules: readonly { id: string }[];
  requestedDocumentCategories: readonly { id: string }[];
};
const mapping = JSON.parse(recommendationRaw) as {
  productCatalog: readonly { productCode: string }[];
  selectionContract: {
    fallbackRuleId: string;
    stopFactors: readonly { stopFactorId: string }[];
    segmentBoosts: readonly { ruleId: string }[];
    goalBoosts: readonly { ruleId: string }[];
  };
};

const catalogs: Catalogs = Object.freeze({
  riskIds: new Set(riskCatalog.riskDefinitions.map(value => value.id)),
  phraseIds: new Set([
    ...phraseCatalog.reportPhrases,
    ...phraseCatalog.evidenceStatusPhrases,
    ...phraseCatalog.riskPhrases,
  ].map(value => value.id)),
  legalBasisIds: new Set(legalBasisCatalog.legalBases.map(value => value.id)),
  ruleIds: new Set([
    ...rules.consistencyRules,
    ...rules.branchRules,
    ...rules.riskRules,
    ...rules.criticalOverrideRules,
    ...rules.followUpRules,
    ...rules.escalationRules,
    ...rules.requestedDocumentCategoryRules,
  ].map(value => value.id).concat([
    mapping.selectionContract.fallbackRuleId,
    ...mapping.selectionContract.stopFactors.map(value => value.stopFactorId),
    ...mapping.selectionContract.segmentBoosts.map(value => value.ruleId),
    ...mapping.selectionContract.goalBoosts.map(value => value.ruleId),
  ])),
  productCodes: new Set(mapping.productCatalog.map(value => value.productCode)),
  documentCategoryIds: new Set(rules.requestedDocumentCategories.map(value => value.id)),
});

function issue(path: string, code: string, message: string): ReportValidationIssue {
  return Object.freeze({ classification: "cross_reference_invalid", path, code, message });
}

function object(value: CanonicalJsonValue | undefined): Record<string, CanonicalJsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, CanonicalJsonValue>
    : {};
}

function array(value: CanonicalJsonValue | undefined): readonly CanonicalJsonValue[] {
  return Array.isArray(value) ? value : [];
}

function strings(value: CanonicalJsonValue | undefined): readonly string[] {
  return array(value).filter((item): item is string => typeof item === "string");
}

function assertKnown(
  values: readonly string[],
  known: ReadonlySet<string>,
  path: string,
  issues: ReportValidationIssue[],
): void {
  for (const value of values) {
    if (!known.has(value)) {
      issues.push(issue(path, "unknown_reference", `unknown pinned reference ${value}`));
    }
  }
}

function checksumIssue(candidate: ReportCandidate): ReportValidationIssue | null {
  const clone = JSON.parse(canonicalSerialize(candidate)) as Record<string, CanonicalJsonValue>;
  const checksums = object(clone.checksums);
  const actual = checksums.snapshotPayloadSha256;
  delete checksums.snapshotPayloadSha256;
  const expected = sha256Hex(canonicalSerialize(clone));
  return actual === expected
    ? null
    : issue(
        "$.checksums.snapshotPayloadSha256",
        "snapshot_checksum_mismatch",
        "candidate checksum does not cover the canonical report object under the declared scope",
      );
}

/** Validates referential integrity without consulting DB, UI, network, or mutable state. */
export function validateReportCrossReferences(
  candidate: ReportCandidate,
  sources: ValidatedReportSources,
): readonly ReportValidationIssue[] {
  const issues: ReportValidationIssue[] = [];
  const checksum = checksumIssue(candidate);
  if (checksum) issues.push(checksum);

  const riskProfile = object(candidate.riskProfile);
  const profileRiskIds = strings(riskProfile.activeRiskIds);
  assertKnown(profileRiskIds, catalogs.riskIds, "$.riskProfile.activeRiskIds", issues);
  if (canonicalSerialize(profileRiskIds) !== canonicalSerialize(sources.outcome.activeRiskIds)) {
    issues.push(issue(
      "$.riskProfile.activeRiskIds",
      "outcome_reference_mismatch",
      "report risk IDs differ from the validated scoring outcome",
    ));
  }

  const activatedRules = array(candidate.activatedRules).map(object);
  const activatedRuleIds = activatedRules
    .map(value => value.ruleId)
    .filter((value): value is string => typeof value === "string");
  assertKnown(activatedRuleIds, catalogs.ruleIds, "$.activatedRules", issues);
  for (let index = 0; index < activatedRules.length; index += 1) {
    const rule = activatedRules[index]!;
    assertKnown(strings(rule.riskIds), catalogs.riskIds, `$.activatedRules[${index}].riskIds`, issues);
  }

  const riskBlocks = array(candidate.riskBlocks).map(object);
  for (let index = 0; index < riskBlocks.length; index += 1) {
    const risk = riskBlocks[index]!;
    const riskId = typeof risk.riskId === "string" ? risk.riskId : "";
    assertKnown([riskId], catalogs.riskIds, `$.riskBlocks[${index}].riskId`, issues);
    if (typeof risk.phraseId === "string") {
      assertKnown([risk.phraseId], catalogs.phraseIds, `$.riskBlocks[${index}].phraseId`, issues);
    }
    assertKnown(strings(risk.activatedRuleIds), new Set(activatedRuleIds), `$.riskBlocks[${index}].activatedRuleIds`, issues);
    assertKnown(strings(risk.legalBasisIds), catalogs.legalBasisIds, `$.riskBlocks[${index}].legalBasisIds`, issues);
    assertKnown(strings(risk.requestedDocumentCategoryIds), catalogs.documentCategoryIds, `$.riskBlocks[${index}].requestedDocumentCategoryIds`, issues);
  }

  const basisSnapshots = array(candidate.legalBasisSnapshots).map(object);
  const basisIds = basisSnapshots
    .map(value => value.legalBasisId)
    .filter((value): value is string => typeof value === "string");
  assertKnown(basisIds, catalogs.legalBasisIds, "$.legalBasisSnapshots", issues);
  if (canonicalSerialize([...basisIds].sort()) !== canonicalSerialize([...sources.outcome.legalBasisIds].sort())) {
    issues.push(issue(
      "$.legalBasisSnapshots",
      "legal_basis_set_mismatch",
      "legal basis snapshots differ from the validated outcome",
    ));
  }

  const recommendation = object(candidate.recommendation);
  if (
    recommendation.cardinality !== 1 ||
    typeof recommendation.productCode !== "string" ||
    !catalogs.productCodes.has(recommendation.productCode) ||
    recommendation.productCode !== sources.outcome.recommendation.productCode
  ) {
    issues.push(Object.freeze({
      classification: "recommendation_cardinality_invalid",
      path: "$.recommendation",
      code: "recommendation_mismatch",
      message: "report must contain exactly the one recommendation selected by scoring",
    }));
  }
  assertKnown(strings(recommendation.selectionRuleIds), catalogs.ruleIds, "$.recommendation.selectionRuleIds", issues);

  const verified = sources.verifiedSourceBundle;
  if (
    "paymentAccessProvenance" in candidate &&
    (!verified ||
      canonicalSerialize(candidate.paymentAccessProvenance!) !==
        canonicalSerialize(verified.paymentAccessProvenance as unknown as CanonicalJsonValue))
  ) {
    issues.push(issue(
      "$.paymentAccessProvenance",
      "fabricated_operational_reference",
      "payment/access provenance must exactly equal the verified persisted source capability",
    ));
  }
  if (candidate.creditEntitlement !== null) {
    issues.push(issue(
      "$.creditEntitlement",
      "fabricated_operational_reference",
      "credit entitlement requires a separately persisted issuance source",
    ));
  }
  const escalation = object(candidate.escalation);
  if (
    escalation.queueCode !== null ||
    escalation.queueEvent !== null ||
    escalation.responsibleRole !== null ||
    escalation.slaDueAt !== null ||
    escalation.nextActionAt !== null
  ) {
    issues.push(issue(
      "$.escalation",
      "fabricated_queue_reference",
      "queue assignment, event, role, and dates cannot be inferred from scoring",
    ));
  }
  return Object.freeze(issues);
}
