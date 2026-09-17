import type {
  QuestionnaireRuleEvaluation,
  QuestionnaireSubmission,
} from "../../../drizzle/schema";
import cleanFixture from "../../../fixtures/legal-core/v1/01-clean-b2b-saas.json";
import {
  canonicalSerialize,
  sha256Hex,
  type CanonicalJsonValue,
} from "../questionnaire/canonicalJson";
import { validateR1Profile } from "../scoring/core/r1ProfileValidator";
import {
  TECHNICAL_LEGAL_CORE_RULESET_BUNDLE_HASH,
  technicalLegalCoreConfigBundle,
} from "../scoring/core/configBundle";
import { evaluateTechnicalLegalCore } from "../scoring/core/evaluator";
import type { TechnicalLegalCoreSuccess } from "../scoring/core/types";
import { deriveReportViewModel } from "./reportViewModel";
import {
  PINNED_REPORT_CONFIGURATION,
  buildReportSnapshot,
  canonicalReportCandidate,
} from "./reportSnapshotBuilder";
import { validateReportSchema } from "./reportSchemaValidator";
import type {
  BuildReportSnapshotInput,
  ReportCandidate,
  ValidatedReportSnapshot,
} from "./types";
import { REPORT_TEST_WATERMARK } from "./types";
import { describe, expect, it } from "vitest";

const NOW = new Date("2026-09-14T12:00:00.000Z");

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sourceInput(): BuildReportSnapshotInput {
  const validated = validateR1Profile(
    technicalLegalCoreConfigBundle,
    cleanFixture.canonicalAnswers,
  );
  if (!validated.valid) throw new Error("fixture must be valid");
  const profile = validated.profile;
  const snapshot = {
    activeAnswers: profile.activeAnswers,
    contentHash: technicalLegalCoreConfigBundle.questionnaire.contentHash,
    draftRevision: 7,
    manualFollowUpTriggerIds: profile.manualFollowUpTriggerIds,
    releaseId: technicalLegalCoreConfigBundle.questionnaire.releaseId,
    version: technicalLegalCoreConfigBundle.questionnaire.version,
    visibleQuestionIds: profile.visibleQuestionIds,
    visibleSetHash: sha256Hex(canonicalSerialize(profile.visibleQuestionIds)),
  } satisfies CanonicalJsonValue;
  const outcome = evaluateTechnicalLegalCore({
    canonicalAnswers: profile.activeAnswers,
    previousVisibleQuestionIds: profile.visibleQuestionIds,
  });
  if (outcome.kind !== "evaluated") throw new Error("fixture must evaluate");
  const snapshotHash = sha256Hex(canonicalSerialize(snapshot));
  const outcomeJson = JSON.parse(canonicalSerialize(outcome as unknown as CanonicalJsonValue)) as CanonicalJsonValue;
  const outcomeHash = sha256Hex(canonicalSerialize(outcomeJson));
  const submission: QuestionnaireSubmission = {
    id: "submission_report_1",
    customerAccountId: "account_report_1",
    diagnosticCaseId: "case_report_1",
    questionnaireDraftId: "draft_report_1",
    submissionVersion: 1,
    questionnaireReleaseId: technicalLegalCoreConfigBundle.questionnaire.releaseId,
    questionnaireVersion: technicalLegalCoreConfigBundle.questionnaire.version,
    questionnaireContentHash: technicalLegalCoreConfigBundle.questionnaire.contentHash,
    legalCoreReleaseId: technicalLegalCoreConfigBundle.releaseId,
    legalCoreVersion: technicalLegalCoreConfigBundle.version,
    rulesetId: technicalLegalCoreConfigBundle.rules.rulesetId,
    rulesetBundleHash: TECHNICAL_LEGAL_CORE_RULESET_BUNDLE_HASH,
    visibleQuestionIds: profile.visibleQuestionIds,
    visibleSetHash: snapshot.visibleSetHash,
    manualFollowUpRequired: profile.manualFollowUpTriggerIds.length > 0,
    manualFollowUpTriggerIds: profile.manualFollowUpTriggerIds,
    inputSnapshotJson: snapshot,
    inputSnapshotHash: snapshotHash,
    submittedAt: NOW,
    createdAt: NOW,
  };
  const evaluation: QuestionnaireRuleEvaluation = {
    id: "evaluation_report_1",
    customerAccountId: submission.customerAccountId,
    diagnosticCaseId: submission.diagnosticCaseId,
    questionnaireSubmissionId: submission.id,
    sourceOutboxEventId: "outbox_report_1",
    submittedCaseStateVersion: 4,
    rulesetId: submission.rulesetId,
    rulesetVersion: submission.legalCoreVersion,
    rulesetHash: submission.rulesetBundleHash,
    inputSnapshotHash: submission.inputSnapshotHash,
    status: "manual_review_required",
    outcomeJson,
    outcomeHash,
    manualReviewRequired: true,
    failureCode: null,
    startedAt: NOW,
    completedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  };
  return {
    identity: {
      generationReason: "initial_evaluation",
      reportId: "report_1",
      reportVersion: 1,
      generatedAt: NOW.toISOString(),
      sourceReportRequestId: "report_request_1",
      idempotencyKeyHash: sha256Hex("report_request_1"),
      supersedesReportId: null,
    },
    submission,
    evaluation,
    approved: false,
    pinnedConfiguration: PINNED_REPORT_CONFIGURATION,
  };
}

function failureCandidate(): { input: BuildReportSnapshotInput; candidate: ReportCandidate } {
  const input = sourceInput();
  const result = buildReportSnapshot(input);
  expect(result.kind).toBe("validation_failure");
  if (result.kind !== "validation_failure" || !result.candidate) {
    throw new Error("expected classified schema-source failure with a candidate");
  }
  return { input, candidate: result.candidate };
}

function schemaValidProjectionFixture(candidate: ReportCandidate): ValidatedReportSnapshot {
  const full = clone(candidate) as Record<string, CanonicalJsonValue>;
  const identity = full.identity as Record<string, CanonicalJsonValue>;
  const checksums = full.checksums as Record<string, CanonicalJsonValue>;
  full.canonicalAnswers = {
    provenance: "server_canonical_answers",
    questionnaireId: "questionnaire_v2",
    questionnaireVersion: "1.0.0-draft.1",
    questionnaireChecksumSha256: PINNED_REPORT_CONFIGURATION.sourceArtifactHashes.questionnaire,
    answerSetRevision: 1,
    capturedAt: NOW.toISOString(),
    completeness: "complete",
    activeAnswerCount: 0,
    inactiveAnswerCount: 0,
    answers: [],
  };
  full.paymentAccessProvenance = {
    paymentRecordId: "fixture_payment",
    paymentStatus: "promo_granted",
    paymentRecordVersion: 1,
    paymentRecordChecksumSha256: sha256Hex("fixture_payment"),
    tariffSnapshot: {
      tariffId: "fixture_tariff",
      tariffVersion: "1",
      tariffName: "Fixture only",
      pricingModel: "fixed_price",
      displayPriceRub: 0,
      selectedPriceRub: 0,
      chargedAmountRub: 0,
      currency: "RUB",
    },
    promoCampaignId: null,
    provider: null,
    accessGrantId: "fixture_access",
    accessGrantStatusAtGeneration: "active",
    accessGrantedAt: NOW.toISOString(),
    accessRevokedAt: null,
  };
  full.integrity = {
    schemaValidationStatus: "passed",
    referenceValidationStatus: "passed",
    canonicalAnswerValidationStatus: "passed",
    recommendationCardinality: 1,
    immutableWriteStatus: "committed_once",
    validationErrors: [],
  };
  delete checksums.snapshotPayloadSha256;
  checksums.snapshotPayloadSha256 = sha256Hex(canonicalSerialize(full));
  void identity;
  expect(validateReportSchema(full)).toEqual([]);
  return full as ValidatedReportSnapshot;
}

describe("R1 report snapshot foundation", () => {
  it("replays deterministically and produces the same canonical candidate hash", () => {
    const input = sourceInput();
    const first = buildReportSnapshot(input);
    const second = buildReportSnapshot(clone(input));
    expect(first.kind).toBe("validation_failure");
    expect(second.kind).toBe("validation_failure");
    if (first.kind !== "validation_failure" || second.kind !== "validation_failure") return;
    expect(first.classification).toBe("report_schema_source_data_unavailable");
    expect(second.classification).toBe(first.classification);
    expect(second.candidateHash).toBe(first.candidateHash);
    expect(canonicalReportCandidate(second.candidate!)).toBe(
      canonicalReportCandidate(first.candidate!),
    );
    expect(first.unavailableRequiredPaths).toContain("$.paymentAccessProvenance");
  });

  it("rejects source hash mismatch before rendering a candidate", () => {
    const input = sourceInput();
    const result = buildReportSnapshot({
      ...input,
      evaluation: { ...input.evaluation, outcomeHash: "f".repeat(64) },
    });
    expect(result).toMatchObject({
      kind: "validation_failure",
      classification: "source_hash_mismatch",
      candidate: null,
    });
  });

  it("rejects invalid provenance and permits both terminal technical evaluation states", () => {
    const input = sourceInput();
    const snapshot = clone(input.submission.inputSnapshotJson) as Record<string, unknown>;
    snapshot.unknownProvenance = "not allowed";
    const invalidSnapshotHash = sha256Hex(canonicalSerialize(snapshot as CanonicalJsonValue));
    const invalid = buildReportSnapshot({
      ...input,
      submission: {
        ...input.submission,
        inputSnapshotJson: snapshot,
        inputSnapshotHash: invalidSnapshotHash,
      },
      evaluation: { ...input.evaluation, inputSnapshotHash: invalidSnapshotHash },
    });
    expect(invalid).toMatchObject({
      kind: "validation_failure",
      classification: "invalid_provenance",
    });

    const succeededWithoutVerifiedBundle = buildReportSnapshot({
      ...input,
      evaluation: {
        ...input.evaluation,
        status: "succeeded",
        manualReviewRequired: false,
      },
    });
    expect(succeededWithoutVerifiedBundle).toMatchObject({
      kind: "validation_failure",
      classification: "report_schema_source_data_unavailable",
    });
  });

  it("rejects zero/multiple recommendation shapes fail-closed", () => {
    const input = sourceInput();
    const outcome = clone(input.evaluation.outcomeJson) as Record<string, CanonicalJsonValue>;
    delete outcome.recommendation;
    outcome.recommendations = [];
    const outcomeHash = sha256Hex(canonicalSerialize(outcome));
    const result = buildReportSnapshot({
      ...input,
      evaluation: { ...input.evaluation, outcomeJson: outcome, outcomeHash },
    });
    expect(result).toMatchObject({
      kind: "validation_failure",
      classification: "recommendation_cardinality_invalid",
    });
  });

  it("projects a minimal watermarked view and never exposes answers or operational references", () => {
    const { candidate } = failureCandidate();
    const snapshot = schemaValidProjectionFixture(candidate);
    const view = deriveReportViewModel(snapshot);
    const serialized = JSON.stringify(view);
    expect(view.watermark).toBe(REPORT_TEST_WATERMARK);
    expect(view.recommendation.productCode).toBe("start_product");
    expect(Object.keys(view)).toEqual([
      "reportId",
      "reportVersion",
      "generatedAt",
      "watermark",
      "documentStatus",
      "title",
      "summary",
      "overallSeverity",
      "risks",
      "legalBases",
      "roadmap",
      "recommendation",
      "escalation",
      "limitations",
      "credit",
    ]);
    expect(serialized).not.toContain("canonicalAnswers");
    expect(serialized).not.toContain("activeAnswers");
    expect(serialized).not.toContain("paymentRecordId");
    expect(serialized).not.toContain("accessGrantId");
    expect(serialized).not.toContain("sourceOutboxEventId");
    expect(serialized).not.toContain("officialSourceUrl");
    expect(serialized).not.toContain("shareUrl");
    expect(serialized).not.toContain("storage");
    expect(serialized).not.toContain("Эталонный цифровой продукт");
  });

  it("keeps report production modules free of network, LLM, mutable client, and legacy dependencies", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const directory = path.resolve(process.cwd(), "server/r1/reports");
    const source = fs.readdirSync(directory)
      .filter(file => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .map(file => fs.readFileSync(path.join(directory, file), "utf8"))
      .join("\n");
    expect(source).not.toMatch(/\b(fetch|XMLHttpRequest|invokeLLM|Math\.random|Date\.now)\s*\(/);
    expect(source).not.toMatch(/paid_reports|legacy scoring|client\/src|from ["'][^"']*react/i);
  });
});
