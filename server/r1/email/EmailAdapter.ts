import { TestEmailTransport } from "./TestEmailTransport";
import type { TestInboxPort } from "./TestInbox";

export type EmailAdapterConfig = Readonly<{
  kind: "test";
  inbox: TestInboxPort;
}>;

/**
 * Builds the only supported email primitive. Production/provider transports
 * are deliberately absent from this schema-independent R1 foundation.
 */
export function createEmailAdapter(
  config: EmailAdapterConfig
): TestEmailTransport {
  if (!config || config.kind !== "test") {
    throw new Error("Only the test email adapter is supported");
  }

  return new TestEmailTransport(config.inbox);
}

/** Class-shaped facade for consumers that prefer an adapter object. */
export class EmailAdapter {
  static create(config: EmailAdapterConfig): TestEmailTransport {
    return createEmailAdapter(config);
  }
}
