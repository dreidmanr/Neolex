import { auditEvents } from "../../../drizzle/schema";
import type { R1Executor } from "../database";
import { newR1Id } from "../ids";
import {
  parseAuditEnvelope,
  parseAuditEvent,
  type AppendAuditEvent,
} from "../events/contracts";

export type { AppendAuditEvent } from "../events/contracts";

export async function appendAuditEvent(
  executor: R1Executor,
  event: AppendAuditEvent,
): Promise<void> {
  const parsed = parseAuditEvent(event);
  const envelope = parseAuditEnvelope({
    ...parsed,
    id: newR1Id("audit"),
    createdAt: parsed.createdAt ?? new Date(),
  });
  await executor.insert(auditEvents).values(envelope);
}
