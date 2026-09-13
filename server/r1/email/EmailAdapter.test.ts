import { describe, expect, it } from "vitest";
import { createEmailAdapter, EmailAdapter } from "./EmailAdapter";
import { TestInbox } from "./TestInbox";

describe("test email adapter and transport", () => {
  it("accepts only the test kind and rejects every unsupported kind", () => {
    const inbox = new TestInbox("harness-1", () => true);

    expect(createEmailAdapter({ kind: "test", inbox })).toBeInstanceOf(Object);
    expect(() =>
      createEmailAdapter({ kind: "smtp", inbox } as unknown as Parameters<
        typeof createEmailAdapter
      >[0])
    ).toThrow("Only the test email adapter is supported");
    expect(() =>
      createEmailAdapter({ kind: "api", inbox } as unknown as Parameters<
        typeof createEmailAdapter
      >[0])
    ).toThrow("Only the test email adapter is supported");
  });

  it("passes the transient verifier solely into a fragment URL captured by the authorized inbox", () => {
    const inbox = new TestInbox("harness-1", () => true);
    inbox.registerIdentity("harness-1", "identity-1");
    const transport = EmailAdapter.create({ kind: "test", inbox });
    const verifier = "raw-verifier-only-in-test-inbox";

    expect(
      transport.deliverMagicLink({
        deliveryId: "delivery-1",
        identityId: "identity-1",
        verifier,
      })
    ).toBe(true);

    expect(
      transport.deliverMagicLink({
        deliveryId: "delivery-1",
        identityId: "identity-1",
        verifier: "replacement-must-not-overwrite",
      })
    ).toBe(false);

    const message = inbox.readForHarness("harness-1")[0];
    expect(message).toEqual({
      deliveryId: "delivery-1",
      identityId: "identity-1",
      magicLinkUrl: `https://test.invalid/auth/consume#${verifier}`,
    });

    const url = new URL(message!.magicLinkUrl);
    expect(url.origin).toBe("https://test.invalid");
    expect(url.pathname).toBe("/auth/consume");
    expect(url.search).toBe("");
    expect(url.hash).toBe(`#${verifier}`);
  });

  it("does not deliver when the customer recipient identity is not registered", () => {
    const inbox = new TestInbox("harness-1", () => true);
    const transport = createEmailAdapter({ kind: "test", inbox });

    expect(transport.deliverMagicLink({
      deliveryId: "delivery-1",
      identityId: "identity-1",
      verifier: "transient",
    })).toBe("rejected");

    expect(inbox.readForHarness("harness-1")).toEqual([]);
  });
});
