import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { appendAuditEvent } from "../r1/audit/auditRepository";
import { requireR1Database } from "../r1/database";
import { assertTechnicalPilotAllowed } from "../r1/releaseGate";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

const requireCustomer = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.customer) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Customer session required",
    });
  }
  assertTechnicalPilotAllowed();

  return next({
    ctx: {
      ...ctx,
      customer: ctx.customer,
    },
  });
});

export const customerProcedure = t.procedure.use(requireCustomer);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

export const r1AuditedAdminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== "admin") {
      try {
        const db = await requireR1Database();
        await appendAuditEvent(db, {
          actorType: "admin_user",
          actorId: ctx.user ? String(ctx.user.id) : "anonymous",
          aggregateType: "diagnostic_case_collection",
          aggregateId: "pilot_diagnostics",
          eventType: "diagnostic_case.admin_role_denied",
          outcome: "denied",
          reasonCode: "admin_role_required",
          requestId: ctx.requestId,
          privacySafeMetadata: { resourceClass: "pilot_diagnostics" },
        });
      } catch {
        // Audit failure cannot grant access or alter the safe denial contract.
      }
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);
