import reportSchemaRaw from "../../../shared/report/report_schema_v1.json?raw";
import {
  canonicalSerialize,
  sha256Hex,
  type CanonicalJsonValue,
} from "../questionnaire/canonicalJson";
import { validateEffectiveAnswers } from "../questionnaire/validation";
import {
  LEGAL_CORE_CONTENT_SHA256,
  TECHNICAL_LEGAL_CORE_RULESET_BUNDLE_HASH,
  technicalLegalCoreConfigBundle,
} from "../scoring/core/configBundle";
import { evaluateTechnicalLegalCore } from "../scoring/core/evaluator";
import type { TechnicalLegalCoreSuccess } from "../scoring/core/types";
import { isVerifiedReportSourceBundle } from "./sourceBundleValidator";
import {
  REPORT_DRAFT_STATUS,
  REPORT_SCHEMA_ID,
  REPORT_SCHEMA_VERSION,
  REPORT_TECHNICAL_USE,
  isReadyEvaluationStatus,
  type BuildReportSnapshotInput,
  type PinnedReportConfiguration,
  type ReportValidationClassification,
  type ReportValidationIssue,
  type ValidatedReportSources,
} from "./types";

const SHA256 = /^[a-f0-9]{64}$/;
const REPORT_SCHEMA_SHA256 =
  "903bbda9d334bb1d3c919706f45e901bab4f63680d41b557dbab7dde4f602c16";
const PHRASE_CATALOG_SHA256 =
  "e8c9313b5a4fbaf47bc2becb29ed893ce4e9f08766cb1b854a44c83ae4bfdcd6";
const TARIFF_CATALOG_SHA256 =
  "282d2eaa5d041c756f4492fdf5899ce542ac1c0732888df927b5c62c6e4a3011";
const CREDIT_POLICY_SHA256 =
  "27c83e6c6d1af323e24359c1e1d4077494f21d7929d4be95eb6c6723d1dba5e3";
const REPORT_TEMPLATE_SHA256 =
  "fc06fc224f8a4dc1b0ddaab49a4805b55c2f14f555d022eb5c2b9890f7b8953c";
const REPORT_GENERATOR_SHA256 =
  "1e104769f1d2f3a08722a8e8e063c36581fc75ce381d9442ebd35745c3250657";

export const PINNED_REPORT_CONFIGURATION: PinnedReportConfiguration =
  Object.freeze({
    technicalUse: REPORT_TECHNICAL_USE,
    legalApprovalCompleted: false,
    clientRuntimeEnabled: false,
    reportSchema: Object.freeze({
      artifactId: REPORT_SCHEMA_ID,
      version: REPORT_SCHEMA_VERSION,
      status: REPORT_DRAFT_STATUS,
      checksumSha256: REPORT_SCHEMA_SHA256,
    }),
    reportTemplate: Object.freeze({
      artifactId: "r1_web_report_template",
      version: REPORT_SCHEMA_VERSION,
      status: REPORT_DRAFT_STATUS,
      checksumSha256: REPORT_TEMPLATE_SHA256,
    }),
    generator: Object.freeze({
      artifactId: "r1_server_report_builder",
      version: REPORT_SCHEMA_VERSION,
      status: REPORT_DRAFT_STATUS,
      checksumSha256: REPORT_GENERATOR_SHA256,
    }),
    sourceArtifactHashes: Object.freeze({
      questionnaire: LEGAL_CORE_CONTENT_SHA256.questionnaire,
      riskCatalog: LEGAL_CORE_CONTENT_SHA256.riskCatalog,
      rules: LEGAL_CORE_CONTENT_SHA256.rules,
      legalBasisCatalog: LEGAL_CORE_CONTENT_SHA256.legalBasisCatalog,
      phraseCatalog: PHRASE_CATALOG_SHA256,
      recommendationMapping: LEGAL_CORE_CONTENT_SHA256.recommendationMapping,
      tariffCatalog: TARIFF_CATALOG_SHA256,
      creditPolicy: CREDIT_POLICY_SHA256,
    }),
  });

export class ReportProvenanceValidationError extends Error {
  constructor(readonly issues: readonly ReportValidationIssue[]) {
    super(issues.map(issue => `${issue.path}: ${issue.message}`).join("; "));
    this.name = "ReportProvenanceValidationError";
  }
}

function issue(
  classification: ReportValidationClassification,
  path: string,
  code: string,
  message: string
): ReportValidationIssue {
  return Object.freeze({ classification, path, code, message });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function decodeJson(value: unknown, path: string): Record<string, unknown> {
  let decoded = value;
  if (typeof value === "string") {
    try {
      decoded = JSON.parse(value) as unknown;
    } catch {
      throw new ReportProvenanceValidationError([
        issue(
          "invalid_provenance",
          path,
          "invalid_json",
          "source is not valid JSON"
        ),
      ]);
    }
  }
  if (!isPlainObject(decoded)) {
    throw new ReportProvenanceValidationError([
      issue(
        "invalid_provenance",
        path,
        "invalid_object",
        "source must be a plain object"
      ),
    ]);
  }
  return decoded;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  path: string,
  issues: ReportValidationIssue[]
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    issues.push(
      issue(
        "invalid_provenance",
        path,
        "unknown_or_missing_provenance",
        "provenance contains unknown fields or omits required fields"
      )
    );
  }
}

function sameCanonical(left: unknown, right: unknown): boolean {
  try {
    const decode = (value: unknown): unknown =>
      typeof value === "string" ? (JSON.parse(value) as unknown) : value;
    return (
      canonicalSerialize(decode(left) as CanonicalJsonValue) ===
      canonicalSerialize(decode(right) as CanonicalJsonValue)
    );
  } catch {
    return false;
  }
}

function scanForbiddenMetadata(
  value: unknown,
  path: string,
  issues: ReportValidationIssue[]
): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) =>
      scanForbiddenMetadata(child, `${path}[${index}]`, issues)
    );
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (
      /(^|_)(llm|languageModel|modelPrompt|prompt|completion|tokenUsage)(_|$)/i.test(
        key
      )
    ) {
      issues.push(
        issue(
          "forbidden_metadata",
          childPath,
          "llm_metadata_forbidden",
          "LLM metadata is forbidden in report sources"
        )
      );
    }
    scanForbiddenMetadata(child, childPath, issues);
  }
}

function validatePinnedConfiguration(
  pinned: PinnedReportConfiguration,
  issues: ReportValidationIssue[]
): void {
  if (!sameCanonical(pinned, PINNED_REPORT_CONFIGURATION)) {
    issues.push(
      issue(
        "invalid_provenance",
        "pinnedConfiguration",
        "unpinned_configuration",
        "configuration must exactly match the immutable server pin set"
      )
    );
  }
  if (
    pinned.technicalUse !== REPORT_TECHNICAL_USE ||
    pinned.legalApprovalCompleted !== false ||
    pinned.clientRuntimeEnabled !== false ||
    pinned.reportSchema.status !== REPORT_DRAFT_STATUS ||
    pinned.reportTemplate.status !== REPORT_DRAFT_STATUS ||
    pinned.generator.status !== REPORT_DRAFT_STATUS
  ) {
    issues.push(
      issue(
        "non_draft_safe_status",
        "pinnedConfiguration",
        "draft_gate_opened",
        "report configuration must remain technical/test-only and unapproved"
      )
    );
  }
  if (sha256Hex(reportSchemaRaw) !== REPORT_SCHEMA_SHA256) {
    issues.push(
      issue(
        "source_hash_mismatch",
        "pinnedConfiguration.reportSchema.checksumSha256",
        "report_schema_raw_hash_mismatch",
        "checked-in report schema no longer matches its server pin"
      )
    );
  }
}

function validateIdentity(
  input: BuildReportSnapshotInput,
  issues: ReportValidationIssue[]
): void {
  const { identity, submission, evaluation } = input;
  exactKeys(
    input as unknown as Record<string, unknown>,
    input.verifiedSourceBundle === undefined
      ? [
          "approved",
          "evaluation",
          "identity",
          "pinnedConfiguration",
          "submission",
        ]
      : [
          "approved",
          "evaluation",
          "identity",
          "pinnedConfiguration",
          "submission",
          "verifiedSourceBundle",
        ],
    "$",
    issues
  );
  exactKeys(
    identity as unknown as Record<string, unknown>,
    [
      "generationReason",
      "generatedAt",
      "idempotencyKeyHash",
      "reportId",
      "reportVersion",
      "sourceReportRequestId",
      "supersedesReportId",
    ],
    "identity",
    issues
  );
  const nonEmpty = [
    [identity.reportId, "identity.reportId"],
    [identity.sourceReportRequestId, "identity.sourceReportRequestId"],
  ] as const;
  for (const [value, path] of nonEmpty) {
    if (typeof value !== "string" || value.length === 0) {
      issues.push(
        issue(
          "invalid_provenance",
          path,
          "missing_identity",
          "identity is required"
        )
      );
    }
  }
  if (
    !Number.isSafeInteger(identity.reportVersion) ||
    identity.reportVersion < 1
  ) {
    issues.push(
      issue(
        "invalid_provenance",
        "identity.reportVersion",
        "invalid_report_version",
        "reportVersion must be a positive safe integer"
      )
    );
  }
  if (!Number.isFinite(Date.parse(identity.generatedAt))) {
    issues.push(
      issue(
        "invalid_provenance",
        "identity.generatedAt",
        "invalid_timestamp",
        "generatedAt must be an explicit ISO date-time"
      )
    );
  }
  if (identity.generationReason !== "initial_evaluation") {
    issues.push(
      issue(
        "invalid_provenance",
        "identity.generationReason",
        "invalid_generation_reason",
        "report generation reason is not allowlisted"
      )
    );
  }
  if (!SHA256.test(identity.idempotencyKeyHash)) {
    issues.push(
      issue(
        "invalid_provenance",
        "identity.idempotencyKeyHash",
        "invalid_hash",
        "idempotency key must be represented only by a SHA-256 hash"
      )
    );
  }
  if (
    submission.customerAccountId !== evaluation.customerAccountId ||
    submission.diagnosticCaseId !== evaluation.diagnosticCaseId ||
    submission.id !== evaluation.questionnaireSubmissionId ||
    evaluation.sourceOutboxEventId.length === 0 ||
    evaluation.rulesetId !== submission.rulesetId ||
    evaluation.rulesetVersion !== submission.legalCoreVersion ||
    !Number.isSafeInteger(evaluation.submittedCaseStateVersion) ||
    evaluation.submittedCaseStateVersion < 1
  ) {
    issues.push(
      issue(
        "invalid_provenance",
        "evaluation",
        "source_identity_mismatch",
        "evaluation owner, case, or submission identity does not match the submission"
      )
    );
  }
  if (input.verifiedSourceBundle !== undefined) {
    if (!isVerifiedReportSourceBundle(input.verifiedSourceBundle)) {
      issues.push(
        issue(
          "invalid_provenance",
          "verifiedSourceBundle",
          "unverified_source_bundle",
          "builder accepts only a capability produced by persisted source validation"
        )
      );
    } else if (
      input.verifiedSourceBundle.reportSnapshotId !== identity.reportId ||
      input.verifiedSourceBundle.sourceOutboxEventId !==
        evaluation.sourceOutboxEventId ||
      input.verifiedSourceBundle.questionnaireDraftId !==
        submission.questionnaireDraftId ||
      input.verifiedSourceBundle.immutableWriteEvidence.activeLeaseVersion < 1
    ) {
      issues.push(
        issue(
          "source_fence_invalid",
          "verifiedSourceBundle",
          "verified_bundle_identity_mismatch",
          "verified source capability does not match report, draft, evaluation, or lease identity"
        )
      );
    }
  }
}

function validateSourceHashes(
  input: BuildReportSnapshotInput,
  snapshot: Record<string, unknown>,
  outcome: Record<string, unknown>,
  issues: ReportValidationIssue[]
): void {
  const { submission, evaluation } = input;
  let snapshotHash = "";
  let outcomeHash = "";
  try {
    snapshotHash = sha256Hex(
      canonicalSerialize(snapshot as CanonicalJsonValue)
    );
    outcomeHash = sha256Hex(canonicalSerialize(outcome as CanonicalJsonValue));
  } catch {
    issues.push(
      issue(
        "invalid_provenance",
        "source",
        "non_canonical_source",
        "submission or evaluation contains a non-canonical JSON value"
      )
    );
    return;
  }
  if (
    snapshotHash !== submission.inputSnapshotHash ||
    evaluation.inputSnapshotHash !== submission.inputSnapshotHash
  ) {
    issues.push(
      issue(
        "source_hash_mismatch",
        "submission.inputSnapshotHash",
        "input_snapshot_hash_mismatch",
        "canonical submitted snapshot hash does not match both immutable source rows"
      )
    );
  }
  if (evaluation.outcomeHash !== outcomeHash) {
    issues.push(
      issue(
        "source_hash_mismatch",
        "evaluation.outcomeHash",
        "outcome_hash_mismatch",
        "canonical scoring outcome hash does not match the immutable evaluation row"
      )
    );
  }
  if (
    submission.rulesetBundleHash !== TECHNICAL_LEGAL_CORE_RULESET_BUNDLE_HASH ||
    evaluation.rulesetHash !== submission.rulesetBundleHash
  ) {
    issues.push(
      issue(
        "source_hash_mismatch",
        "evaluation.rulesetHash",
        "ruleset_hash_mismatch",
        "ruleset hash is not the pinned legal-core bundle used by the submission"
      )
    );
  }
}

function validateSnapshot(
  input: BuildReportSnapshotInput,
  snapshot: Record<string, unknown>,
  issues: ReportValidationIssue[]
): void {
  const { submission } = input;
  exactKeys(
    snapshot,
    [
      "activeAnswers",
      "contentHash",
      "draftRevision",
      "manualFollowUpTriggerIds",
      "releaseId",
      "version",
      "visibleQuestionIds",
      "visibleSetHash",
    ],
    "submission.inputSnapshotJson",
    issues
  );

  if (
    snapshot.releaseId !== submission.questionnaireReleaseId ||
    snapshot.releaseId !==
      technicalLegalCoreConfigBundle.questionnaire.releaseId ||
    snapshot.version !== submission.questionnaireVersion ||
    snapshot.version !== technicalLegalCoreConfigBundle.questionnaire.version ||
    snapshot.contentHash !== submission.questionnaireContentHash ||
    snapshot.contentHash !== LEGAL_CORE_CONTENT_SHA256.questionnaire ||
    submission.legalCoreReleaseId !==
      technicalLegalCoreConfigBundle.releaseId ||
    submission.legalCoreVersion !== technicalLegalCoreConfigBundle.version ||
    submission.rulesetId !== technicalLegalCoreConfigBundle.rules.rulesetId
  ) {
    issues.push(
      issue(
        "invalid_provenance",
        "submission",
        "source_version_mismatch",
        "submission artifact identities do not match the pinned legal-core release"
      )
    );
  }
  if (
    !Array.isArray(snapshot.visibleQuestionIds) ||
    snapshot.visibleQuestionIds.some(value => typeof value !== "string") ||
    new Set(snapshot.visibleQuestionIds).size !==
      snapshot.visibleQuestionIds.length ||
    sha256Hex(
      canonicalSerialize(snapshot.visibleQuestionIds as CanonicalJsonValue)
    ) !== snapshot.visibleSetHash ||
    !sameCanonical(
      snapshot.visibleQuestionIds,
      submission.visibleQuestionIds
    ) ||
    snapshot.visibleSetHash !== submission.visibleSetHash
  ) {
    issues.push(
      issue(
        "input_evaluation_inconsistent",
        "submission.visibleQuestionIds",
        "visible_set_mismatch",
        "visible question set and its hash are inconsistent"
      )
    );
  }
  if (
    !Array.isArray(snapshot.manualFollowUpTriggerIds) ||
    snapshot.manualFollowUpTriggerIds.some(
      value => typeof value !== "string"
    ) ||
    !sameCanonical(
      snapshot.manualFollowUpTriggerIds,
      submission.manualFollowUpTriggerIds
    ) ||
    submission.manualFollowUpRequired !==
      snapshot.manualFollowUpTriggerIds.length > 0
  ) {
    issues.push(
      issue(
        "input_evaluation_inconsistent",
        "submission.manualFollowUpTriggerIds",
        "follow_up_mismatch",
        "manual follow-up provenance is inconsistent"
      )
    );
  }
  if (
    !Number.isSafeInteger(snapshot.draftRevision) ||
    Number(snapshot.draftRevision) < 0
  ) {
    issues.push(
      issue(
        "invalid_provenance",
        "submission.inputSnapshotJson.draftRevision",
        "invalid_revision",
        "draft revision must be a non-negative safe integer"
      )
    );
  }
  try {
    validateEffectiveAnswers(
      technicalLegalCoreConfigBundle.questionnaire,
      snapshot.activeAnswers
    );
  } catch {
    issues.push(
      issue(
        "input_evaluation_inconsistent",
        "submission.inputSnapshotJson.activeAnswers",
        "invalid_canonical_answers",
        "persisted answers are not valid canonical questionnaire answers"
      )
    );
  }
}

function validateOutcome(
  input: BuildReportSnapshotInput,
  snapshot: Record<string, unknown>,
  outcome: Record<string, unknown>,
  issues: ReportValidationIssue[]
): boolean {
  const { evaluation } = input;
  if (
    !isReadyEvaluationStatus(evaluation) ||
    evaluation.outcomeJson === null ||
    evaluation.outcomeHash === null
  ) {
    issues.push(
      issue(
        "non_draft_safe_status",
        "evaluation.status",
        "evaluation_not_ready",
        "only completed manual-review-required technical outcomes may be reported"
      )
    );
  }
  if (
    input.approved !== false ||
    outcome.technicalUse !== REPORT_TECHNICAL_USE ||
    outcome.status !== REPORT_DRAFT_STATUS ||
    outcome.releaseId !== technicalLegalCoreConfigBundle.releaseId ||
    outcome.version !== technicalLegalCoreConfigBundle.version ||
    outcome.kind !== "evaluated"
  ) {
    issues.push(
      issue(
        "non_draft_safe_status",
        "evaluation.outcomeJson",
        "outcome_not_draft_safe",
        "outcome must be an unapproved technical/test-only evaluated result"
      )
    );
    return false;
  }
  const validation = outcome.validation;
  const recommendation = outcome.recommendation;
  if (
    !isPlainObject(validation) ||
    validation.valid !== true ||
    validation.blocksRecommendation !== false
  ) {
    issues.push(
      issue(
        "input_evaluation_inconsistent",
        "evaluation.outcomeJson.validation",
        "outcome_not_valid",
        "scoring outcome must be ready and valid"
      )
    );
  }
  if (!isPlainObject(recommendation)) {
    issues.push(
      issue(
        "recommendation_cardinality_invalid",
        "evaluation.outcomeJson.recommendation",
        "missing_recommendation",
        "ready outcome must contain exactly one recommendation object"
      )
    );
    return false;
  }
  if (
    "recommendations" in outcome ||
    "alternativeRecommendations" in outcome ||
    !Array.isArray(recommendation.matchedRuleIds) ||
    recommendation.matchedRuleIds.length < 1
  ) {
    issues.push(
      issue(
        "recommendation_cardinality_invalid",
        "evaluation.outcomeJson.recommendation",
        "recommendation_cardinality_not_one",
        "outcome must expose one and only one deterministic recommendation"
      )
    );
  }

  if (isPlainObject(snapshot.activeAnswers)) {
    try {
      const replay = evaluateTechnicalLegalCore({
        canonicalAnswers: snapshot.activeAnswers as never,
        previousVisibleQuestionIds: Array.isArray(snapshot.visibleQuestionIds)
          ? (snapshot.visibleQuestionIds as string[])
          : [],
      });
      if (!sameCanonical(replay, outcome)) {
        issues.push(
          issue(
            "input_evaluation_inconsistent",
            "evaluation.outcomeJson",
            "deterministic_replay_mismatch",
            "stored evaluation is not the deterministic replay of the submitted snapshot"
          )
        );
      }
    } catch {
      issues.push(
        issue(
          "input_evaluation_inconsistent",
          "evaluation.outcomeJson",
          "deterministic_replay_failed",
          "submitted snapshot cannot be replayed by the pinned rules engine"
        )
      );
    }
  }
  return true;
}

export function validateReportProvenance(
  input: BuildReportSnapshotInput
): ValidatedReportSources {
  const issues: ReportValidationIssue[] = [];
  validatePinnedConfiguration(input.pinnedConfiguration, issues);
  validateIdentity(input, issues);

  const snapshot = decodeJson(
    input.submission.inputSnapshotJson,
    "submission.inputSnapshotJson"
  );
  const outcome = decodeJson(
    input.evaluation.outcomeJson,
    "evaluation.outcomeJson"
  );
  scanForbiddenMetadata(snapshot, "submission.inputSnapshotJson", issues);
  scanForbiddenMetadata(outcome, "evaluation.outcomeJson", issues);
  validateSourceHashes(input, snapshot, outcome, issues);
  validateSnapshot(input, snapshot, issues);
  const success = validateOutcome(input, snapshot, outcome, issues);

  if (issues.length > 0 || !success) {
    throw new ReportProvenanceValidationError(Object.freeze(issues));
  }
  return Object.freeze({
    submission: input.submission,
    evaluation: input.evaluation,
    outcome: outcome as unknown as TechnicalLegalCoreSuccess,
    snapshotPayload: Object.freeze(snapshot),
    verifiedSourceBundle: input.verifiedSourceBundle ?? null,
  });
}
