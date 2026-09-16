import type {
  AccessGrant,
  CaseConsent,
  DiagnosticCase,
  OutboxEvent,
  PaymentRecord,
  QuestionnaireAnswerRevision,
  QuestionnaireDraft,
  QuestionnaireRuleEvaluation,
  QuestionnaireSubmission,
  ReportSnapshot as PersistedReportSnapshot,
  TariffSnapshot,
} from "../../../drizzle/schema";
import type { CanonicalJsonValue } from "../questionnaire/canonicalJson";
import type { TechnicalLegalCoreSuccess } from "../scoring/core/types";

export const REPORT_SCHEMA_ID = "report_schema_v1" as const;
export const REPORT_SCHEMA_VERSION = "1.0.0-draft.1" as const;
export const REPORT_TECHNICAL_USE = "technical_test_only" as const;
export const REPORT_DRAFT_STATUS = "draft_pending_legal_approval" as const;
export const REPORT_TEST_WATERMARK =
  "ТЕХНИЧЕСКИЙ ТЕСТОВЫЙ ЧЕРНОВИК — НЕ ДЛЯ КЛИЕНТОВ И НЕ ЮРИДИЧЕСКОЕ ЗАКЛЮЧЕНИЕ" as const;

export type ImmutableSubmissionSource = Readonly<QuestionnaireSubmission>;
export type ImmutableEvaluationSource = Readonly<QuestionnaireRuleEvaluation>;

export interface ReportSourceIdentity {
  readonly reportId: string;
  readonly reportVersion: number;
  readonly generationReason: "initial_evaluation";
  readonly generatedAt: string;
  readonly sourceReportRequestId: string;
  readonly idempotencyKeyHash: string;
  readonly supersedesReportId: string | null;
}

export interface PinnedArtifactRef {
  readonly artifactId: string;
  readonly version: string;
  readonly status: typeof REPORT_DRAFT_STATUS;
  readonly checksumSha256: string;
}

export interface PinnedReportConfiguration {
  readonly technicalUse: typeof REPORT_TECHNICAL_USE;
  readonly legalApprovalCompleted: false;
  readonly clientRuntimeEnabled: false;
  readonly reportSchema: PinnedArtifactRef;
  readonly reportTemplate: PinnedArtifactRef;
  readonly generator: PinnedArtifactRef;
  readonly sourceArtifactHashes: Readonly<{
    questionnaire: string;
    riskCatalog: string;
    rules: string;
    legalBasisCatalog: string;
    phraseCatalog: string;
    recommendationMapping: string;
    tariffCatalog: string;
    creditPolicy: string;
  }>;
}

export interface BuildReportSnapshotInput {
  readonly identity: ReportSourceIdentity;
  readonly submission: ImmutableSubmissionSource;
  readonly evaluation: ImmutableEvaluationSource;
  readonly approved: false;
  readonly pinnedConfiguration: PinnedReportConfiguration;
  readonly verifiedSourceBundle?: VerifiedReportSourceBundle;
}

export type ReportValidationClassification =
  | "invalid_provenance"
  | "source_hash_mismatch"
  | "input_evaluation_inconsistent"
  | "recommendation_cardinality_invalid"
  | "non_draft_safe_status"
  | "forbidden_metadata"
  | "schema_validation_failed"
  | "cross_reference_invalid"
  | "answer_lineage_invalid"
  | "payment_access_invalid"
  | "legal_evidence_incomplete"
  | "source_fence_invalid"
  | "report_schema_source_data_unavailable";

export interface ReportValidationIssue {
  readonly classification: ReportValidationClassification;
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

/** A deterministic, server-internal partial v1 object. It is never client-safe. */
export type ReportCandidate = Readonly<Record<string, CanonicalJsonValue>>;

export interface ReportBuildValidationFailure {
  readonly kind: "validation_failure";
  readonly classification: ReportValidationClassification;
  readonly retryable: false;
  readonly candidate: ReportCandidate | null;
  readonly candidateHash: string | null;
  readonly issues: readonly ReportValidationIssue[];
  readonly unavailableRequiredPaths: readonly string[];
}

export type ReportSnapshot = Readonly<Record<string, CanonicalJsonValue>>;

declare const validatedReportSnapshotBrand: unique symbol;
export type ValidatedReportSnapshot = ReportSnapshot & {
  readonly [validatedReportSnapshotBrand]: true;
};

export interface ReportBuildSuccess {
  readonly kind: "ready";
  readonly snapshot: ValidatedReportSnapshot;
  readonly snapshotHash: string;
}

export type ReportBuildResult = ReportBuildSuccess | ReportBuildValidationFailure;

export interface ValidatedReportSources {
  readonly submission: ImmutableSubmissionSource;
  readonly evaluation: ImmutableEvaluationSource;
  readonly outcome: TechnicalLegalCoreSuccess;
  readonly snapshotPayload: Readonly<Record<string, unknown>>;
  readonly verifiedSourceBundle: VerifiedReportSourceBundle | null;
}

export interface PersistedReportSourceBundle {
  readonly reportSnapshot: Readonly<PersistedReportSnapshot>;
  readonly diagnosticCase: Readonly<DiagnosticCase>;
  readonly submission: ImmutableSubmissionSource;
  readonly evaluation: ImmutableEvaluationSource;
  readonly sourceOutboxEvent: Readonly<OutboxEvent>;
  readonly draft: Readonly<QuestionnaireDraft>;
  readonly answerRevisions: readonly Readonly<QuestionnaireAnswerRevision>[];
  readonly payment: Readonly<PaymentRecord>;
  readonly accessGrant: Readonly<AccessGrant>;
  readonly tariffSnapshot: Readonly<TariffSnapshot>;
  readonly caseConsents: readonly Readonly<CaseConsent>[];
  readonly lease: Readonly<{
    leaseOwner: string;
    leaseVersion: number;
    verifiedAt: Date;
  }>;
}

export interface VerifiedCanonicalAnswer {
  readonly questionId: string;
  readonly answerType: "single" | "multi" | "text";
  readonly value: string | readonly string[];
  readonly answerRevision: number;
  readonly answeredAt: string;
  readonly source: "server_persisted";
  readonly isActive: true;
  readonly branchIds: readonly string[];
  readonly deactivation: null;
}

export interface VerifiedCanonicalAnswers {
  readonly provenance: "server_canonical_answers";
  readonly questionnaireId: "questionnaire_v2";
  readonly questionnaireVersion: string;
  readonly questionnaireChecksumSha256: string;
  readonly answerSetRevision: number;
  readonly capturedAt: string;
  readonly completeness: "complete" | "manual_follow_up_required";
  readonly activeAnswerCount: number;
  readonly inactiveAnswerCount: 0;
  readonly answers: readonly VerifiedCanonicalAnswer[];
}

export interface VerifiedPaymentAccessProvenance {
  readonly paymentRecordId: string;
  readonly paymentStatus: "promo_granted";
  readonly paymentRecordVersion: 1;
  readonly paymentRecordChecksumSha256: string;
  readonly tariffSnapshot: Readonly<{
    tariffId: string;
    tariffVersion: string;
    tariffName: string;
    pricingModel: "fixed_price";
    displayPriceRub: null;
    selectedPriceRub: null;
    chargedAmountRub: 0;
    currency: "RUB";
  }>;
  readonly promoCampaignId: string;
  readonly provider: null;
  readonly accessGrantId: string;
  readonly accessGrantStatusAtGeneration: "active";
  readonly accessGrantedAt: string;
  readonly accessRevokedAt: null;
}

declare const verifiedReportSourceBundleBrand: unique symbol;
export interface VerifiedReportSourceBundle {
  readonly [verifiedReportSourceBundleBrand]: true;
  readonly reportSnapshotId: string;
  readonly sourceOutboxEventId: string;
  readonly questionnaireDraftId: string;
  readonly canonicalAnswers: VerifiedCanonicalAnswers;
  readonly answerRevisionByQuestionId: Readonly<Record<string, number>>;
  readonly paymentAccessProvenance: VerifiedPaymentAccessProvenance;
  readonly requiredConsentIds: readonly string[];
  readonly immutableWriteEvidence: Readonly<{
    status: "processing";
    generationMode: "template";
    payloadWasEmpty: true;
    activeLeaseOwner: string;
    activeLeaseVersion: number;
  }>;
}

export interface ReportViewModel {
  readonly reportId: string;
  readonly reportVersion: number;
  readonly generatedAt: string;
  readonly watermark: typeof REPORT_TEST_WATERMARK;
  readonly documentStatus: "draft_preliminary" | "superseded_snapshot";
  readonly title: string;
  readonly summary: string;
  readonly overallSeverity: "low" | "medium" | "high" | "critical";
  readonly risks: readonly Readonly<{
    riskId: string;
    title: string;
    severity: "low" | "medium" | "high" | "critical";
    evidenceStatus:
      | "questionnaire_based"
      | "document_confirmed"
      | "not_confirmed_by_document"
      | "additional_document_required"
      | "manual_review_required";
    manualReviewRequired: boolean;
  }>[];
  readonly legalBases: readonly Readonly<{
    legalBasisId: string;
    actTitle: string;
    articleReference: string;
    displayWording: string;
    verificationStatus: "draft_pending_legal_review" | "approved" | "superseded";
  }>[];
  readonly roadmap: Readonly<{
    day0: readonly Readonly<{
      action: string;
      completionEvidence: string;
      requiresExpertReview: boolean;
    }>[];
    day30: readonly Readonly<{
      action: string;
      completionEvidence: string;
      requiresExpertReview: boolean;
    }>[];
    day60: readonly Readonly<{
      action: string;
      completionEvidence: string;
      requiresExpertReview: boolean;
    }>[];
    day90: readonly Readonly<{
      action: string;
      completionEvidence: string;
      requiresExpertReview: boolean;
    }>[];
  }>;
  readonly recommendation: Readonly<{
    productCode:
      | "start_product"
      | "safe_sales"
      | "rights_and_ip"
      | "data_and_infrastructure"
      | "enterprise_readiness"
      | "expert_review";
    displayName: string;
    fixedPackageOfferAllowed: boolean;
  }>;
  readonly escalation: Readonly<{
    required: boolean;
    status: "not_required" | "required_not_routed";
    clientSummary: string;
    clientCta: string | null;
  }>;
  readonly limitations: readonly Readonly<{
    category: string;
    statement: string;
    requiresFollowUp: boolean;
  }>[];
  readonly credit: Readonly<{
    status: "available" | "expired" | "revoked";
    amountRub: 6900;
    currency: "RUB";
    expiresAt: string;
    businessTimeZone: "Europe/Moscow";
  }> | null;
}

export function isReadyEvaluationStatus(
  evaluation: ImmutableEvaluationSource,
): boolean {
  return (evaluation.status === "succeeded" ||
      evaluation.status === "manual_review_required") &&
    evaluation.manualReviewRequired ===
      (evaluation.status === "manual_review_required") &&
    evaluation.failureCode === null &&
    evaluation.completedAt !== null;
}
