import { TRPCError } from "@trpc/server";
import { getDb } from "../db";

export type R1Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type R1Executor = Pick<R1Database, "select" | "insert" | "update">;

export async function requireR1Database(): Promise<R1Database> {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Pilot persistence is unavailable",
    });
  }
  return db;
}
