import { validateReportSchema } from "./reportSchemaValidator";
import {
  REPORT_TEST_WATERMARK,
  type ReportViewModel,
  type ValidatedReportSnapshot,
} from "./types";

function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${path} must be boolean`);
  return value;
}

/**
 * Explicit allowlist projection. Raw answers, account/payment/provider/queue IDs,
 * document locators, hashes, storage keys, and share URLs have no output field.
 */
export function deriveReportViewModel(
  snapshot: ValidatedReportSnapshot,
): ReportViewModel {
  const schemaIssues = validateReportSchema(snapshot);
  if (schemaIssues.length > 0) {
    throw new TypeError(`Report snapshot is not schema-valid: ${schemaIssues[0]!.path}`);
  }
  const identity = object(snapshot.identity, "identity");
  const presentation = object(snapshot.presentation, "presentation");
  const riskProfile = object(snapshot.riskProfile, "riskProfile");
  const recommendation = object(snapshot.recommendation, "recommendation");
  const escalation = object(snapshot.escalation, "escalation");
  const riskBlocks = Array.isArray(snapshot.riskBlocks) ? snapshot.riskBlocks : [];
  const legalBasisSnapshots = Array.isArray(snapshot.legalBasisSnapshots)
    ? snapshot.legalBasisSnapshots
    : [];
  const roadmap = object(snapshot.roadmap, "roadmap");
  const limitations = Array.isArray(snapshot.limitations) ? snapshot.limitations : [];
  const creditEntitlement = snapshot.creditEntitlement === null
    ? null
    : object(snapshot.creditEntitlement, "creditEntitlement");

  const roadmapPeriod = (
    period: "day0" | "day30" | "day60" | "day90",
  ) => Object.freeze((Array.isArray(roadmap[period]) ? roadmap[period] : []).map((value, index) => {
    const task = object(value, `roadmap.${period}[${index}]`);
    return Object.freeze({
      action: string(task.action, `roadmap.${period}[${index}].action`),
      completionEvidence: string(
        task.completionEvidence,
        `roadmap.${period}[${index}].completionEvidence`,
      ),
      requiresExpertReview: boolean(
        task.requiresExpertReview,
        `roadmap.${period}[${index}].requiresExpertReview`,
      ),
    });
  }));

  const snapshotState = string(identity.snapshotState, "identity.snapshotState");
  const documentStatus = snapshotState === "superseded"
    ? "superseded_snapshot"
    : "draft_preliminary";
  const viewModel: ReportViewModel = {
    reportId: string(identity.reportId, "identity.reportId"),
    reportVersion: identity.reportVersion as number,
    generatedAt: string(identity.generatedAt, "identity.generatedAt"),
    watermark: REPORT_TEST_WATERMARK,
    documentStatus,
    title: string(presentation.reportTitle, "presentation.reportTitle"),
    summary: string(presentation.executiveSummary, "presentation.executiveSummary"),
    overallSeverity: string(riskProfile.overallSeverity, "riskProfile.overallSeverity") as ReportViewModel["overallSeverity"],
    risks: Object.freeze(riskBlocks.map((value, index) => {
      const risk = object(value, `riskBlocks[${index}]`);
      const level = object(risk.level, `riskBlocks[${index}].level`);
      const evidence = object(risk.evidence, `riskBlocks[${index}].evidence`);
      return Object.freeze({
        riskId: string(risk.riskId, `riskBlocks[${index}].riskId`),
        title: string(risk.title, `riskBlocks[${index}].title`),
        severity: string(level.severity, `riskBlocks[${index}].level.severity`) as ReportViewModel["overallSeverity"],
        evidenceStatus: string(evidence.status, `riskBlocks[${index}].evidence.status`) as ReportViewModel["risks"][number]["evidenceStatus"],
        manualReviewRequired: boolean(
          risk.manualReviewRequired,
          `riskBlocks[${index}].manualReviewRequired`,
        ),
      });
    })),
    legalBases: Object.freeze(legalBasisSnapshots.map((value, index) => {
      const basis = object(value, `legalBasisSnapshots[${index}]`);
      const verificationStatus = string(
        basis.verificationStatusAtGeneration,
        `legalBasisSnapshots[${index}].verificationStatusAtGeneration`,
      );
      if (
        verificationStatus !== "draft_pending_legal_review" &&
        verificationStatus !== "approved" &&
        verificationStatus !== "superseded"
      ) {
        throw new TypeError(`legalBasisSnapshots[${index}].verification status is not allowlisted`);
      }
      return Object.freeze({
        legalBasisId: string(basis.legalBasisId, `legalBasisSnapshots[${index}].legalBasisId`),
        actTitle: string(basis.actTitle, `legalBasisSnapshots[${index}].actTitle`),
        articleReference: string(
          basis.articleReference,
          `legalBasisSnapshots[${index}].articleReference`,
        ),
        displayWording: string(
          basis.displayWording,
          `legalBasisSnapshots[${index}].displayWording`,
        ),
        verificationStatus,
      });
    })),
    roadmap: Object.freeze({
      day0: roadmapPeriod("day0"),
      day30: roadmapPeriod("day30"),
      day60: roadmapPeriod("day60"),
      day90: roadmapPeriod("day90"),
    }),
    recommendation: Object.freeze({
      productCode: string(
        recommendation.productCode,
        "recommendation.productCode",
      ) as ReportViewModel["recommendation"]["productCode"],
      displayName: string(recommendation.displayName, "recommendation.displayName"),
      fixedPackageOfferAllowed: boolean(
        recommendation.fixedPackageOfferAllowed,
        "recommendation.fixedPackageOfferAllowed",
      ),
    }),
    escalation: Object.freeze({
      required: boolean(escalation.required, "escalation.required"),
      status: string(escalation.status, "escalation.status") as ReportViewModel["escalation"]["status"],
      clientSummary: string(escalation.clientSummary, "escalation.clientSummary"),
      clientCta: escalation.clientCta === null
        ? null
        : string(escalation.clientCta, "escalation.clientCta"),
    }),
    limitations: Object.freeze(limitations.map((value, index) => {
      const limitation = object(value, `limitations[${index}]`);
      return Object.freeze({
        category: string(limitation.category, `limitations[${index}].category`),
        statement: string(limitation.statement, `limitations[${index}].statement`),
        requiresFollowUp: boolean(
          limitation.requiresFollowUp,
          `limitations[${index}].requiresFollowUp`,
        ),
      });
    })),
    credit: creditEntitlement === null
      ? null
      : (() => {
          const status = string(creditEntitlement.status, "creditEntitlement.status");
          if (status !== "available" && status !== "expired" && status !== "revoked") {
            throw new TypeError("creditEntitlement.status is not allowlisted");
          }
          if (creditEntitlement.amountRub !== 6900 || creditEntitlement.currency !== "RUB") {
            throw new TypeError("creditEntitlement amount or currency is not allowlisted");
          }
          if (creditEntitlement.businessTimeZone !== "Europe/Moscow") {
            throw new TypeError("creditEntitlement business time zone is not allowlisted");
          }
          return Object.freeze({
            status,
            amountRub: 6900 as const,
            currency: "RUB" as const,
            expiresAt: string(creditEntitlement.expiresAt, "creditEntitlement.expiresAt"),
            businessTimeZone: "Europe/Moscow" as const,
          });
        })(),
  };
  return Object.freeze(viewModel);
}

export type { ReportViewModel, ValidatedReportSnapshot } from "./types";
