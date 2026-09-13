import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  customerSessions,
  emailDeliveries,
  outboxEvents,
} from "../../../drizzle/schema";
import { provisionMagicLinkTestIdentity } from "../auth/customerAccountRepository";
import { findActiveCustomerSessionByTokenHash } from "../auth/customerSessionRepository";
import {
  insertNewCustomerSession,
  revokeCurrentCustomerSession,
} from "../auth/customerSessionService";
import { hashCustomerSessionToken } from "../auth/customerSessionToken";
import { requestMagicLink } from "../auth/magicLinkService";
import { runOneMagicLinkDelivery } from "../email/mailWorker";
import {
  getR1TestInbox,
  R1_TEST_HARNESS_IDENTITY,
} from "../email/testMailbox";
import { RUN_PREFIX, cleanRunData, db } from "./r1DbHarness";

const baseNow = new Date("2026-01-02T00:00:00.000Z");
const leaseMs = 60_000;

function mutableClock(initial: Date) {
  let current = initial;
  return {
    now: () => new Date(current),
    set: (next: Date) => {
      current = next;
    },
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("R1 Magic Link final security invariants", () => {
  beforeAll(async () => {
    await cleanRunData();
    getR1TestInbox().resetForHarness(R1_TEST_HARNESS_IDENTITY);
  });

  afterAll(async () => {
    getR1TestInbox().resetForHarness(R1_TEST_HARNESS_IDENTITY);
    await cleanRunData();
  });

  it("commits logout revocation independently when audit append fails and remains idempotent", async () => {
    const identity = await provisionMagicLinkTestIdentity(`${RUN_PREFIX}_logout@example.test`);
    const database = await db();
    const session = await insertNewCustomerSession(database, identity.accountId, baseNow);
    const tokenHash = hashCustomerSessionToken(
      session.rawToken,
      process.env.LEXY_CUSTOMER_SESSION_SECRET!,
    );
    let auditAttempts = 0;
    const failAudit = async () => {
      auditAttempts += 1;
      throw new Error("injected audit failure");
    };

    await expect(revokeCurrentCustomerSession({
      accountId: identity.accountId,
      sessionId: session.id,
      requestId: `${RUN_PREFIX}_logout_audit_failure`,
      now: new Date(baseNow.getTime() + 1_000),
    }, failAudit)).resolves.toBeUndefined();

    const rows = await database
      .select()
      .from(customerSessions)
      .where(eq(customerSessions.id, session.id));
    expect(rows[0]).toMatchObject({
      status: "revoked",
      revocationReasonCode: "logout_current",
    });
    await expect(
      findActiveCustomerSessionByTokenHash(
        tokenHash,
        database,
        new Date(baseNow.getTime() + 2_000),
      ),
    ).resolves.toBeNull();
    expect(auditAttempts).toBe(1);

    await expect(revokeCurrentCustomerSession({
      accountId: identity.accountId,
      sessionId: session.id,
      requestId: `${RUN_PREFIX}_logout_repeat`,
      now: new Date(baseNow.getTime() + 3_000),
    }, failAudit)).resolves.toBeUndefined();
    expect(auditAttempts).toBe(1);
  });

  it("lets a reclaimer commit and deliver once while the stale validated worker loses its fresh pre-send fence", async () => {
    const email = `${RUN_PREFIX}_lease@example.test`;
    const identity = await provisionMagicLinkTestIdentity(email);
    await requestMagicLink(email, `${RUN_PREFIX}_lease_request`, baseNow);
    const database = await db();
    const clock = mutableClock(baseNow);
    const workerAPaused = deferred();
    const resumeWorkerA = deferred();
    let workerATransportCalls = 0;

    const workerA = runOneMagicLinkDelivery({
      clock,
      testHooks: {
        afterInitialValidation: async () => {
          workerAPaused.resolve();
          await resumeWorkerA.promise;
        },
      },
      testTransport: {
        deliverMagicLink: () => {
          workerATransportCalls += 1;
          return true;
        },
      },
    });
    await workerAPaused.promise;

    const claimedRows = await database
      .select()
      .from(emailDeliveries)
      .where(eq(emailDeliveries.customerAccountIdentityId, identity.identityId));
    expect(claimedRows).toHaveLength(1);
    expect(claimedRows[0]).toMatchObject({
      status: "sending",
      leaseVersion: 1,
    });
    expect(claimedRows[0]!.leaseOwner).not.toBeNull();

    const reclaimNow = new Date(baseNow.getTime() + leaseMs + 1_000);
    clock.set(reclaimNow);
    await expect(runOneMagicLinkDelivery({ clock })).resolves.toEqual({
      processed: true,
      status: "sent",
    });
    expect(getR1TestInbox().readForHarness(R1_TEST_HARNESS_IDENTITY)).toHaveLength(1);

    resumeWorkerA.resolve();
    await expect(workerA).resolves.toEqual({
      processed: false,
      reason: "lease_lost",
    });
    expect(workerATransportCalls).toBe(0);
    expect(getR1TestInbox().readForHarness(R1_TEST_HARNESS_IDENTITY)).toHaveLength(1);

    const deliveryRows = await database
      .select()
      .from(emailDeliveries)
      .where(eq(emailDeliveries.customerAccountIdentityId, identity.identityId));
    expect(deliveryRows).toHaveLength(1);
    expect(deliveryRows[0]).toMatchObject({
      status: "sent",
      leaseOwner: null,
      leaseVersion: 2,
      leaseExpiresAt: null,
      sentAt: reclaimNow,
      terminalAt: reclaimNow,
    });
    expect(deliveryRows[0]!.leaseVersion).toBe(claimedRows[0]!.leaseVersion + 1);
    const outboxRows = await database
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, deliveryRows[0]!.id));
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0]).toMatchObject({
      status: "published",
      publishedAt: reclaimNow,
      lastAttemptAt: reclaimNow,
    });
  });

  it("still moves an ordinary queued delivery to the durable sent/published ledger before test delivery", async () => {
    const email = `${RUN_PREFIX}_worker@example.test`;
    const identity = await provisionMagicLinkTestIdentity(email);
    const issuedAt = new Date(baseNow.getTime() + 120_000);
    const commitAt = new Date(baseNow.getTime() + 121_000);
    await requestMagicLink(email, `${RUN_PREFIX}_worker_request`, issuedAt);
    const clock = mutableClock(commitAt);

    await expect(
      runOneMagicLinkDelivery({ clock }),
    ).resolves.toEqual({ processed: true, status: "sent" });

    const database = await db();
    const rows = await database.select().from(emailDeliveries).where(
      eq(emailDeliveries.customerAccountIdentityId, identity.identityId),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "sent",
      leaseOwner: null,
      leaseVersion: 1,
      leaseExpiresAt: null,
      sentAt: commitAt,
      terminalAt: commitAt,
    });
    const outboxRows = await database.select().from(outboxEvents).where(
      eq(outboxEvents.aggregateId, rows[0]!.id),
    );
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0]).toMatchObject({
      status: "published",
      publishedAt: commitAt,
    });
  });
});
