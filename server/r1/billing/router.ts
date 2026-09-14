import { z } from "zod";
import { customerProcedure, router } from "../../_core/trpc";
import { consentAssertionsSchema } from "../legal/consentService";
import { getRequiredMetadata } from "../legal/documentRegistry";
import { redeemPromo } from "./promoService";
import { getOffer } from "./tariffService";

const redeemPromoInputSchema = z.object({
  tariffCode: z.string().min(1).max(64).refine(value => value === "base_diagnostic", { message: "Offer is unavailable" }),
  promoValue: z.string().min(1).max(512),
  idempotencyKey: z.string().min(8).max(128),
  consents: consentAssertionsSchema,
}).strict();

export const pilotAccessRouter = router({
  getOffer: customerProcedure.query(() => getOffer()),
  redeemPromo: customerProcedure
    .input(redeemPromoInputSchema)
    .mutation(({ ctx, input }) => redeemPromo({
      customerAccountId: ctx.customer.accountId,
      customerSessionId: ctx.customer.sessionId,
      requestId: ctx.requestId,
      ...input,
    })),
});

export const pilotConsentsRouter = router({
  getRequiredMetadata: customerProcedure.query(() => ({ documents: getRequiredMetadata() })),
});
