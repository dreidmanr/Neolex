import { z } from "zod";

const opaqueIdSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const requestIdSchema = z.string().min(16).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const positiveVersionSchema = z.number().int().positive();

export const caseStatusSchema = z.enum([
  "draft", "access_granted", "in_progress", "submitted", "scoring",
  "manual_review_required", "report_ready", "failed", "archived",
]);
export const adminPurposeCodeSchema = z.enum([
  "support", "security_investigation", "release_monitoring", "pilot_quality_review",
]);
export const transitionReasonCodeSchema = z.enum([
  "workflow_progression", "manual_review", "system_failure", "archive_requested", "test_harness",
]);

const syntheticAudit = z.object({
  actorType: z.literal("customer_session"), actorId: opaqueIdSchema,
  aggregateType: z.literal("diagnostic_case"), aggregateId: opaqueIdSchema,
  eventType: z.literal("diagnostic_case.synthetic_created"), outcome: z.literal("succeeded"),
  toStatus: z.literal("draft"), requestId: requestIdSchema, idempotencyKeyHash: hashSchema,
  privacySafeMetadata: z.object({
    serviceTier: z.literal("base_diagnostic"), stateVersion: positiveVersionSchema, synthetic: z.literal(true),
  }).strict(),
  createdAt: z.date().optional(),
}).strict();
const transitionAudit = z.object({
  actorType: z.enum(["customer_account", "customer_session", "admin_user", "service"]), actorId: opaqueIdSchema,
  aggregateType: z.literal("diagnostic_case"), aggregateId: opaqueIdSchema,
  eventType: z.literal("diagnostic_case.status_changed"), fromStatus: caseStatusSchema, toStatus: caseStatusSchema,
  outcome: z.literal("succeeded"), reasonCode: transitionReasonCodeSchema.optional(), requestId: requestIdSchema,
  idempotencyKeyHash: hashSchema, privacySafeMetadata: z.object({ stateVersion: positiveVersionSchema }).strict(),
  createdAt: z.date().optional(),
}).strict();
const adminListAudit = z.object({
  actorType: z.literal("admin_user"), actorId: opaqueIdSchema,
  aggregateType: z.literal("diagnostic_case_collection"), aggregateId: z.literal("pilot_diagnostics"),
  eventType: z.literal("diagnostic_case.admin_listed"), outcome: z.literal("succeeded"),
  reasonCode: adminPurposeCodeSchema, requestId: requestIdSchema,
  privacySafeMetadata: z.object({
    purposeCode: adminPurposeCodeSchema, resultCount: z.number().int().min(0).max(100),
    pageSize: z.number().int().min(1).max(100),
  }).strict(),
  createdAt: z.date().optional(),
}).strict();
const ownerDeniedAudit = z.object({
  actorType: z.literal("customer_session"), actorId: opaqueIdSchema,
  aggregateType: z.literal("diagnostic_case"), aggregateId: z.literal("unresolved_case"),
  eventType: z.literal("diagnostic_case.owner_access_denied"), outcome: z.literal("denied"),
  reasonCode: z.literal("owner_scope_miss"), requestId: requestIdSchema,
  privacySafeMetadata: z.object({ resourceClass: z.literal("diagnostic_case") }).strict(), createdAt: z.date().optional(),
}).strict();
const adminRoleDeniedAudit = z.object({
  actorType: z.literal("admin_user"), actorId: opaqueIdSchema,
  aggregateType: z.literal("diagnostic_case_collection"), aggregateId: z.literal("pilot_diagnostics"),
  eventType: z.literal("diagnostic_case.admin_role_denied"), outcome: z.literal("denied"),
  reasonCode: z.literal("admin_role_required"), requestId: requestIdSchema,
  privacySafeMetadata: z.object({ resourceClass: z.literal("pilot_diagnostics") }).strict(), createdAt: z.date().optional(),
}).strict();
const adminPurposeDeniedAudit = z.object({
  actorType: z.literal("admin_user"), actorId: opaqueIdSchema,
  aggregateType: z.literal("diagnostic_case_collection"), aggregateId: z.literal("pilot_diagnostics"),
  eventType: z.literal("diagnostic_case.admin_purpose_denied"), outcome: z.literal("denied"),
  reasonCode: z.literal("approved_purpose_required"), requestId: requestIdSchema,
  privacySafeMetadata: z.object({ resourceClass: z.literal("pilot_diagnostics") }).strict(), createdAt: z.date().optional(),
}).strict();
export const auditEventSchema = z.discriminatedUnion("eventType", [
  syntheticAudit, transitionAudit, adminListAudit, ownerDeniedAudit, adminRoleDeniedAudit, adminPurposeDeniedAudit,
]);
export type AppendAuditEvent = z.infer<typeof auditEventSchema>;

const syntheticOutbox = z.object({
  aggregateType: z.literal("diagnostic_case"), aggregateId: opaqueIdSchema,
  eventType: z.literal("diagnostic_case.synthetic_created"),
  privacySafePayload: z.object({
    caseId: opaqueIdSchema, stateVersion: positiveVersionSchema, synthetic: z.literal(true),
  }).strict(),
  createdAt: z.date().optional(),
}).strict();
const transitionOutbox = z.object({
  aggregateType: z.literal("diagnostic_case"), aggregateId: opaqueIdSchema,
  eventType: z.literal("diagnostic_case.status_changed"),
  privacySafePayload: z.object({
    caseId: opaqueIdSchema, stateVersion: positiveVersionSchema, status: caseStatusSchema,
  }).strict(),
  createdAt: z.date().optional(),
}).strict();
export const outboxEventSchema = z.discriminatedUnion("eventType", [syntheticOutbox, transitionOutbox]);
export type AppendOutboxEvent = z.infer<typeof outboxEventSchema>;

const generatedAuditEnvelopeSchema = z.object({ id: opaqueIdSchema }).strict();
const generatedOutboxEnvelopeSchema = z.object({
  id: opaqueIdSchema, eventId: opaqueIdSchema,
  dedupeKey: z.string().max(128).regex(/^(?:case-created|case-transition):[A-Za-z0-9][A-Za-z0-9_-]*:v[1-9][0-9]*$/),
  status: z.literal("pending"), attemptCount: z.literal(0), updatedAt: z.date(),
}).strict();

export function outboxDedupeKey(event: AppendOutboxEvent): string {
  const prefix = event.eventType === "diagnostic_case.synthetic_created" ? "case-created" : "case-transition";
  return `${prefix}:${event.aggregateId}:v${event.privacySafePayload.stateVersion}`;
}
export function parseAuditEvent(value: unknown): AppendAuditEvent {
  return auditEventSchema.parse(value);
}
export function parseOutboxEvent(value: unknown): AppendOutboxEvent {
  const event = outboxEventSchema.parse(value);
  if (event.aggregateId !== event.privacySafePayload.caseId) {
    throw new Error("Aggregate and payload identifiers differ");
  }
  return event;
}
export function parseAuditEnvelope(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Invalid audit envelope");
  const { id, ...event } = value as Record<string, unknown>;
  const generated = generatedAuditEnvelopeSchema.parse({ id });
  const parsedEvent = auditEventSchema.parse(event);
  if (!parsedEvent.createdAt) throw new Error("Audit envelope requires createdAt");
  return { ...parsedEvent, ...generated };
}
export function parseOutboxEnvelope(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Invalid outbox envelope");
  const { id, eventId, dedupeKey, status, attemptCount, updatedAt, ...event } = value as Record<string, unknown>;
  const generated = generatedOutboxEnvelopeSchema.parse({ id, eventId, dedupeKey, status, attemptCount, updatedAt });
  const parsedEvent = parseOutboxEvent(event);
  if (!parsedEvent.createdAt) throw new Error("Outbox envelope requires createdAt");
  if (generated.updatedAt.getTime() !== parsedEvent.createdAt.getTime()) throw new Error("Outbox timestamps differ");
  if (generated.dedupeKey !== outboxDedupeKey(parsedEvent)) throw new Error("Outbox dedupe key does not match event");
  return { ...parsedEvent, ...generated };
}
