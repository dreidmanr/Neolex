import {
  canonicalSerialize,
  sha256Hex,
  type CanonicalJsonValue,
} from "../questionnaire/canonicalJson";
import { validateReportCrossReferences } from "./crossReferenceValidator";
import {
  ReportProvenanceValidationError,
  validateReportProvenance,
} from "./provenanceValidator";
import { validateReportSchema } from "./reportSchemaValidator";
import { renderReportCandidate } from "./templateRenderer";
import type {
  BuildReportSnapshotInput,
  ReportBuildResult,
  ReportBuildValidationFailure,
  ReportCandidate,
  ReportValidationClassification,
  ReportValidationIssue,
  ValidatedReportSnapshot,
} from "./types";

const UNAVAILABLE_V1_PATHS = Object.freeze([
  "$.canonicalAnswers.answers[*].answerRevision",
  "$.canonicalAnswers.answers[*].answeredAt",
  "$.paymentAccessProvenance",
  "$.creditEntitlement issuance provenance",
  "$.integrity.immutableWriteStatus",
]);

const CLASSIFICATION_PRIORITY: readonly ReportValidationClassification[] = [
  "forbidden_metadata",
  "source_hash_mismatch",
  "source_fence_invalid",
  "answer_lineage_invalid",
  "payment_access_invalid",
  "legal_evidence_incomplete",
  "invalid_provenance",
  "recommendation_cardinality_invalid",
  "input_evaluation_inconsistent",
  "non_draft_safe_status",
  "cross_reference_invalid",
  "report_schema_source_data_unavailable",
  "schema_validation_failed",
];

function primaryClassification(
  issues: readonly ReportValidationIssue[],
): ReportValidationClassification {
  return CLASSIFICATION_PRIORITY.find(classification =>
    issues.some(issue => issue.classification === classification)
  ) ?? "schema_validation_failed";
}

function failure(
  issues: readonly ReportValidationIssue[],
  candidate: ReportCandidate | null,
  unavailableRequiredPaths: readonly string[] = [],
): ReportBuildValidationFailure {
  return Object.freeze({
    kind: "validation_failure",
    classification: primaryClassification(issues),
    retryable: false,
    candidate,
    candidateHash: candidate === null
      ? null
      : sha256Hex(canonicalSerialize(candidate as CanonicalJsonValue)),
    issues: Object.freeze([...issues]),
    unavailableRequiredPaths: Object.freeze([...unavailableRequiredPaths]),
  });
}

function unavailableIssues(): readonly ReportValidationIssue[] {
  return Object.freeze(UNAVAILABLE_V1_PATHS.map(path => Object.freeze({
    classification: "report_schema_source_data_unavailable" as const,
    path,
    code: "immutable_source_not_supplied",
    message: "report_schema_v1 requires immutable source data not present in QuestionnaireSubmission or QuestionnaireRuleEvaluation",
  })));
}

/**
 * Pure server-side builder. A successful brand is reachable only when all v1
 * source data exists and schema/provenance/reference checks pass. With the current
 * two-row R1 contract it intentionally returns a classified failure and a hashed
 * internal candidate instead of fabricating payment, answer timestamps, or writes.
 */
export function buildReportSnapshot(
  input: BuildReportSnapshotInput,
): ReportBuildResult {
  let sources;
  try {
    sources = validateReportProvenance(input);
  } catch (error) {
    if (error instanceof ReportProvenanceValidationError) {
      return failure(error.issues, null);
    }
    return failure([Object.freeze({
      classification: "invalid_provenance",
      path: "$",
      code: "provenance_validation_failed_closed",
      message: error instanceof Error ? error.message : "unknown provenance error",
    })], null);
  }

  let candidate: ReportCandidate;
  try {
    candidate = renderReportCandidate(input, sources);
  } catch (error) {
    return failure([Object.freeze({
      classification: "cross_reference_invalid",
      path: "$",
      code: "pinned_template_reference_missing",
      message: error instanceof Error ? error.message : "pinned template rendering failed",
    })], null);
  }

  const referenceIssues = validateReportCrossReferences(candidate, sources);
  const schemaIssues = validateReportSchema(candidate);
  const missingSourceIssues = sources.verifiedSourceBundle === null
    ? unavailableIssues()
    : [];
  const issues = [...referenceIssues, ...missingSourceIssues, ...schemaIssues];
  if (issues.length > 0) {
    return failure(
      issues,
      candidate,
      sources.verifiedSourceBundle === null ? UNAVAILABLE_V1_PATHS : [],
    );
  }

  const snapshot = candidate as ValidatedReportSnapshot;
  return Object.freeze({
    kind: "ready",
    snapshot,
    snapshotHash: sha256Hex(canonicalSerialize(snapshot)),
  });
}

export function canonicalReportCandidate(candidate: ReportCandidate): string {
  return canonicalSerialize(candidate as CanonicalJsonValue);
}

export { PINNED_REPORT_CONFIGURATION } from "./provenanceValidator";
export type {
  BuildReportSnapshotInput,
  ReportBuildResult,
  ReportValidationIssue,
} from "./types";
