import { createHmac } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { authRateLimitBuckets } from "../../../drizzle/schema";
import type { R1Executor } from "../database";
import { newR1Id } from "../ids";

export const MAGIC_LINK_RATE_LIMIT_SCOPE = "magic_link_request_v1";
export const MAGIC_LINK_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
export const MAGIC_LINK_RATE_LIMIT_MAX = 3;
const RATE_BUCKET_DOMAIN = "lexy:r1:magic-link:rate-bucket:v1\u0000";

export type RateLimitDecision = {
  allowed: boolean;
  count: number;
  windowStartedAt: Date;
  windowMillis: number;
};

export function hashMagicLinkRateLimitBucket(
  normalizedEmail: string,
  pepper: string,
): string {
  if (pepper.length < 32) throw new Error("Rate limit configuration is unavailable");
  return createHmac("sha256", pepper)
    .update(RATE_BUCKET_DOMAIN)
    .update(normalizedEmail, "utf8")
    .digest("hex");
}

export function magicLinkWindowStart(now: Date): Date {
  return new Date(
    Math.floor(now.getTime() / MAGIC_LINK_RATE_LIMIT_WINDOW_MS) *
      MAGIC_LINK_RATE_LIMIT_WINDOW_MS,
  );
}

export async function takeMagicLinkRateLimit(
  executor: R1Executor,
  bucketHash: string,
  now: Date,
): Promise<RateLimitDecision> {
  const windowStartedAt = magicLinkWindowStart(now);
  const expiresAt = new Date(windowStartedAt.getTime() + MAGIC_LINK_RATE_LIMIT_WINDOW_MS * 2);
  await executor
    .insert(authRateLimitBuckets)
    .values({
      id: newR1Id("ratebucket"),
      scope: MAGIC_LINK_RATE_LIMIT_SCOPE,
      bucketHash,
      windowStartedAt,
      count: 1,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    })
    .onDuplicateKeyUpdate({
      set: {
        count: sql`${authRateLimitBuckets.count} + 1`,
        updatedAt: now,
      },
    });

  const rows = await executor
    .select({ count: authRateLimitBuckets.count })
    .from(authRateLimitBuckets)
    .where(
      and(
        eq(authRateLimitBuckets.scope, MAGIC_LINK_RATE_LIMIT_SCOPE),
        eq(authRateLimitBuckets.bucketHash, bucketHash),
        eq(authRateLimitBuckets.windowStartedAt, windowStartedAt),
      ),
    )
    .limit(1);
  const count = rows[0]?.count ?? MAGIC_LINK_RATE_LIMIT_MAX + 1;
  return {
    allowed: count <= MAGIC_LINK_RATE_LIMIT_MAX,
    count,
    windowStartedAt,
    windowMillis: windowStartedAt.getTime(),
  };
}
