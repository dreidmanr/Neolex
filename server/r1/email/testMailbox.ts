import { isMagicLinkTestAllowed } from "../releaseGate";
import { TestInbox } from "./TestInbox";

export const R1_TEST_HARNESS_IDENTITY = "r1-harness";

const inbox = new TestInbox(
  R1_TEST_HARNESS_IDENTITY,
  () => isMagicLinkTestAllowed() === true,
);

export function getR1TestInbox(): TestInbox {
  return inbox;
}

export function registerR1TestInboxIdentity(
  harnessIdentity: string,
  recipientIdentityId: string,
): boolean {
  return inbox.registerIdentity(harnessIdentity, recipientIdentityId);
}
