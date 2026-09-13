export type TestInboxMessage = Readonly<{
  deliveryId: string;
  identityId: string;
  magicLinkUrl: string;
}>;

/**
 * Minimal test-only inbox contract. Captured messages are the only visible
 * test deliverable; this intentionally provides no network, endpoint, or real
 * provider abstraction. A future provider needs provider-side idempotency and
 * a separate acknowledgement/reconciliation delivery protocol.
 */
export interface TestInboxPort {
  registerIdentity(harnessIdentity: string, recipientIdentityId: string): boolean;
  isRegisteredIdentity(
    harnessIdentity: string,
    recipientIdentityId: string,
  ): boolean;
  hasDelivery(deliveryId: string): boolean;
  record(message: TestInboxMessage): boolean;
  readForHarness(harnessIdentity: string): readonly TestInboxMessage[];
  clearForHarness(harnessIdentity: string): boolean;
  resetForHarness(harnessIdentity: string): boolean;
}

/**
 * In-memory capture for an explicitly identified test harness.
 *
 * The constructor-bound harness identity is authorization, never a customer
 * account identity. An authorized harness may register multiple opaque
 * customer recipient identities. Guard evaluation deliberately requires the
 * literal boolean `true`, not merely a truthy callback value.
 */
export class TestInbox implements TestInboxPort {
  private readonly registeredIdentityIds = new Set<string>();
  private readonly messagesByDeliveryId = new Map<string, TestInboxMessage>();

  constructor(
    private readonly harnessIdentity: string,
    private readonly isExactTestGuardEnabled: () => boolean
  ) {
    if (typeof harnessIdentity !== "string" || harnessIdentity.length === 0) {
      throw new Error("A non-empty test harness identity is required");
    }
  }

  /** Registers a customer recipient for the exact active harness. */
  registerIdentity(
    harnessIdentity: string,
    recipientIdentityId: string,
  ): boolean {
    if (
      !this.isAuthorizedHarness(harnessIdentity) ||
      !isOpaqueIdentityId(recipientIdentityId)
    ) {
      return false;
    }

    this.registeredIdentityIds.add(recipientIdentityId);
    return true;
  }

  isRegisteredIdentity(
    harnessIdentity: string,
    recipientIdentityId: string,
  ): boolean {
    return (
      this.isAuthorizedHarness(harnessIdentity) &&
      this.registeredIdentityIds.has(recipientIdentityId)
    );
  }

  hasDelivery(deliveryId: string): boolean {
    return this.messagesByDeliveryId.has(deliveryId);
  }

  /**
   * Captures a delivery only for a registered customer recipient and only
   * while the exact guard is active. Repeated delivery ids keep the first
   * message.
   */
  record(message: TestInboxMessage): boolean {
    if (
      this.isExactTestGuardEnabled() !== true ||
      !isMessage(message) ||
      !this.registeredIdentityIds.has(message.identityId) ||
      this.messagesByDeliveryId.has(message.deliveryId)
    ) {
      return false;
    }

    this.messagesByDeliveryId.set(
      message.deliveryId,
      Object.freeze({ ...message })
    );
    return true;
  }

  /**
   * The inbox is visible only to its constructor-bound active harness. A
   * harness receives messages for all customer recipients it registered.
   */
  readForHarness(harnessIdentity: string): readonly TestInboxMessage[] {
    if (!this.isAuthorizedHarness(harnessIdentity)) {
      return [];
    }

    return Object.freeze(
      Array.from(this.messagesByDeliveryId.values())
        .map(message => Object.freeze({ ...message }))
    );
  }

  /** Clears captured messages only for the constructor-bound active harness. */
  clearForHarness(harnessIdentity: string): boolean {
    if (!this.isAuthorizedHarness(harnessIdentity)) {
      return false;
    }

    this.messagesByDeliveryId.clear();
    return true;
  }

  /** Clears messages and recipient registrations for isolated test cleanup. */
  resetForHarness(harnessIdentity: string): boolean {
    if (!this.clearForHarness(harnessIdentity)) return false;
    this.registeredIdentityIds.clear();
    return true;
  }

  private isAuthorizedHarness(harnessIdentity: string): boolean {
    return (
      this.isExactTestGuardEnabled() === true &&
      harnessIdentity === this.harnessIdentity
    );
  }
}

function isOpaqueIdentityId(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 64 &&
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)
  );
}

function isMessage(value: TestInboxMessage): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.deliveryId === "string" &&
    value.deliveryId.length > 0 &&
    typeof value.identityId === "string" &&
    value.identityId.length > 0 &&
    typeof value.magicLinkUrl === "string" &&
    value.magicLinkUrl.length > 0
  );
}
