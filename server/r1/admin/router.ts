import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { r1AuditedAdminProcedure, router } from "../../_core/trpc";
import { appendAuditEvent } from "../audit/auditRepository";
import { listCasesForAdmin } from "../cases/caseRepository";
import { requireR1Database } from "../database";
import { adminPurposeCodeSchema } from "../events/contracts";
import { assertTechnicalPilotAllowed } from "../releaseGate";

const cursorSchema = z.object({
  updatedAt: z.coerce.date(),
  publicId: z.string().min(16).max(64),
});

export const pilotAdminRouter = router({
  diagnostics: router({
    list: r1AuditedAdminProcedure
      .input(
        z.object({
          purposeCode: z.string().max(64).catch(""),
          limit: z.number().int().min(1).max(100),
          cursor: cursorSchema.optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        assertTechnicalPilotAllowed();
        const purpose = adminPurposeCodeSchema.safeParse(input.purposeCode);
        if (!purpose.success) {
          try {
            const db = await requireR1Database();
            await appendAuditEvent(db, {
              actorType: "admin_user",
              actorId: String(ctx.user.id),
              aggregateType: "diagnostic_case_collection",
              aggregateId: "pilot_diagnostics",
              eventType: "diagnostic_case.admin_purpose_denied",
              outcome: "denied",
              reasonCode: "approved_purpose_required",
              requestId: ctx.requestId,
              privacySafeMetadata: { resourceClass: "pilot_diagnostics" },
            });
          } catch {
            // The safe denial does not expose or depend on audit availability.
          }
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Approved administrative purpose is required",
          });
        }

        const db = await requireR1Database();
        const rows = await listCasesForAdmin(db, {
          limit: input.limit + 1,
          cursor: input.cursor,
        });
        const hasMore = rows.length > input.limit;
        const items = hasMore ? rows.slice(0, input.limit) : rows;
        const last = items.at(-1);

        await appendAuditEvent(db, {
          actorType: "admin_user",
          actorId: String(ctx.user.id),
          aggregateType: "diagnostic_case_collection",
          aggregateId: "pilot_diagnostics",
          eventType: "diagnostic_case.admin_listed",
          outcome: "succeeded",
          reasonCode: purpose.data,
          requestId: ctx.requestId,
          privacySafeMetadata: {
            purposeCode: purpose.data,
            resultCount: items.length,
            pageSize: input.limit,
          },
        });

        return {
          requestId: ctx.requestId,
          items,
          nextCursor:
            hasMore && last
              ? { updatedAt: last.updatedAt, publicId: last.publicId }
              : null,
        };
      }),
  }),
});
