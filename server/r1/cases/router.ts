import { z } from "zod";
import { customerProcedure, publicProcedure, router } from "../../_core/trpc";
import { appendAuditEvent } from "../audit/auditRepository";
import { customerAuthRouter } from "../auth/router";
import { requireR1Database } from "../database";
import { throwNeutralNotFound } from "../policy/errors";
import { assertTechnicalPilotAllowed, getReleaseGateStatus } from "../releaseGate";
import {
  findOwnedCaseByPublicId,
  listOwnedCases,
  toCaseDto,
} from "./caseRepository";

export const pilotRouter = router({
  auth: customerAuthRouter,
  status: publicProcedure.query(() => {
    const gate = getReleaseGateStatus();
    return {
      available: gate.technicalPilotAllowed,
      mode: gate.mode,
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
      .input(z.object({ publicId: z.string().min(16).max(64) }))
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
  }),
});
