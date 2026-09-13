import { ENV } from "../../_core/env";
import { requireR1Database } from "../database";
import { deriveMagicLinkVerifier } from "../auth/magicLinkToken";
import { newR1Id } from "../ids";
import { assertMagicLinkTestAllowed } from "../releaseGate";
import { createEmailAdapter } from "./EmailAdapter";
import {
  claimOneMagicLinkDelivery,
  commitTestDeliveryForSend,
  finalizeDeliveryOutbox,
  finalizeEmailDelivery,
  isDeliveryTargetActive,
} from "./emailDeliveryRepository";
import type { TestEmailTransport } from "./TestEmailTransport";
import { getR1TestInbox, R1_TEST_HARNESS_IDENTITY } from "./testMailbox";

const DELIVERY_LEASE_MS = 60_000;

export type MailWorkerResult = {
  processed: boolean;
  status?: "sent" | "suppressed";
  reason?: "lease_lost" | "test_transport_duplicate" | "test_transport_rejected";
};

export type MailWorkerClock = Readonly<{
  now(): Date;
}>;

export type MailWorkerTestHooks = Readonly<{
  afterInitialValidation?(): void | Promise<void>;
}>;

export type MailWorkerDependencies = Readonly<{
  clock?: MailWorkerClock;
  testHooks?: MailWorkerTestHooks;
  testTransport?: Pick<TestEmailTransport, "deliverMagicLink">;
}>;

export async function runOneMagicLinkDelivery(
  dependencies: MailWorkerDependencies = {},
): Promise<MailWorkerResult> {
  assertMagicLinkTestAllowed();
  const db = await requireR1Database();
  const clock = dependencies.clock ?? systemClock;
  const leaseOwner = newR1Id("worker");
  const claimNow = clock.now();
  const claim = await db.transaction(tx => claimOneMagicLinkDelivery(tx, {
    leaseOwner,
    now: claimNow,
    leaseExpiresAt: new Date(claimNow.getTime() + DELIVERY_LEASE_MS),
  }));
  if (!claim) return { processed: false };

  const inbox = getR1TestInbox();
  const delivery = claim.delivery;
  const dedupeKey = delivery.dedupeKey;
  const leaseFence = {
    deliveryId: delivery.id,
    leaseOwner,
    leaseVersion: delivery.leaseVersion,
  };
  const validationNow = clock.now();
  const active = await db.transaction(tx => isDeliveryTargetActive(tx, {
    ...leaseFence,
    now: validationNow,
  }));
  const registered = inbox.isRegisteredIdentity(R1_TEST_HARNESS_IDENTITY, claim.identityId);
  if (!active || !registered) {
    const errorCode = active ? "identity_not_registered" as const : "target_inactive" as const;
    const suppressionNow = clock.now();
    const finalized = await db.transaction(async tx => {
      const finalized = await finalizeEmailDelivery(tx, {
        ...leaseFence,
        status: "suppressed",
        now: suppressionNow,
        errorCode,
      });
      if (finalized) {
        await finalizeDeliveryOutbox(
          tx,
          delivery.id,
          dedupeKey,
          "cancelled",
          suppressionNow,
        );
      }
      return finalized;
    });
    return finalized
      ? { processed: true, status: "suppressed" }
      : { processed: false, reason: "lease_lost" };
  }

  await dependencies.testHooks?.afterInitialValidation?.();
  const verifier = deriveMagicLinkVerifier(claim.tokenId, ENV.magicLinkSecret);
  const transport = dependencies.testTransport ?? createEmailAdapter({ kind: "test", inbox });
  const freshNow = clock.now();
  const committed = await commitTestDeliveryForSend(db, {
    ...leaseFence,
    freshNow,
  });
  if (!committed) return { processed: false, reason: "lease_lost" };

  const recorded = transport.deliverMagicLink({
    deliveryId: delivery.id,
    identityId: claim.identityId,
    verifier,
  });
  if (recorded === true) return { processed: true, status: "sent" };
  return recorded === false
    ? { processed: false, reason: "test_transport_duplicate" }
    : { processed: false, reason: "test_transport_rejected" };
}

const systemClock: MailWorkerClock = Object.freeze({
  now: () => new Date(),
});
