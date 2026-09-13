import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  auditEvents,
  customerSessions,
  emailDeliveries,
  magicLinkTokens,
} from "../../../drizzle/schema";
import { hashCustomerSessionToken } from "../auth/customerSessionToken";
import { provisionMagicLinkTestIdentity } from "../auth/customerAccountRepository";
import { consumeMagicLink, requestMagicLink } from "../auth/magicLinkService";
import { runOneMagicLinkDelivery } from "../email/mailWorker";
import { getR1TestInbox, R1_TEST_HARNESS_IDENTITY } from "../email/testMailbox";
import { RUN_PREFIX, cleanRunData, db } from "./r1DbHarness";

const knownEmail = `${RUN_PREFIX}@example.test`;
const unknownEmail = `${RUN_PREFIX}_unknown@example.test`;
const now = new Date("2026-01-01T00:01:00.000Z");

function mutableClock(initial: Date) {
  let current = initial;
  return {
    now: () => new Date(current),
    set: (next: Date) => {
      current = next;
    },
  };
}

describe("R1 real Magic Link flow", () => {
  beforeAll(async () => {
    await cleanRunData();
    getR1TestInbox().resetForHarness(R1_TEST_HARNESS_IDENTITY);
  });

  afterAll(async () => {
    getR1TestInbox().resetForHarness(R1_TEST_HARNESS_IDENTITY);
    await cleanRunData();
  });

  it("provisions unique customer identities and emits at most one delivery per identity/window", async () => {
    const identity = await provisionMagicLinkTestIdentity(knownEmail);
    expect(identity.accountId).toMatch(/^account_/);
    expect(identity.identityId).toMatch(/^identity_/);
    expect(identity.identityId).not.toBe(R1_TEST_HARNESS_IDENTITY);
    await expect(provisionMagicLinkTestIdentity(knownEmail)).resolves.toEqual(identity);

    const [first, second, unknown] = await Promise.all([
      requestMagicLink(knownEmail, `${RUN_PREFIX}_request_magic_one`, now),
      requestMagicLink(knownEmail, `${RUN_PREFIX}_request_magic_two`, now),
      requestMagicLink(unknownEmail, `${RUN_PREFIX}_request_magic_unknown`, now),
    ]);
    expect(first).toEqual({ accepted: true });
    expect(second).toEqual({ accepted: true });
    expect(unknown).toEqual({ accepted: true });

    const database = await db();
    const deliveries = await database.select().from(emailDeliveries).where(
      eq(emailDeliveries.customerAccountIdentityId, identity.identityId),
    );
    const tokens = await database.select().from(magicLinkTokens).where(
      eq(magicLinkTokens.customerAccountIdentityId, identity.identityId),
    );
    expect(deliveries).toHaveLength(1);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.status).toBe("active");
  });

  it("moves queued to sent through the guarded worker and consumes once with an eight-hour session", async () => {
    const identity = await provisionMagicLinkTestIdentity(knownEmail);
    const clock = mutableClock(new Date(now.getTime() + 1_000));
    await expect(runOneMagicLinkDelivery({ clock })).resolves.toEqual({
      processed: true,
      status: "sent",
    });
    clock.set(new Date(now.getTime() + 2_000));

    const inbox = getR1TestInbox().readForHarness(R1_TEST_HARNESS_IDENTITY);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.identityId).toBe(identity.identityId);
    const rawToken = new URL(inbox[0]!.magicLinkUrl).hash.slice(1);
    expect(rawToken).toHaveLength(43);

    const consumedAt = new Date(now.getTime() + 2_000);
    const consumed = await consumeMagicLink(
      rawToken,
      `${RUN_PREFIX}_request_consume_one`,
      consumedAt,
    );
    expect(consumed).toMatchObject({ consumed: true });
    if (!consumed.consumed) throw new Error("Expected successful Magic Link consumption");
    expect(consumed.expiresAt.getTime() - consumedAt.getTime()).toBe(8 * 60 * 60 * 1000);
    await expect(
      consumeMagicLink(rawToken, `${RUN_PREFIX}_request_consume_replay`, consumedAt),
    ).resolves.toEqual({ consumed: false });

    const database = await db();
    const sessions = await database.select().from(customerSessions).where(
      eq(customerSessions.tokenHash, hashCustomerSessionToken(
        consumed.sessionToken,
        process.env.LEXY_CUSTOMER_SESSION_SECRET!,
      )),
    );
    expect(sessions).toHaveLength(1);
    const consumptionAudits = await database.select().from(auditEvents).where(
      and(
        eq(auditEvents.eventType, "auth.magic_link_consumed"),
        eq(auditEvents.requestId, `${RUN_PREFIX}_request_consume_one`),
      ),
    );
    expect(consumptionAudits).toHaveLength(1);
  });
});
