import { z } from "zod";
import { customerProcedure, router } from "../../_core/trpc";
import { appendAuditEvent } from "../audit/auditRepository";
import { findActiveOwnedAccessGrant } from "../billing/accessPolicy";
import { findOwnedCaseByPublicId } from "../cases/caseRepository";
import { requireR1Database, type R1Executor } from "../database";
import { throwNeutralNotFound } from "../policy/errors";
import { assertTechnicalPilotAllowed } from "../releaseGate";
import { loadReadyReportSnapshotByPublicCase } from "./reportSnapshotRepository";
import { deriveReportViewModel } from "./reportViewModel";
import { REPORT_TEST_WATERMARK, type ValidatedReportSnapshot } from "./types";

const publicCaseLocatorSchema = z.string().min(16).max(64);

const reportViewModelSchema = z
  .object({
    reportId: z.string().min(1),
    reportVersion: z.number().int().positive(),
    generatedAt: z.string().datetime(),
    watermark: z.literal(REPORT_TEST_WATERMARK),
    documentStatus: z.enum(["draft_preliminary", "superseded_snapshot"]),
    title: z.string().min(1),
    summary: z.string().min(1),
    overallSeverity: z.enum(["low", "medium", "high", "critical"]),
    risks: z.array(
      z
        .object({
          riskId: z.string().min(1),
          title: z.string().min(1),
          severity: z.enum(["low", "medium", "high", "critical"]),
          evidenceStatus: z.enum([
            "questionnaire_based",
            "document_confirmed",
            "not_confirmed_by_document",
            "additional_document_required",
            "manual_review_required",
          ]),
          manualReviewRequired: z.boolean(),
        })
        .strict()
    ),
    legalBases: z.array(
      z
        .object({
          legalBasisId: z.string().min(1),
          actTitle: z.string().min(1),
          articleReference: z.string().min(1),
          displayWording: z.string().min(1),
          verificationStatus: z.enum([
            "draft_pending_legal_review",
            "approved",
            "superseded",
          ]),
        })
        .strict()
    ),
    roadmap: z
      .object({
        day0: z.array(z.object({
          action: z.string().min(1),
          completionEvidence: z.string().min(1),
          requiresExpertReview: z.boolean(),
        }).strict()),
        day30: z.array(z.object({
          action: z.string().min(1),
          completionEvidence: z.string().min(1),
          requiresExpertReview: z.boolean(),
        }).strict()),
        day60: z.array(z.object({
          action: z.string().min(1),
          completionEvidence: z.string().min(1),
          requiresExpertReview: z.boolean(),
        }).strict()),
        day90: z.array(z.object({
          action: z.string().min(1),
          completionEvidence: z.string().min(1),
          requiresExpertReview: z.boolean(),
        }).strict()),
      })
      .strict(),
    recommendation: z
      .object({
        productCode: z.enum([
          "start_product",
          "safe_sales",
          "rights_and_ip",
          "data_and_infrastructure",
          "enterprise_readiness",
          "expert_review",
        ]),
        displayName: z.string().min(1),
        fixedPackageOfferAllowed: z.boolean(),
      })
      .strict(),
    escalation: z
      .object({
        required: z.boolean(),
        status: z.enum(["not_required", "required_not_routed"]),
        clientSummary: z.string().min(1),
        clientCta: z.string().min(1).nullable(),
      })
      .strict(),
    limitations: z.array(
      z
        .object({
          category: z.string().min(1),
          statement: z.string().min(1),
          requiresFollowUp: z.boolean(),
        })
        .strict()
    ),
    credit: z
      .object({
        status: z.enum(["available", "expired", "revoked"]),
        amountRub: z.literal(6900),
        currency: z.literal("RUB"),
        expiresAt: z.string().datetime(),
        businessTimeZone: z.literal("Europe/Moscow"),
      })
      .strict()
      .nullable(),
  })
  .strict();

async function denyReportAccess(
  db: R1Executor,
  context: { customerSessionId: string; requestId: string }
): Promise<never> {
  try {
    await appendAuditEvent(db, {
      actorType: "customer_session",
      actorId: context.customerSessionId,
      aggregateType: "report_snapshot",
      aggregateId: "unresolved_report",
      eventType: "report.access_denied",
      outcome: "denied",
      reasonCode: "owner_entitlement_or_readiness_miss",
      requestId: context.requestId,
      privacySafeMetadata: { resourceClass: "report" },
    });
  } catch {
    // Audit availability must never change or disclose the neutral denial result.
  }
  throwNeutralNotFound();
}

export const reportsRouter = router({
  getByCase: customerProcedure
    .input(z.object({ publicId: publicCaseLocatorSchema }).strict())
    .query(async ({ ctx, input }) => {
      assertTechnicalPilotAllowed();
      const db = await requireR1Database();
      const denialContext = {
        customerSessionId: ctx.customer.sessionId,
        requestId: ctx.requestId,
      };
      const ownedCase = await findOwnedCaseByPublicId(
        db,
        ctx.customer.accountId,
        input.publicId
      );
      if (!ownedCase) return denyReportAccess(db, denialContext);

      const activeAccess = await findActiveOwnedAccessGrant(
        db,
        ctx.customer.accountId,
        ownedCase.id
      );
      if (!activeAccess) return denyReportAccess(db, denialContext);

      const row = await loadReadyReportSnapshotByPublicCase(db, {
        customerAccountId: ctx.customer.accountId,
        casePublicId: input.publicId,
      });
      if (!row?.payloadJson) return denyReportAccess(db, denialContext);

      try {
        const projected = deriveReportViewModel(
          row.payloadJson as ValidatedReportSnapshot
        );
        return reportViewModelSchema.parse(projected);
      } catch {
        return denyReportAccess(db, denialContext);
      }
    }),
});

export const reportViewModelOutputSchemaForTest = reportViewModelSchema;
