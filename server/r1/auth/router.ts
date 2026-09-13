import { z } from "zod";
import {
  CUSTOMER_SESSION_COOKIE_NAME,
  getCustomerSessionClearCookieOptions,
} from "../../_core/cookies";
import { customerProcedure, publicProcedure, router } from "../../_core/trpc";
import { revokeCurrentCustomerSession } from "./customerSessionService";
import { requestMagicLink } from "./magicLinkService";

export const customerAuthRouter = router({
  requestMagicLink: publicProcedure
    .input(z.object({ email: z.string().max(254) }).strict())
    .mutation(async ({ ctx, input }) => {
      return requestMagicLink(input.email, ctx.requestId);
    }),

  me: customerProcedure.query(() => ({ authenticated: true as const })),

  logout: customerProcedure.mutation(async ({ ctx }) => {
    try {
      await revokeCurrentCustomerSession({
        accountId: ctx.customer.accountId,
        sessionId: ctx.customer.sessionId,
        requestId: ctx.requestId,
      });
    } finally {
      ctx.res.clearCookie(
        CUSTOMER_SESSION_COOKIE_NAME,
        getCustomerSessionClearCookieOptions(),
      );
    }
    return { authenticated: false as const };
  }),
});
