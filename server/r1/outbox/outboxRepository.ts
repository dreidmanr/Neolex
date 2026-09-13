import { outboxEvents } from "../../../drizzle/schema";
import type { R1Executor } from "../database";
import { newR1Id } from "../ids";
import {
  outboxDedupeKey,
  parseOutboxEnvelope,
  parseOutboxEvent,
  type AppendOutboxEvent,
} from "../events/contracts";

export type { AppendOutboxEvent } from "../events/contracts";

export async function appendOutboxEvent(
  executor: R1Executor,
  event: AppendOutboxEvent,
): Promise<void> {
  const parsed = parseOutboxEvent(event);
  const now = parsed.createdAt ?? new Date();
  const envelope = parseOutboxEnvelope({
    ...parsed,
    id: newR1Id("outbox"),
    eventId: newR1Id("event"),
    dedupeKey: outboxDedupeKey(parsed),
    status: "pending",
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  await executor.insert(outboxEvents).values(envelope);
}
