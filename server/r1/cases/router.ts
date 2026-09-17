import { z } from "zod";
import type { QuestionnaireAnswerInputDto } from "../../../shared/r1/questionnaire";
import { customerProcedure, publicProcedure, router } from "../../_core/trpc";
import { appendAuditEvent } from "../audit/auditRepository";
import { customerAuthRouter } from "../auth/router";
import { pilotAccessRouter, pilotConsentsRouter } from "../billing/router";
import { requireR1Database } from "../database";
import { throwNeutralNotFound } from "../policy/errors";
import {
  assertTechnicalPilotAllowed,
  getReleaseGateStatus,
  isPromoAccessTestAllowed,
} from "../releaseGate";
import { reportsRouter } from "../reports/router";
import { listOwnedDocuments } from "../documents/documentRepository";
import { DOCUMENT_TARIFF_CODE } from "../documents/documentService";
import { accessGrants, paymentRecords } from "../../../drizzle/schema";
import { and, eq } from "drizzle-orm";
import {
  getQuestionnaireDraft,
  saveQuestionnaireAnswer,
  submitQuestionnaire,
} from "../questionnaire/questionnaireService";
import {
  findOwnedCaseByPublicId,
  listOwnedCases,
  toCaseDto,
} from "./caseRepository";

const publicCaseLocatorSchema = z.string().min(16).max(64);
const answerValueSchema = z.union([
  z.object({ kind: z.literal("single"), optionId: z.string().min(1).max(64) }).strict(),
  z.object({ kind: z.literal("multi"), optionIds: z.array(z.string().min(1).max(64)).min(1).max(64) }).strict(),
  z.object({ kind: z.literal("text"), text: z.string().max(20_000) }).strict(),
  z.null(),
]) as z.ZodType<QuestionnaireAnswerInputDto>;

export const pilotRouter = router({
  auth: customerAuthRouter,
  access: pilotAccessRouter,
  consents: pilotConsentsRouter,
  reports: reportsRouter,
  status: publicProcedure.query(() => {
    const gate = getReleaseGateStatus();
    return {
      available: gate.technicalPilotAllowed,
      mode: gate.mode,
      promoAccessAvailable: isPromoAccessTestAllowed(),
    };
  }),
  me: customerProcedure.query(({ ctx }) => {
    assertTechnicalPilotAllowed();
    return {
      authenticated: true as const,
    };
  }),
  cases: router({
    list: customerProcedure.query(async ({ ctx }) => {
      assertTechnicalPilotAllowed();
      const db = await requireR1Database();
      return listOwnedCases(db, ctx.customer.accountId);
    }),
    get: customerProcedure
      .input(z.object({ publicId: publicCaseLocatorSchema }).strict())
      .query(async ({ ctx, input }) => {
        assertTechnicalPilotAllowed();
        const db = await requireR1Database();
        const row = await findOwnedCaseByPublicId(
          db,
          ctx.customer.accountId,
          input.publicId,
        );
        if (!row) {
          try {
            await appendAuditEvent(db, {
              actorType: "customer_session",
              actorId: ctx.customer.sessionId,
              aggregateType: "diagnostic_case",
              aggregateId: "unresolved_case",
              eventType: "diagnostic_case.owner_access_denied",
              outcome: "denied",
              reasonCode: "owner_scope_miss",
              requestId: ctx.requestId,
              privacySafeMetadata: { resourceClass: "diagnostic_case" },
            });
          } catch {
            // Denial and its neutral response do not depend on audit availability.
          }
          throwNeutralNotFound();
        }
        return toCaseDto(row);
      }),
    documents: router({
      list: customerProcedure
        .input(z.object({ publicId: publicCaseLocatorSchema }).strict())
        .query(async ({ ctx, input }) => {
          assertTechnicalPilotAllowed();
          const db = await requireR1Database();
          const ownedCase = await findOwnedCaseByPublicId(db, ctx.customer.accountId, input.publicId);
          if (!ownedCase) throwNeutralNotFound();
          const grants = await db.select({ paymentRecordId: accessGrants.paymentRecordId }).from(accessGrants).where(and(
            eq(accessGrants.customerAccountId, ctx.customer.accountId),
            eq(accessGrants.diagnosticCaseId, ownedCase.id),
            eq(accessGrants.status, "active"),
          )).limit(1);
          if (!grants[0]) throwNeutralNotFound();
          const payment = await db.select({ tariffCode: paymentRecords.tariffCode }).from(paymentRecords).where(and(
            eq(paymentRecords.id, grants[0].paymentRecordId),
            eq(paymentRecords.customerAccountId, ctx.customer.accountId),
            eq(paymentRecords.diagnosticCaseId, ownedCase.id),
          )).limit(1);
          if (payment[0]?.tariffCode !== DOCUMENT_TARIFF_CODE) throwNeutralNotFound();
          return (await listOwnedDocuments(db, {
            customerAccountId: ctx.customer.accountId,
            diagnosticCaseId: ownedCase.id,
          })).map(document => ({
            id: document.id,
            fileName: document.fileName,
            categoryId: document.categoryId,
            status: document.status,
            byteSize: document.byteSize,
            createdAt: document.createdAt,
            deletedAt: document.deletedAt,
          }));
        }),
    }),
    getDraft: customerProcedure
      .input(z.object({ publicId: publicCaseLocatorSchema }).strict())
      .query(({ ctx, input }) => getQuestionnaireDraft({
        customerAccountId: ctx.customer.accountId,
        customerSessionId: ctx.customer.sessionId,
        requestId: ctx.requestId,
        publicId: input.publicId,
      })),
    saveAnswer: customerProcedure
      .input(z.object({
        publicId: publicCaseLocatorSchema,
        questionId: z.string().regex(/^b[0-9]+_q[0-9]+$/).max(64),
        value: answerValueSchema,
        clientMutationId: z.string().min(8).max(128),
        expectedDraftRevision: z.number().int().min(0),
      }).strict())
      .mutation(({ ctx, input }) => saveQuestionnaireAnswer({
        customerAccountId: ctx.customer.accountId,
        customerSessionId: ctx.customer.sessionId,
        requestId: ctx.requestId,
        ...input,
      })),
    submit: customerProcedure
      .input(z.object({
        publicId: publicCaseLocatorSchema,
        idempotencyKey: z.string().min(8).max(128),
      }).strict())
      .mutation(({ ctx, input }) => submitQuestionnaire({
        customerAccountId: ctx.customer.accountId,
        customerSessionId: ctx.customer.sessionId,
        requestId: ctx.requestId,
        ...input,
      })),
  }),
});
