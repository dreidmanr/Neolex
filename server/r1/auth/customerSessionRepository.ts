import { and, eq, gt } from "drizzle-orm";
import { customerAccounts, customerSessions } from "../../../drizzle/schema";
import { requireR1Database, type R1Executor } from "../database";

export type ActiveCustomerSession = {
  accountId: string;
  sessionId: string;
};

export async function findActiveCustomerSessionByTokenHash(
  tokenHash: string,
  executor?: R1Executor,
  now = new Date(),
): Promise<ActiveCustomerSession | null> {
  const db = executor ?? (await requireR1Database());
  const rows = await db
    .select({
      accountId: customerSessions.customerAccountId,
      sessionId: customerSessions.id,
    })
    .from(customerSessions)
    .innerJoin(
      customerAccounts,
      eq(customerAccounts.id, customerSessions.customerAccountId),
    )
    .where(
      and(
        eq(customerSessions.tokenHash, tokenHash),
        eq(customerSessions.status, "active"),
        gt(customerSessions.expiresAt, now),
        eq(customerAccounts.status, "active"),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}
