import { z } from "zod";

const opaqueIdSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const versionSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
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
  "promo_redemption",
]);

const syntheticAudit = z.object({
  actorType: z.literal("customer_session"), actorId: opaqueIdSchema,
  aggregateType: z.literal("diagnostic_case"), aggregateId: opaqueIdSchema,
  eventType: z.literal("diagnostic_case.synthetic_created"), outcome: z.literal("succeeded"),
  toStatus: z.literal("draft"), requestId: requestIdSchema, idempotencyKeyHash: hashSchema,
  privacySafeMetadata: z.object({
    serviceTier: z.literal("lexy-advanced-diagnostic"), stateVersion: positiveVersionSchema, synthetic: z.literal(true),
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
const reportAccessDeniedAudit = z.object({
  actorType: z.literal("customer_session"), actorId: opaqueIdSchema,
  aggregateType: z.literal("report_snapshot"), aggregateId: z.literal("unresolved_report"),
  eventType: z.literal("report.access_denied"), outcome: z.literal("denied"),
  reasonCode: z.literal("owner_entitlement_or_readiness_miss"), requestId: requestIdSchema,
  privacySafeMetadata: z.object({ resourceClass: z.literal("report") }).strict(), createdAt: z.date().optional(),
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
const magicLinkIssuedAudit = z.object({
  actorType: z.literal("service"), actorId: opaqueIdSchema,
  aggregateType: z.literal("magic_link_token"), aggregateId: opaqueIdSchema,
  eventType: z.literal("auth.magic_link_issued"), outcome: z.literal("succeeded"),
  toStatus: z.literal("active"), requestId: requestIdSchema, correlationId: opaqueIdSchema,
  privacySafeMetadata: z.object({
    identityId: opaqueIdSchema, keyVersion: positiveVersionSchema, test: z.literal(true),
    rateLimitCount: z.number().int().min(1).max(3),
  }).strict(),
  createdAt: z.date().optional(),
}).strict();
const magicLinkConsumedAudit = z.object({
  actorType: z.literal("service"), actorId: z.literal("magic_link_consumer"),
  aggregateType: z.literal("magic_link_token"), aggregateId: opaqueIdSchema,
  eventType: z.literal("auth.magic_link_consumed"), outcome: z.literal("succeeded"),
  fromStatus: z.literal("active"), toStatus: z.literal("consumed"),
  requestId: requestIdSchema, correlationId: opaqueIdSchema,
  privacySafeMetadata: z.object({
    sessionId: opaqueIdSchema, keyVersion: positiveVersionSchema, test: z.literal(true),
  }).strict(),
  createdAt: z.date().optional(),
}).strict();
const customerSessionRevokedAudit = z.object({
  actorType: z.literal("customer_session"), actorId: opaqueIdSchema,
  aggregateType: z.literal("customer_session"), aggregateId: opaqueIdSchema,
  eventType: z.literal("auth.customer_session_revoked"), outcome: z.literal("succeeded"),
  fromStatus: z.literal("active"), toStatus: z.literal("revoked"),
  reasonCode: z.literal("logout_current"), requestId: requestIdSchema,
  privacySafeMetadata: z.object({ test: z.literal(true) }).strict(),
  createdAt: z.date().optional(),
}).strict();
const promoGrantedAudit = z.object({
  actorType: z.literal("customer_session"), actorId: opaqueIdSchema,
  aggregateType: z.literal("payment_record"), aggregateId: opaqueIdSchema,
  eventType: z.literal("billing.promo_granted"), outcome: z.literal("succeeded"),
  toStatus: z.literal("promo_granted"), requestId: requestIdSchema,
  correlationId: opaqueIdSchema, idempotencyKeyHash: hashSchema,
  privacySafeMetadata: z.object({
    paymentId: opaqueIdSchema, caseId: opaqueIdSchema, grantId: opaqueIdSchema,
    tariffCode: z.literal("lexy-advanced-diagnostic"), chargedAmount: z.literal(0),
    currency: z.literal("RUB"), campaignId: opaqueIdSchema, test: z.literal(true),
  }).strict(),
  createdAt: z.date().optional(),
}).strict();
const accessRevokedAudit = z.object({
  actorType: z.literal("service"), actorId: opaqueIdSchema,
  aggregateType: z.literal("access_grant"), aggregateId: opaqueIdSchema,
  eventType: z.literal("billing.access_revoked"), outcome: z.literal("succeeded"),
  fromStatus: z.literal("active"), toStatus: z.literal("revoked"),
  reasonCode: z.literal("test_revocation"), requestId: requestIdSchema,
  privacySafeMetadata: z.object({
    paymentId: opaqueIdSchema, caseId: opaqueIdSchema, test: z.literal(true),
  }).strict(),
  createdAt: z.date().optional(),
}).strict();
const questionnaireAnswerSavedAudit = z.object({
  actorType: z.literal("customer_session"), actorId: opaqueIdSchema,
  aggregateType: z.literal("questionnaire_draft"), aggregateId: opaqueIdSchema,
  eventType: z.literal("questionnaire.answer_saved"), outcome: z.literal("succeeded"),
  requestId: requestIdSchema, idempotencyKeyHash: hashSchema,
  privacySafeMetadata: z.object({
    caseId: opaqueIdSchema, questionId: opaqueIdSchema,
    draftRevision: positiveVersionSchema, visibleSetHash: hashSchema,
    activeAnsweredCount: z.number().int().min(0).max(63),
    requiredActiveCount: z.number().int().min(0).max(63),
    manualFollowUpRequired: z.boolean(), test: z.literal(true),
  }).strict(),
  createdAt: z.date().optional(),
}).strict();
const questionnaireSubmittedAudit = z.object({
  actorType: z.literal("customer_session"), actorId: opaqueIdSchema,
  aggregateType: z.literal("questionnaire_draft"), aggregateId: opaqueIdSchema,
  eventType: z.literal("questionnaire.submitted"), outcome: z.literal("succeeded"),
  requestId: requestIdSchema, idempotencyKeyHash: hashSchema,
  privacySafeMetadata: z.object({
    caseId: opaqueIdSchema, submissionId: opaqueIdSchema,
    submissionVersion: z.literal(1), inputSnapshotHash: hashSchema,
    activeAnsweredCount: z.number().int().min(0).max(63),
    requiredActiveCount: z.number().int().min(0).max(63),
    manualFollowUpRequired: z.boolean(), test: z.literal(true),
  }).strict(),
  createdAt: z.date().optional(),
}).strict();
const questionnaireAccessDeniedAudit = z.object({
  actorType: z.literal("customer_session"), actorId: opaqueIdSchema,
  aggregateType: z.literal("diagnostic_case"), aggregateId: z.literal("unresolved_case"),
  eventType: z.literal("questionnaire.access_denied"), outcome: z.literal("denied"),
  reasonCode: z.literal("owner_or_entitlement_miss"), requestId: requestIdSchema,
  privacySafeMetadata: z.object({
    resourceClass: z.literal("questionnaire"),
    action: z.enum(["get_draft", "save_answer", "submit"]),
  }).strict(),
  createdAt: z.date().optional(),
}).strict();
const ruleEvaluationStartedAudit = z.object({
  actorType: z.literal("service"), actorId: opaqueIdSchema,
  aggregateType: z.literal("questionnaire_rule_evaluation"), aggregateId: opaqueIdSchema,
  eventType: z.literal("rules_engine.evaluation_started"), outcome: z.literal("succeeded"),
  toStatus: z.literal("pending"), correlationId: opaqueIdSchema,
  privacySafeMetadata: z.object({
    caseId: opaqueIdSchema, submissionId: opaqueIdSchema, sourceOutboxEventId: opaqueIdSchema,
    submittedCaseStateVersion: positiveVersionSchema, rulesetId: opaqueIdSchema,
    rulesetHash: hashSchema, inputSnapshotHash: hashSchema, test: z.literal(true),
  }).strict(),
  createdAt: z.date().optional(),
}).strict();
const ruleEvaluationCompletedAudit = z.object({
  actorType: z.literal("service"), actorId: opaqueIdSchema,
  aggregateType: z.literal("questionnaire_rule_evaluation"), aggregateId: opaqueIdSchema,
  eventType: z.literal("rules_engine.evaluation_completed"), outcome: z.literal("succeeded"),
  fromStatus: z.literal("pending"),
  toStatus: z.enum(["succeeded", "manual_review_required"]), correlationId: opaqueIdSchema,
  privacySafeMetadata: z.object({
    caseId: opaqueIdSchema, submissionId: opaqueIdSchema, sourceOutboxEventId: opaqueIdSchema,
    submittedCaseStateVersion: positiveVersionSchema, rulesetId: opaqueIdSchema,
    rulesetHash: hashSchema, inputSnapshotHash: hashSchema, outcomeHash: hashSchema,
    manualReviewRequired: z.boolean(), test: z.literal(true),
  }).strict(),
  createdAt: z.date().optional(),
}).strict().superRefine((event, context) => {
  if (event.privacySafeMetadata.manualReviewRequired !== (event.toStatus === "manual_review_required")) {
    context.addIssue({ code: "custom", message: "Evaluation status and manual review flag differ" });
  }
});
const ruleEvaluationFailedAudit = z.object({
  actorType: z.literal("service"), actorId: opaqueIdSchema,
  aggregateType: z.literal("questionnaire_rule_evaluation"), aggregateId: opaqueIdSchema,
  eventType: z.literal("rules_engine.evaluation_failed"), outcome: z.literal("failed"),
  fromStatus: z.literal("pending"), toStatus: z.literal("failed"), correlationId: opaqueIdSchema,
  reasonCode: z.enum([
    "configuration_invalid", "input_inconsistent", "retry_exhausted", "technical_failure",
  ]),
  privacySafeMetadata: z.object({
    caseId: opaqueIdSchema, submissionId: opaqueIdSchema, sourceOutboxEventId: opaqueIdSchema,
    submittedCaseStateVersion: positiveVersionSchema, rulesetId: opaqueIdSchema,
    rulesetHash: hashSchema, inputSnapshotHash: hashSchema, test: z.literal(true),
  }).strict(),
  createdAt: z.date().optional(),
}).strict();
export const auditEventSchema = z.discriminatedUnion("eventType", [
  syntheticAudit, transitionAudit, adminListAudit, ownerDeniedAudit, reportAccessDeniedAudit,
  adminRoleDeniedAudit, adminPurposeDeniedAudit,
  magicLinkIssuedAudit, magicLinkConsumedAudit, customerSessionRevokedAudit, promoGrantedAudit,
  accessRevokedAudit, questionnaireAnswerSavedAudit, questionnaireSubmittedAudit,
  questionnaireAccessDeniedAudit, ruleEvaluationStartedAudit, ruleEvaluationCompletedAudit,
  ruleEvaluationFailedAudit,
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
const magicLinkDeliveryQueuedOutbox = z.object({
  aggregateType: z.literal("email_delivery"), aggregateId: opaqueIdSchema,
  eventType: z.literal("auth.magic_link_delivery_queued"),
  privacySafePayload: z.object({
    deliveryId: opaqueIdSchema, tokenId: opaqueIdSchema, identityId: opaqueIdSchema,
    keyVersion: positiveVersionSchema, windowMillis: z.number().int().positive(), test: z.literal(true),
  }).strict(),
  createdAt: z.date().optional(),
}).strict();
const promoGrantedOutbox = z.object({
  aggregateType: z.literal("payment_record"), aggregateId: opaqueIdSchema,
  eventType: z.literal("billing.promo_granted"),
  privacySafePayload: z.object({
    paymentId: opaqueIdSchema, caseId: opaqueIdSchema, grantId: opaqueIdSchema,
    tariffCode: z.literal("lexy-advanced-diagnostic"), chargedAmount: z.literal(0),
    currency: z.literal("RUB"), campaignId: opaqueIdSchema, test: z.literal(true),
  }).strict(),
  createdAt: z.date().optional(),
}).strict();
const accessRevokedOutbox = z.object({
  aggregateType: z.literal("access_grant"), aggregateId: opaqueIdSchema,
  eventType: z.literal("billing.access_revoked"),
  privacySafePayload: z.object({
    grantId: opaqueIdSchema, paymentId: opaqueIdSchema, caseId: opaqueIdSchema,
    reasonCode: z.literal("test_revocation"), test: z.literal(true),
  }).strict(),
  createdAt: z.date().optional(),
}).strict();
const questionnaireSubmittedForScoringOutbox = z.object({
  aggregateType: z.literal("questionnaire_submission"), aggregateId: opaqueIdSchema,
  eventType: z.literal("questionnaire.submitted_for_scoring"),
  privacySafePayload: z.object({
    caseId: opaqueIdSchema, submissionId: opaqueIdSchema,
    submissionVersion: z.literal(1), inputSnapshotHash: hashSchema,
    submittedCaseStateVersion: positiveVersionSchema,
    legalCoreReleaseId: opaqueIdSchema, legalCoreVersion: versionSchema,
    rulesetId: opaqueIdSchema, rulesetBundleHash: hashSchema,
    test: z.literal(true),
  }).strict(),
  createdAt: z.date().optional(),
}).strict();
export const outboxEventSchema = z.discriminatedUnion("eventType", [
  syntheticOutbox, transitionOutbox, magicLinkDeliveryQueuedOutbox, promoGrantedOutbox,
  accessRevokedOutbox, questionnaireSubmittedForScoringOutbox,
]);
export type AppendOutboxEvent = z.infer<typeof outboxEventSchema>;

const generatedAuditEnvelopeSchema = z.object({ id: opaqueIdSchema }).strict();
const generatedOutboxEnvelopeSchema = z.object({
  id: opaqueIdSchema, eventId: opaqueIdSchema,
  dedupeKey: z.string().max(128).regex(/^(?:(?:case-created|case-transition):[A-Za-z0-9][A-Za-z0-9_-]*:v[1-9][0-9]*|magic-link-delivery:[A-Za-z0-9][A-Za-z0-9_-]*:[1-9][0-9]*:v1|promo-payment:[A-Za-z0-9][A-Za-z0-9_-]*:v1|access-revocation:[A-Za-z0-9][A-Za-z0-9_-]*:v1|questionnaire-submission:[A-Za-z0-9][A-Za-z0-9_-]*:v1)$/),
  status: z.literal("pending"), attemptCount: z.literal(0), updatedAt: z.date(),
}).strict();

export function outboxDedupeKey(event: AppendOutboxEvent): string {
  if (event.eventType === "auth.magic_link_delivery_queued") {
    return `magic-link-delivery:${event.privacySafePayload.identityId}:${event.privacySafePayload.windowMillis}:v1`;
  }
  if (event.eventType === "billing.promo_granted") {
    return `promo-payment:${event.privacySafePayload.paymentId}:v1`;
  }
  if (event.eventType === "billing.access_revoked") {
    return `access-revocation:${event.privacySafePayload.grantId}:v1`;
  }
  if (event.eventType === "questionnaire.submitted_for_scoring") {
    return `questionnaire-submission:${event.privacySafePayload.submissionId}:v1`;
  }
  const prefix = event.eventType === "diagnostic_case.synthetic_created" ? "case-created" : "case-transition";
  return `${prefix}:${event.aggregateId}:v${event.privacySafePayload.stateVersion}`;
}
export function parseAuditEvent(value: unknown): AppendAuditEvent {
  return auditEventSchema.parse(value);
}
export function parseOutboxEvent(value: unknown): AppendOutboxEvent {
  const event = outboxEventSchema.parse(value);
  const payloadAggregateId = event.eventType === "auth.magic_link_delivery_queued"
    ? event.privacySafePayload.deliveryId
    : event.eventType === "billing.promo_granted"
      ? event.privacySafePayload.paymentId
      : event.eventType === "billing.access_revoked"
        ? event.privacySafePayload.grantId
        : event.eventType === "questionnaire.submitted_for_scoring"
          ? event.privacySafePayload.submissionId
          : event.privacySafePayload.caseId;
  if (event.aggregateId !== payloadAggregateId) {
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
