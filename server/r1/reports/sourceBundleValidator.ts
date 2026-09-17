import {
  canonicalSerialize,
  sha256Hex,
  type CanonicalJsonValue,
} from "../questionnaire/canonicalJson";
import { TARIFF_CATALOG_VERSION } from "../billing/tariffService";
import { getDocumentRegistryForValidation } from "../legal/documentRegistry";
import { technicalQuestionnaireBundle } from "../questionnaire/configBundle";
import {
  REPORT_SCHEMA_VERSION,
  type PersistedReportSourceBundle,
  type ReportValidationClassification,
  type ReportValidationIssue,
  type VerifiedCanonicalAnswer,
  type VerifiedReportSourceBundle,
} from "./types";

const verifiedCapabilities = new WeakSet<object>();

export class ReportSourceBundleValidationError extends Error {
  constructor(readonly issues: readonly ReportValidationIssue[]) {
    super(issues.map(value => `${value.path}: ${value.message}`).join("; "));
    this.name = "ReportSourceBundleValidationError";
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

function decodeObject(value: unknown, path: string): Record<string, unknown> {
  let decoded = value;
  if (typeof value === "string") {
    try {
      decoded = JSON.parse(value) as unknown;
    } catch {
      throw new ReportSourceBundleValidationError([
        issue(
          "invalid_provenance",
          path,
          "invalid_json",
          "persisted source is not valid JSON"
        ),
      ]);
    }
  }
  if (!isPlainObject(decoded)) {
    throw new ReportSourceBundleValidationError([
      issue(
        "invalid_provenance",
        path,
        "invalid_object",
        "persisted source must be a plain object"
      ),
    ]);
  }
  return decoded;
}

function sameCanonical(left: unknown, right: unknown): boolean {
  try {
    return (
      canonicalSerialize(left as CanonicalJsonValue) ===
      canonicalSerialize(right as CanonicalJsonValue)
    );
  } catch {
    return false;
  }
}

function iso(value: Date, path: string): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new ReportSourceBundleValidationError([
      issue(
        "invalid_provenance",
        path,
        "invalid_timestamp",
        "persisted timestamp is invalid"
      ),
    ]);
  }
  return value.toISOString();
}

function validateFences(
  source: PersistedReportSourceBundle,
  snapshotPayload: Record<string, unknown>,
  issues: ReportValidationIssue[]
): void {
  const {
    reportSnapshot,
    diagnosticCase,
    submission,
    evaluation,
    sourceOutboxEvent,
    draft,
    lease,
  } = source;
  const ownedRows = [
    submission,
    evaluation,
    draft,
    source.payment,
    source.accessGrant,
  ];
  if (
    diagnosticCase.customerAccountId !== reportSnapshot.customerAccountId ||
    ownedRows.some(
      row =>
        row.customerAccountId !== reportSnapshot.customerAccountId ||
        row.diagnosticCaseId !== reportSnapshot.diagnosticCaseId
    ) ||
    diagnosticCase.id !== reportSnapshot.diagnosticCaseId ||
    reportSnapshot.questionnaireSubmissionId !== submission.id ||
    reportSnapshot.questionnaireRuleEvaluationId !== evaluation.id ||
    reportSnapshot.sourceOutboxEventId !== sourceOutboxEvent.id ||
    evaluation.questionnaireSubmissionId !== submission.id ||
    evaluation.sourceOutboxEventId !== sourceOutboxEvent.id ||
    submission.questionnaireDraftId !== draft.id
  ) {
    issues.push(
      issue(
        "source_fence_invalid",
        "$",
        "source_identity_fence_mismatch",
        "persisted report sources cross an owner, case, draft, submission, evaluation, or outbox fence"
      )
    );
  }
  if (
    reportSnapshot.status !== "processing" ||
    reportSnapshot.generationMode !== "template" ||
    reportSnapshot.payloadJson !== null ||
    reportSnapshot.payloadHash !== null ||
    reportSnapshot.contentHash !== null ||
    reportSnapshot.failureCode !== null ||
    reportSnapshot.leaseOwner !== lease.leaseOwner ||
    reportSnapshot.leaseVersion !== lease.leaseVersion ||
    reportSnapshot.leaseExpiresAt === null ||
    reportSnapshot.leaseExpiresAt.getTime() <= lease.verifiedAt.getTime()
  ) {
    issues.push(
      issue(
        "source_fence_invalid",
        "reportSnapshot",
        "inactive_report_lease",
        "source verification requires the exact active empty processing lease"
      )
    );
  }
  if (
    reportSnapshot.inputSnapshotHash !== submission.inputSnapshotHash ||
    reportSnapshot.inputSnapshotHash !== evaluation.inputSnapshotHash ||
    reportSnapshot.outcomeHash !== evaluation.outcomeHash ||
    reportSnapshot.rulesetBundleHash !== submission.rulesetBundleHash ||
    reportSnapshot.rulesetBundleHash !== evaluation.rulesetHash ||
    reportSnapshot.templateVersion !== REPORT_SCHEMA_VERSION
  ) {
    issues.push(
      issue(
        "source_hash_mismatch",
        "reportSnapshot",
        "snapshot_pin_mismatch",
        "snapshot pins differ from immutable submission or evaluation hashes"
      )
    );
  }
  if (
    evaluation.status !== "manual_review_required" ||
    evaluation.manualReviewRequired !== true ||
    evaluation.failureCode !== null ||
    evaluation.completedAt === null ||
    diagnosticCase.status !== "manual_review_required" ||
    diagnosticCase.stateVersion !== evaluation.submittedCaseStateVersion + 2
  ) {
    issues.push(
      issue(
        "source_fence_invalid",
        "evaluation",
        "terminal_evaluation_fence_mismatch",
        "evaluation and case are outside the completed technical manual-review fence"
      )
    );
  }

  let event: Record<string, unknown> = {};
  try {
    event = decodeObject(
      sourceOutboxEvent.privacySafePayload,
      "sourceOutboxEvent.privacySafePayload"
    );
  } catch (error) {
    if (error instanceof ReportSourceBundleValidationError)
      issues.push(...error.issues);
  }
  if (
    sourceOutboxEvent.aggregateType !== "questionnaire_submission" ||
    sourceOutboxEvent.aggregateId !== submission.id ||
    sourceOutboxEvent.eventType !== "questionnaire.submitted_for_scoring" ||
    sourceOutboxEvent.status !== "published" ||
    event.caseId !== submission.diagnosticCaseId ||
    event.submissionId !== submission.id ||
    event.submissionVersion !== submission.submissionVersion ||
    event.inputSnapshotHash !== submission.inputSnapshotHash ||
    event.submittedCaseStateVersion !== evaluation.submittedCaseStateVersion
  ) {
    issues.push(
      issue(
        "source_fence_invalid",
        "sourceOutboxEvent",
        "source_outbox_fence_mismatch",
        "source outbox identity or privacy-safe pins do not match the evaluation"
      )
    );
  }
  if (
    draft.status !== "submitted" ||
    draft.questionnaireReleaseId !== submission.questionnaireReleaseId ||
    draft.questionnaireVersion !== submission.questionnaireVersion ||
    draft.questionnaireContentHash !== submission.questionnaireContentHash ||
    draft.draftRevision !== snapshotPayload.draftRevision ||
    !sameCanonical(draft.visibleQuestionIds, submission.visibleQuestionIds) ||
    draft.visibleSetHash !== submission.visibleSetHash ||
    draft.manualFollowUpRequired !== submission.manualFollowUpRequired ||
    !sameCanonical(
      draft.manualFollowUpTriggerIds,
      submission.manualFollowUpTriggerIds
    ) ||
    draft.updatedAt.getTime() > submission.submittedAt.getTime()
  ) {
    issues.push(
      issue(
        "source_fence_invalid",
        "draft",
        "submitted_draft_fence_mismatch",
        "submitted draft evidence does not exactly match the immutable submission"
      )
    );
  }
}

function projectAnswers(
  source: PersistedReportSourceBundle,
  snapshotPayload: Record<string, unknown>,
  issues: ReportValidationIssue[]
): {
  answers: readonly VerifiedCanonicalAnswer[];
  revisions: Readonly<Record<string, number>>;
} {
  const activeAnswers = isPlainObject(snapshotPayload.activeAnswers)
    ? snapshotPayload.activeAnswers
    : {};
  const latest = new Map<
    string,
    PersistedReportSourceBundle["answerRevisions"][number]
  >();
  const rowKeys = new Set<string>();
  for (const row of source.answerRevisions) {
    const key = `${row.questionId}:${row.draftRevision}`;
    if (
      row.customerAccountId !== source.reportSnapshot.customerAccountId ||
      row.diagnosticCaseId !== source.reportSnapshot.diagnosticCaseId ||
      row.questionnaireDraftId !== source.draft.id ||
      !Number.isSafeInteger(row.draftRevision) ||
      row.draftRevision < 1 ||
      row.draftRevision > source.draft.draftRevision ||
      row.createdAt.getTime() > source.submission.submittedAt.getTime() ||
      rowKeys.has(key)
    ) {
      issues.push(
        issue(
          "answer_lineage_invalid",
          "answerRevisions",
          "answer_revision_outside_lineage",
          "answer revision is duplicated or outside the submitted owner/case/draft/revision/time fence"
        )
      );
      continue;
    }
    rowKeys.add(key);
    const current = latest.get(row.questionId);
    if (!current || row.draftRevision > current.draftRevision)
      latest.set(row.questionId, row);
  }

  const answerKeys = Object.keys(activeAnswers).sort();
  if (latest.size !== answerKeys.length) {
    issues.push(
      issue(
        "answer_lineage_invalid",
        "answerRevisions",
        "effective_answer_cardinality_mismatch",
        "latest immutable revisions do not exactly cover canonical active answers"
      )
    );
  }
  const answers: VerifiedCanonicalAnswer[] = [];
  const revisions: Record<string, number> = {};
  for (const questionId of answerKeys) {
    const row = latest.get(questionId);
    const snapshotValue = activeAnswers[questionId];
    let revisionValue: unknown = row?.valueJson;
    if (typeof revisionValue === "string") {
      try {
        revisionValue = JSON.parse(revisionValue) as unknown;
      } catch {
        revisionValue = undefined;
      }
    }
    if (
      !row ||
      row.answerState !== "active" ||
      row.source !== "customer" ||
      row.deactivationReasonCode !== null ||
      !sameCanonical(revisionValue, snapshotValue) ||
      !isPlainObject(snapshotValue)
    ) {
      issues.push(
        issue(
          "answer_lineage_invalid",
          `answerRevisions.${questionId}`,
          "effective_answer_revision_mismatch",
          "canonical answer is not the exact latest active immutable customer revision"
        )
      );
      continue;
    }
    const value = snapshotValue;
    const answerType = value.kind;
    const reportValue =
      answerType === "single"
        ? value.optionId
        : answerType === "multi"
          ? value.optionIds
          : answerType === "text"
            ? value.text
            : undefined;
    if (
      !["single", "multi", "text"].includes(String(answerType)) ||
      (answerType !== "multi" && typeof reportValue !== "string") ||
      (answerType === "multi" &&
        (!Array.isArray(reportValue) ||
          reportValue.some(item => typeof item !== "string")))
    ) {
      issues.push(
        issue(
          "answer_lineage_invalid",
          `answerRevisions.${questionId}`,
          "unsupported_answer_shape",
          "effective answer cannot be represented by report_schema_v1"
        )
      );
      continue;
    }
    const branchIds = technicalQuestionnaireBundle.branches
      .filter(branch => branch.questionIds.includes(questionId))
      .map(branch => branch.id)
      .sort();
    revisions[questionId] = row.draftRevision;
    answers.push(
      Object.freeze({
        questionId,
        answerType: answerType as "single" | "multi" | "text",
        value: Array.isArray(reportValue)
          ? Object.freeze([...reportValue])
          : reportValue,
        answerRevision: row.draftRevision,
        answeredAt: iso(
          row.createdAt,
          `answerRevisions.${questionId}.createdAt`
        ),
        source: "server_persisted",
        isActive: true,
        branchIds: Object.freeze(branchIds),
        deactivation: null,
      } as VerifiedCanonicalAnswer)
    );
  }
  for (const [questionId, row] of Array.from(latest.entries())) {
    if (
      !Object.prototype.hasOwnProperty.call(activeAnswers, questionId) ||
      row.answerState !== "active"
    ) {
      issues.push(
        issue(
          "answer_lineage_invalid",
          `answerRevisions.${questionId}`,
          "inactive_answer_evidence_incomplete",
          "inactive or extra answer lacks report-schema deactivation causality"
        )
      );
    }
  }
  return {
    answers: Object.freeze(answers),
    revisions: Object.freeze(revisions),
  };
}

function validatePaymentAndLegal(
  source: PersistedReportSourceBundle,
  issues: ReportValidationIssue[]
): void {
  const {
    payment,
    accessGrant,
    tariffSnapshot,
    diagnosticCase,
    submission,
    lease,
  } = source;
  if (
    payment.tariffSnapshotId !== tariffSnapshot.id ||
    accessGrant.paymentRecordId !== payment.id ||
    payment.sourceType !== "promo" ||
    payment.status !== "promo_granted" ||
    payment.chargedAmount !== 0 ||
    payment.currency !== "RUB" ||
    payment.campaignId.length === 0 ||
    tariffSnapshot.tariffCode !== payment.tariffCode ||
    tariffSnapshot.tariffCode !== diagnosticCase.serviceTier ||
    tariffSnapshot.serviceTier !== diagnosticCase.serviceTier ||
    tariffSnapshot.provenanceStatus !== "draft_test_only" ||
    tariffSnapshot.catalogVersion !== TARIFF_CATALOG_VERSION ||
    tariffSnapshot.currency !== "RUB" ||
    accessGrant.status !== "active" ||
    accessGrant.revokedAt !== null ||
    accessGrant.revocationReasonCode !== null ||
    (accessGrant.expiresAt !== null &&
      accessGrant.expiresAt.getTime() <= lease.verifiedAt.getTime()) ||
    payment.grantedAt.getTime() > submission.submittedAt.getTime() ||
    accessGrant.grantedAt.getTime() > submission.submittedAt.getTime() ||
    tariffSnapshot.createdAt.getTime() > payment.createdAt.getTime()
  ) {
    issues.push(
      issue(
        "payment_access_invalid",
        "paymentAccessProvenance",
        "invalid_promo_access_provenance",
        "promo payment, tariff snapshot, or access grant is missing, stale, revoked, expired, legacy, or cross-fenced"
      )
    );
  }

  const registry = getDocumentRegistryForValidation();
  for (const consent of source.caseConsents) {
    const document = registry.find(
      item =>
        item.documentId === consent.documentId &&
        item.documentVersion === consent.documentVersion &&
        item.consentType === consent.consentType
    );
    if (
      consent.customerAccountId !== source.reportSnapshot.customerAccountId ||
      consent.diagnosticCaseId !== source.reportSnapshot.diagnosticCaseId ||
      !document ||
      consent.contentHash !== document.contentHash ||
      consent.acceptedAt.getTime() > submission.submittedAt.getTime()
    ) {
      issues.push(
        issue(
          "legal_evidence_incomplete",
          "caseConsents",
          "invalid_draft_consent_evidence",
          "consent is outside the exact draft document, owner, case, or submission-time evidence"
        )
      );
    }
  }
  for (const required of registry.filter(document => document.required)) {
    const matches = source.caseConsents.filter(
      consent =>
        consent.documentId === required.documentId &&
        consent.documentVersion === required.documentVersion &&
        consent.contentHash === required.contentHash &&
        consent.consentType === required.consentType &&
        consent.accepted === true
    );
    if (matches.length !== 1) {
      issues.push(
        issue(
          "legal_evidence_incomplete",
          `caseConsents.${required.consentType}`,
          "required_draft_consent_missing",
          "exactly one accepted required draft consent assertion is required"
        )
      );
    }
  }
}

function paymentChecksum(source: PersistedReportSourceBundle): string {
  const payment = source.payment;
  return sha256Hex(
    canonicalSerialize({
      id: payment.id,
      customerAccountId: payment.customerAccountId,
      diagnosticCaseId: payment.diagnosticCaseId,
      tariffSnapshotId: payment.tariffSnapshotId,
      tariffCode: payment.tariffCode,
      campaignId: payment.campaignId,
      sourceType: payment.sourceType,
      status: payment.status,
      chargedAmount: payment.chargedAmount,
      currency: payment.currency,
      correlationId: payment.correlationId,
      grantedAt: iso(payment.grantedAt, "payment.grantedAt"),
      createdAt: iso(payment.createdAt, "payment.createdAt"),
    })
  );
}

export function isVerifiedReportSourceBundle(
  value: unknown
): value is VerifiedReportSourceBundle {
  return (
    typeof value === "object" &&
    value !== null &&
    verifiedCapabilities.has(value)
  );
}

/** Pure fail-closed conversion from a transactionally locked source graph to a capability. */
export function verifyPersistedReportSourceBundle(
  source: PersistedReportSourceBundle
): VerifiedReportSourceBundle {
  const issues: ReportValidationIssue[] = [];
  let snapshotPayload: Record<string, unknown> = {};
  try {
    snapshotPayload = decodeObject(
      source.submission.inputSnapshotJson,
      "submission.inputSnapshotJson"
    );
  } catch (error) {
    if (error instanceof ReportSourceBundleValidationError)
      issues.push(...error.issues);
  }
  validateFences(source, snapshotPayload, issues);
  const projected = projectAnswers(source, snapshotPayload, issues);
  validatePaymentAndLegal(source, issues);
  if (issues.length > 0)
    throw new ReportSourceBundleValidationError(Object.freeze(issues));

  const requiredConsentIds = source.caseConsents
    .filter(consent => consent.accepted && consent.consentType !== "marketing")
    .map(consent => consent.id)
    .sort();
  const bundle = Object.freeze({
    reportSnapshotId: source.reportSnapshot.id,
    sourceOutboxEventId: source.sourceOutboxEvent.id,
    questionnaireDraftId: source.draft.id,
    canonicalAnswers: Object.freeze({
      provenance: "server_canonical_answers" as const,
      questionnaireId: "questionnaire_v2" as const,
      questionnaireVersion: source.submission.questionnaireVersion,
      questionnaireChecksumSha256: source.submission.questionnaireContentHash,
      answerSetRevision: source.draft.draftRevision,
      capturedAt: iso(source.submission.submittedAt, "submission.submittedAt"),
      completeness: source.submission.manualFollowUpRequired
        ? ("manual_follow_up_required" as const)
        : ("complete" as const),
      activeAnswerCount: projected.answers.length,
      inactiveAnswerCount: 0 as const,
      answers: projected.answers,
    }),
    answerRevisionByQuestionId: projected.revisions,
    paymentAccessProvenance: Object.freeze({
      paymentRecordId: source.payment.id,
      paymentStatus: "promo_granted" as const,
      paymentRecordVersion: 1 as const,
      paymentRecordChecksumSha256: paymentChecksum(source),
      tariffSnapshot: Object.freeze({
        tariffId: source.tariffSnapshot.id,
        tariffVersion: source.tariffSnapshot.catalogVersion,
        tariffName: source.tariffSnapshot.tariffCode,
        pricingModel: "fixed_price" as const,
        displayPriceRub: null,
        selectedPriceRub: null,
        chargedAmountRub: 0 as const,
        currency: "RUB" as const,
      }),
      promoCampaignId: source.payment.campaignId,
      provider: null,
      accessGrantId: source.accessGrant.id,
      accessGrantStatusAtGeneration: "active" as const,
      accessGrantedAt: iso(
        source.accessGrant.grantedAt,
        "accessGrant.grantedAt"
      ),
      accessRevokedAt: null,
    }),
    requiredConsentIds: Object.freeze(requiredConsentIds),
    immutableWriteEvidence: Object.freeze({
      status: "processing" as const,
      generationMode: "template" as const,
      payloadWasEmpty: true as const,
      activeLeaseOwner: source.lease.leaseOwner,
      activeLeaseVersion: source.lease.leaseVersion,
    }),
  }) as unknown as VerifiedReportSourceBundle;
  verifiedCapabilities.add(bundle);
  return bundle;
}
