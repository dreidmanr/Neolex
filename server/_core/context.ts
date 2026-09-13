import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { CUSTOMER_SESSION_COOKIE_NAME } from "./cookies";
import { findActiveCustomerSessionByTokenHash } from "../r1/auth/customerSessionRepository";
import { hashCustomerSessionToken } from "../r1/auth/customerSessionToken";
import { newR1Id } from "../r1/ids";

export { CUSTOMER_SESSION_COOKIE_NAME } from "./cookies";

export type CustomerPrincipal = {
  accountId: string;
  sessionId: string;
};

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  requestId: string;
  user: User | null;
  customer: CustomerPrincipal | null;
};

function getCookie(req: CreateExpressContextOptions["req"], name: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  for (const segment of cookieHeader.split(";")) {
    const separator = segment.indexOf("=");
    if (separator < 0 || segment.slice(0, separator).trim() !== name) continue;
    const value = segment.slice(separator + 1).trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

async function authenticateCustomer(
  req: CreateExpressContextOptions["req"],
): Promise<CustomerPrincipal | null> {
  const rawToken = getCookie(req, CUSTOMER_SESSION_COOKIE_NAME);
  if (!rawToken || !ENV.customerSessionSecret) return null;
  const tokenHash = hashCustomerSessionToken(rawToken, ENV.customerSessionSecret);
  return findActiveCustomerSessionByTokenHash(tokenHash);
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let customer: CustomerPrincipal | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  try {
    customer = await authenticateCustomer(opts.req);
  } catch {
    // Customer authentication is independent and optional for public/admin procedures.
    customer = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    // Never trust or preserve a client-supplied correlation header.
    requestId: newR1Id("request"),
    user,
    customer,
  };
}
