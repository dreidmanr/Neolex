import type { TestInboxPort } from "./TestInbox";

export type TestMagicLinkDelivery = Readonly<{
  deliveryId: string;
  identityId: string;
}>;

export type TestMagicLinkDeliveryRequest = TestMagicLinkDelivery &
  Readonly<{
    /** Sensitive and transient: do not retain, log, or return this value. */
    verifier: string;
  }>;

export type TestEmailTransportResult = true | false | "rejected";

const TEST_MAGIC_LINK_BASE_URL = "https://test.invalid/auth/consume";

/**
 * Test-only transport with no network or provider code. It accepts a raw
 * verifier only as a transient method argument, embeds it in a URL fragment,
 * and returns only whether the inbox recorded the delivery.
 */
export class TestEmailTransport {
  constructor(private readonly inbox: TestInboxPort) {}

  deliverMagicLink(request: TestMagicLinkDeliveryRequest): TestEmailTransportResult {
    assertDelivery(request);

    // A verifier belongs in the fragment so it is not sent as a request query.
    const magicLinkUrl = `${TEST_MAGIC_LINK_BASE_URL}#${request.verifier}`;
    const recorded = this.inbox.record({
      deliveryId: request.deliveryId,
      identityId: request.identityId,
      magicLinkUrl,
    });
    if (recorded) return true;

    // False is reserved for an already visible delivery. Guard or recipient
    // failures are deterministic local rejections, never provider failures.
    return this.inbox.hasDelivery(request.deliveryId) ? false : "rejected";
  }
}

function assertDelivery(request: TestMagicLinkDeliveryRequest): void {
  if (
    typeof request !== "object" ||
    request === null ||
    typeof request.deliveryId !== "string" ||
    request.deliveryId.length === 0 ||
    typeof request.identityId !== "string" ||
    request.identityId.length === 0 ||
    typeof request.verifier !== "string" ||
    request.verifier.length === 0
  ) {
    throw new Error("A complete test magic-link delivery is required");
  }
}
