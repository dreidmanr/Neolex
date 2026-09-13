import { describe, expect, it } from "vitest";
import { TestInbox } from "./TestInbox";

describe("TestInbox", () => {
  it("separates exact harness authorization from opaque customer recipient identities", () => {
    let guard: unknown = true;
    const inbox = new TestInbox("harness-1", () => guard as boolean);

    expect(inbox.registerIdentity("other-harness", "identity-1")).toBe(false);
    expect(inbox.registerIdentity("harness-1", "")).toBe(false);
    expect(inbox.registerIdentity("harness-1", "identity-1")).toBe(true);
    expect(inbox.registerIdentity("harness-1", "identity-2")).toBe(true);
    expect(inbox.isRegisteredIdentity("harness-1", "identity-1")).toBe(true);
    expect(inbox.isRegisteredIdentity("identity-1", "identity-1")).toBe(false);

    guard = "true";
    expect(inbox.registerIdentity("harness-1", "identity-3")).toBe(false);
    expect(inbox.record(message("blocked", "identity-1"))).toBe(false);
    expect(inbox.readForHarness("harness-1")).toEqual([]);

    guard = true;
    expect(inbox.record(message("delivery-1", "identity-1"))).toBe(true);
    expect(inbox.record(message("delivery-2", "identity-2"))).toBe(true);
    expect(inbox.record(message("unregistered", "identity-3"))).toBe(false);

    expect(inbox.readForHarness("harness-1")).toEqual([
      message("delivery-1", "identity-1"),
      message("delivery-2", "identity-2"),
    ]);
    expect(inbox.readForHarness("identity-1")).toEqual([]);
    expect(inbox.readForHarness("other-harness")).toEqual([]);
  });

  it("deduplicates by delivery id without overwriting the first message", () => {
    const inbox = new TestInbox("harness-1", () => true);
    inbox.registerIdentity("harness-1", "identity-1");

    expect(inbox.record(message("delivery-1", "identity-1", "first"))).toBe(true);
    expect(inbox.record(message("delivery-1", "identity-1", "replacement"))).toBe(false);

    expect(inbox.readForHarness("harness-1")).toEqual([
      message("delivery-1", "identity-1", "first"),
    ]);
  });

  it("requires the active harness to read, clear, and reset", () => {
    let guard = true;
    const inbox = new TestInbox("harness-1", () => guard);
    inbox.registerIdentity("harness-1", "identity-1");
    inbox.record(message("delivery-1", "identity-1"));

    expect(inbox.clearForHarness("harness-2")).toBe(false);
    expect(inbox.readForHarness("harness-1")).toHaveLength(1);

    guard = false;
    expect(inbox.clearForHarness("harness-1")).toBe(false);
    expect(inbox.resetForHarness("harness-1")).toBe(false);

    guard = true;
    expect(inbox.resetForHarness("harness-1")).toBe(true);
    expect(inbox.readForHarness("harness-1")).toEqual([]);
    expect(inbox.isRegisteredIdentity("harness-1", "identity-1")).toBe(false);
  });
});

function message(deliveryId: string, identityId: string, suffix = deliveryId) {
  return {
    deliveryId,
    identityId,
    magicLinkUrl: `https://test.invalid/auth/consume#${suffix}`,
  };
}
