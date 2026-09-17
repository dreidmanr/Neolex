import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  json,
  bigint,
  foreignKey,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Free diagnostic sessions
export const diagnosticSessions = mysqlTable("diagnostic_sessions", {
  id: int("id").autoincrement().primaryKey(),
  sessionToken: varchar("sessionToken", { length: 128 }).notNull().unique(),
  status: mysqlEnum("status", ["started", "consented", "contact_collected", "in_progress", "completed"]).default("started").notNull(),
  riskCategory: mysqlEnum("riskCategory", ["low", "moderate", "high", "critical"]),
  totalScore: int("totalScore"),
  hasCriticalEvent: boolean("hasCriticalEvent").default(false),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DiagnosticSession = typeof diagnosticSessions.$inferSelect;
export type InsertDiagnosticSession = typeof diagnosticSessions.$inferInsert;

// Contact information collected before questionnaire
export const contacts = mysqlTable("contacts", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 64 }),
  productName: varchar("productName", { length: 255 }),
  website: varchar("website", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = typeof contacts.$inferInsert;

// Consent records
export const consentRecords = mysqlTable("consent_records", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  consentType: mysqlEnum("consentType", ["user_agreement", "marketing"]).notNull(),
  accepted: boolean("accepted").notNull(),
  documentVersion: varchar("documentVersion", { length: 32 }).notNull(),
  acceptedAt: timestamp("acceptedAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ConsentRecord = typeof consentRecords.$inferSelect;
export type InsertConsentRecord = typeof consentRecords.$inferInsert;

// Questionnaire answers (free diagnostic)
export const questionnaireAnswers = mysqlTable("questionnaire_answers", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  questionId: varchar("questionId", { length: 64 }).notNull(),
  answerId: varchar("answerId", { length: 64 }).notNull(),
  answerIds: json("answerIds"),
  answerText: text("answerText"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type QuestionnaireAnswer = typeof questionnaireAnswers.$inferSelect;
export type InsertQuestionnaireAnswer = typeof questionnaireAnswers.$inferInsert;

// Scoring results (free diagnostic)
export const scoringResults = mysqlTable("scoring_results", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull().unique(),
  riskCategory: mysqlEnum("riskCategory", ["low", "moderate", "high", "critical"]).notNull(),
  totalScore: int("totalScore").notNull(),
  hasCriticalEvent: boolean("hasCriticalEvent").default(false).notNull(),
  criticalEvents: json("criticalEvents"),
  significantRisks: json("significantRisks"),
  riskBlocks: json("riskBlocks"),
  mainConclusion: text("mainConclusion"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ScoringResult = typeof scoringResults.$inferSelect;
export type InsertScoringResult = typeof scoringResults.$inferInsert;

// ─── PAID DIAGNOSTIC ──────────────────────────────────────────────────────────

// Paid diagnostic sessions
export const paidSessions = mysqlTable("paid_sessions", {
  id: int("id").autoincrement().primaryKey(),
  sessionToken: varchar("sessionToken", { length: 128 }).notNull().unique(),
  // Link to free session if user came from free flow
  freeSessionId: int("freeSessionId"),
  // Contact info (denormalized for convenience)
  contactName: varchar("contactName", { length: 255 }),
  contactEmail: varchar("contactEmail", { length: 320 }).notNull(),
  productName: varchar("productName", { length: 255 }),
  website: varchar("website", { length: 512 }),
  // Payment
  paymentStatus: mysqlEnum("paymentStatus", ["pending", "paid", "failed", "refunded"]).default("pending").notNull(),
  paymentAmount: int("paymentAmount").default(0),
  paymentProvider: varchar("paymentProvider", { length: 64 }),
  paymentId: varchar("paymentId", { length: 255 }),
  paidAt: timestamp("paidAt"),
  // Progress
  status: mysqlEnum("status", [
    "created",
    "payment_pending",
    "paid",
    "in_progress",
    "completed",
    "report_ready"
  ]).default("created").notNull(),
  currentBlock: int("currentBlock").default(1),
  currentQuestion: int("currentQuestion").default(0),
  anketaVersion: varchar("anketaVersion", { length: 16 }).default("v1").notNull(),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  reportGeneratedAt: timestamp("reportGeneratedAt"),
  // Risk profile
  riskCategory: mysqlEnum("riskCategory", ["low", "moderate", "high", "critical"]),
  criticalTriggers: json("criticalTriggers"),
  // Service fields
  userGoals: json("userGoals"),
  urgencyDeadline: varchar("urgencyDeadline", { length: 255 }),
  criticalQuestion: text("criticalQuestion"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PaidSession = typeof paidSessions.$inferSelect;
export type InsertPaidSession = typeof paidSessions.$inferInsert;

// Paid diagnostic answers (one row per question)
export const paidAnswers = mysqlTable("paid_answers", {
  id: int("id").autoincrement().primaryKey(),
  paidSessionId: int("paidSessionId").notNull(),
  blockId: int("blockId").notNull(),
  questionId: varchar("questionId", { length: 64 }).notNull(),
  answerType: mysqlEnum("answerType", ["single", "multi", "text", "file"]).notNull(),
  answerId: varchar("answerId", { length: 64 }),
  answerIds: json("answerIds"),
  answerText: text("answerText"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PaidAnswer = typeof paidAnswers.$inferSelect;
export type InsertPaidAnswer = typeof paidAnswers.$inferInsert;

// Uploaded documents for paid diagnostic
export const paidDocuments = mysqlTable("paid_documents", {
  id: int("id").autoincrement().primaryKey(),
  paidSessionId: int("paidSessionId").notNull(),
  blockId: int("blockId"),
  questionId: varchar("questionId", { length: 64 }),
  fileName: varchar("fileName", { length: 512 }).notNull(),
  fileSize: bigint("fileSize", { mode: "number" }),
  mimeType: varchar("mimeType", { length: 128 }),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  storageUrl: varchar("storageUrl", { length: 1024 }).notNull(),
  documentCategory: varchar("documentCategory", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PaidDocument = typeof paidDocuments.$inferSelect;
export type InsertPaidDocument = typeof paidDocuments.$inferInsert;

// Paid diagnostic report (generated by AI)
export const paidReports = mysqlTable("paid_reports", {
  id: int("id").autoincrement().primaryKey(),
  paidSessionId: int("paidSessionId").notNull().unique(),
  riskCategory: mysqlEnum("riskCategory", ["low", "moderate", "high", "critical"]).notNull(),
  // Full report sections stored as JSON
  keyFindings: json("keyFindings"),
  scopeAndLimitations: json("scopeAndLimitations"),
  factualInputs: json("factualInputs"),
  riskMap: json("riskMap"),
  riskBlocks: json("riskBlocks"),
  missingDocuments: json("missingDocuments"),
  financialConsequences: json("financialConsequences"),
  roadmap: json("roadmap"),
  nextStep: json("nextStep"),
  // Full report as markdown text for display
  reportMarkdown: text("reportMarkdown"),
  // Service
  criticalTriggers: json("criticalTriggers"),
  totalRiskScore: int("totalRiskScore"),
  generationModel: varchar("generationModel", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PaidReport = typeof paidReports.$inferSelect;
export type InsertPaidReport = typeof paidReports.$inferInsert;

// Paid consent records
export const paidConsentRecords = mysqlTable("paid_consent_records", {
  id: int("id").autoincrement().primaryKey(),
  paidSessionId: int("paidSessionId").notNull(),
  consentType: mysqlEnum("consentType", ["user_agreement", "marketing", "data_processing"]).notNull(),
  accepted: boolean("accepted").notNull(),
  documentVersion: varchar("documentVersion", { length: 32 }).notNull(),
  acceptedAt: timestamp("acceptedAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PaidConsentRecord = typeof paidConsentRecords.$inferSelect;
export type InsertPaidConsentRecord = typeof paidConsentRecords.$inferInsert;

// ── Feedback (post-diagnostic survey) ──────────────────────────────────────
export const feedbacks = mysqlTable("feedbacks", {
  id: int("id").autoincrement().primaryKey(),
  sessionToken: varchar("sessionToken", { length: 64 }),
  rating: int("rating").notNull(), // 1-5
  usefulnessRating: int("usefulnessRating"), // 1-5, optional
  wouldRecommend: boolean("wouldRecommend"),
  comment: text("comment"),
  foundAccurate: boolean("foundAccurate"),
  interestedInPaid: boolean("interestedInPaid"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Feedback = typeof feedbacks.$inferSelect;
export type InsertFeedback = typeof feedbacks.$inferInsert;

// ── RELEASE 1 V2 ACCESS CONTROL FOUNDATION ─────────────────────────────────
// All v2 identifiers are application-generated opaque values. Legacy tables
// above intentionally remain unchanged and are never used as v2 credentials.

export const customerAccounts = mysqlTable("customer_accounts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  status: mysqlEnum("status", ["active", "suspended", "closed"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("customer_accounts_status_updated_idx").on(table.status, table.updatedAt),
]);

export type CustomerAccount = typeof customerAccounts.$inferSelect;
export type InsertCustomerAccount = typeof customerAccounts.$inferInsert;

export const customerAccountIdentities = mysqlTable("customer_account_identities", {
  id: varchar("id", { length: 64 }).primaryKey(),
  customerAccountId: varchar("customerAccountId", { length: 64 }).notNull(),
  identityType: mysqlEnum("identityType", ["email"]).notNull(),
  identityHash: varchar("identityHash", { length: 128 }).notNull(),
  status: mysqlEnum("status", ["active", "revoked"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
}, (table) => [
  foreignKey({
    columns: [table.customerAccountId],
    foreignColumns: [customerAccounts.id],
    name: "fk_customer_identity_account",
  }).onDelete("restrict").onUpdate("restrict"),
  uniqueIndex("customer_account_identities_type_hash_uq").on(table.identityType, table.identityHash),
  index("customer_account_identities_account_status_idx").on(table.customerAccountId, table.status),
]);

export type CustomerAccountIdentity = typeof customerAccountIdentities.$inferSelect;
export type InsertCustomerAccountIdentity = typeof customerAccountIdentities.$inferInsert;

export const customerSessions = mysqlTable("customer_sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  customerAccountId: varchar("customerAccountId", { length: 64 }).notNull(),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull(),
  status: mysqlEnum("status", ["active", "revoked", "expired"]).default("active").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  revokedAt: timestamp("revokedAt"),
  revocationReasonCode: varchar("revocationReasonCode", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.customerAccountId],
    foreignColumns: [customerAccounts.id],
    name: "fk_customer_session_account",
  }).onDelete("restrict").onUpdate("restrict"),
  uniqueIndex("customer_sessions_token_hash_uq").on(table.tokenHash),
  uniqueIndex("customer_sessions_id_account_uq").on(
    table.id,
    table.customerAccountId,
  ),
  index("customer_sessions_account_status_expiry_idx").on(table.customerAccountId, table.status, table.expiresAt),
]);

export type CustomerSession = typeof customerSessions.$inferSelect;
export type InsertCustomerSession = typeof customerSessions.$inferInsert;

export const diagnosticCases = mysqlTable("diagnostic_cases", {
  id: varchar("id", { length: 64 }).primaryKey(),
  publicId: varchar("publicId", { length: 64 }).notNull(),
  customerAccountId: varchar("customerAccountId", { length: 64 }).notNull(),
  serviceTier: varchar("serviceTier", { length: 64 }).notNull(),
  status: mysqlEnum("status", [
    "draft",
    "access_granted",
    "in_progress",
    "submitted",
    "scoring",
    "manual_review_required",
    "report_ready",
    "failed",
    "archived",
  ]).default("draft").notNull(),
  stateVersion: int("stateVersion").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.customerAccountId],
    foreignColumns: [customerAccounts.id],
    name: "fk_diagnostic_case_account",
  }).onDelete("restrict").onUpdate("restrict"),
  uniqueIndex("diagnostic_cases_public_id_uq").on(table.publicId),
  uniqueIndex("diagnostic_cases_id_account_uq").on(table.id, table.customerAccountId),
  index("diagnostic_cases_owner_status_updated_idx").on(table.customerAccountId, table.status, table.updatedAt),
]);

export type DiagnosticCase = typeof diagnosticCases.$inferSelect;
export type InsertDiagnosticCase = typeof diagnosticCases.$inferInsert;

export const idempotencyRecords = mysqlTable("idempotency_records", {
  id: varchar("id", { length: 64 }).primaryKey(),
  customerAccountId: varchar("customerAccountId", { length: 64 }).notNull(),
  scope: varchar("scope", { length: 64 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  requestHash: varchar("requestHash", { length: 128 }).notNull(),
  status: mysqlEnum("status", ["pending", "completed", "failed"]).default("pending").notNull(),
  responseJson: json("responseJson"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.customerAccountId],
    foreignColumns: [customerAccounts.id],
    name: "fk_idempotency_account",
  }).onDelete("restrict").onUpdate("restrict"),
  uniqueIndex("idempotency_records_account_scope_key_uq").on(
    table.customerAccountId,
    table.scope,
    table.idempotencyKey,
  ),
  index("idempotency_records_expiry_idx").on(table.expiresAt),
]);

export type IdempotencyRecord = typeof idempotencyRecords.$inferSelect;
export type InsertIdempotencyRecord = typeof idempotencyRecords.$inferInsert;

export const auditEvents = mysqlTable("audit_events", {
  id: varchar("id", { length: 64 }).primaryKey(),
  actorType: mysqlEnum("actorType", ["customer_account", "customer_session", "admin_user", "service", "migration"]).notNull(),
  actorId: varchar("actorId", { length: 64 }).notNull(),
  aggregateType: varchar("aggregateType", { length: 64 }).notNull(),
  aggregateId: varchar("aggregateId", { length: 64 }).notNull(),
  eventType: varchar("eventType", { length: 128 }).notNull(),
  fromStatus: varchar("fromStatus", { length: 64 }),
  toStatus: varchar("toStatus", { length: 64 }),
  outcome: mysqlEnum("outcome", ["succeeded", "denied", "failed"]).notNull(),
  reasonCode: varchar("reasonCode", { length: 64 }),
  requestId: varchar("requestId", { length: 64 }),
  correlationId: varchar("correlationId", { length: 64 }),
  idempotencyKeyHash: varchar("idempotencyKeyHash", { length: 128 }),
  privacySafeMetadata: json("privacySafeMetadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("audit_events_aggregate_created_idx").on(table.aggregateType, table.aggregateId, table.createdAt),
  index("audit_events_actor_created_idx").on(table.actorType, table.actorId, table.createdAt),
  index("audit_events_event_created_idx").on(table.eventType, table.createdAt),
]);

export type AuditEvent = typeof auditEvents.$inferSelect;
export type InsertAuditEvent = typeof auditEvents.$inferInsert;

export const outboxEvents = mysqlTable("outbox_events", {
  id: varchar("id", { length: 64 }).primaryKey(),
  eventId: varchar("eventId", { length: 64 }).notNull(),
  dedupeKey: varchar("dedupeKey", { length: 128 }).notNull(),
  aggregateType: varchar("aggregateType", { length: 64 }).notNull(),
  aggregateId: varchar("aggregateId", { length: 64 }).notNull(),
  eventType: varchar("eventType", { length: 128 }).notNull(),
  privacySafePayload: json("privacySafePayload"),
  status: mysqlEnum("status", ["pending", "processing", "published", "failed", "cancelled"]).default("pending").notNull(),
  attemptCount: int("attemptCount").default(0).notNull(),
  leaseOwner: varchar("leaseOwner", { length: 64 }),
  leaseVersion: int("leaseVersion").default(0).notNull(),
  leaseExpiresAt: timestamp("leaseExpiresAt"),
  nextAttemptAt: timestamp("nextAttemptAt"),
  lastAttemptAt: timestamp("lastAttemptAt"),
  publishedAt: timestamp("publishedAt"),
  lastErrorCode: varchar("lastErrorCode", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("outbox_events_event_id_uq").on(table.eventId),
  uniqueIndex("outbox_events_dedupe_key_uq").on(table.dedupeKey),
  index("outbox_events_status_next_attempt_idx").on(table.status, table.nextAttemptAt),
  index("outbox_events_lease_expiry_idx").on(table.leaseExpiresAt),
  index("outbox_events_aggregate_created_idx").on(table.aggregateType, table.aggregateId, table.createdAt),
  check("chk_outbox_event_attempt_count_nonnegative", sql`${table.attemptCount} >= 0`),
  check("chk_outbox_event_lease_version_nonnegative", sql`${table.leaseVersion} >= 0`),
  check(
    "chk_outbox_event_lease_lifecycle",
    sql`(
      (${table.status} = 'processing' AND ${table.leaseOwner} IS NOT NULL AND ${table.leaseExpiresAt} IS NOT NULL)
      OR (${table.status} <> 'processing' AND ${table.leaseOwner} IS NULL AND ${table.leaseExpiresAt} IS NULL)
    )`,
  ),
]);

export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type InsertOutboxEvent = typeof outboxEvents.$inferInsert;

export const migrationRuns = mysqlTable("migration_runs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  phase: varchar("phase", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["planned", "running", "succeeded", "failed", "cancelled"]).default("planned").notNull(),
  dryRun: boolean("dryRun").default(true).notNull(),
  sourceCount: int("sourceCount").default(0).notNull(),
  targetCount: int("targetCount").default(0).notNull(),
  matchedCount: int("matchedCount").default(0).notNull(),
  anomalyCount: int("anomalyCount").default(0).notNull(),
  sourceManifestHash: varchar("sourceManifestHash", { length: 128 }),
  targetManifestHash: varchar("targetManifestHash", { length: 128 }),
  correlationId: varchar("correlationId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("migration_runs_status_created_idx").on(table.status, table.createdAt),
  index("migration_runs_phase_created_idx").on(table.phase, table.createdAt),
]);

export type MigrationRun = typeof migrationRuns.$inferSelect;
export type InsertMigrationRun = typeof migrationRuns.$inferInsert;

export const legacyOwnershipCases = mysqlTable("legacy_ownership_cases", {
  id: varchar("id", { length: 64 }).primaryKey(),
  sourceTable: varchar("sourceTable", { length: 64 }).notNull(),
  sourcePrimaryKey: varchar("sourcePrimaryKey", { length: 128 }).notNull(),
  status: mysqlEnum("status", [
    "unassigned",
    "claim_pending",
    "claimed",
    "quarantined",
    "manual_review",
    "excluded_by_retention",
    "migration_error",
  ]).default("unassigned").notNull(),
  customerAccountId: varchar("customerAccountId", { length: 64 }),
  permittedClaimChannel: varchar("permittedClaimChannel", { length: 64 }),
  claimEvidenceReference: varchar("claimEvidenceReference", { length: 128 }),
  decisionActorId: varchar("decisionActorId", { length: 64 }),
  reasonCode: varchar("reasonCode", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  decidedAt: timestamp("decidedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.customerAccountId],
    foreignColumns: [customerAccounts.id],
    name: "fk_legacy_ownership_account",
  }).onDelete("restrict").onUpdate("restrict"),
  uniqueIndex("legacy_ownership_cases_source_uq").on(table.sourceTable, table.sourcePrimaryKey),
  index("legacy_ownership_cases_status_created_idx").on(table.status, table.createdAt),
  index("legacy_ownership_cases_account_status_idx").on(table.customerAccountId, table.status),
]);

export type LegacyOwnershipCase = typeof legacyOwnershipCases.$inferSelect;
export type InsertLegacyOwnershipCase = typeof legacyOwnershipCases.$inferInsert;

export const legacyResourceLinks = mysqlTable("legacy_resource_links", {
  id: varchar("id", { length: 64 }).primaryKey(),
  sourceTable: varchar("sourceTable", { length: 64 }).notNull(),
  sourcePrimaryKey: varchar("sourcePrimaryKey", { length: 128 }).notNull(),
  targetType: varchar("targetType", { length: 64 }).notNull(),
  targetId: varchar("targetId", { length: 64 }).notNull(),
  phase: varchar("phase", { length: 64 }).notNull(),
  mappingVersion: varchar("mappingVersion", { length: 64 }).notNull(),
  migrationRunId: varchar("migrationRunId", { length: 64 }),
  correlationId: varchar("correlationId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.migrationRunId],
    foreignColumns: [migrationRuns.id],
    name: "fk_legacy_link_migration_run",
  }).onDelete("restrict").onUpdate("restrict"),
  uniqueIndex("legacy_resource_links_source_target_type_uq").on(
    table.sourceTable,
    table.sourcePrimaryKey,
    table.targetType,
  ),
  index("legacy_resource_links_target_idx").on(table.targetType, table.targetId),
  index("legacy_resource_links_run_idx").on(table.migrationRunId),
]);

export type LegacyResourceLink = typeof legacyResourceLinks.$inferSelect;
export type InsertLegacyResourceLink = typeof legacyResourceLinks.$inferInsert;

export const migrationReconciliationRecords = mysqlTable("migration_reconciliation_records", {
  id: varchar("id", { length: 64 }).primaryKey(),
  migrationRunId: varchar("migrationRunId", { length: 64 }).notNull(),
  resourceType: varchar("resourceType", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["pending", "matched", "mismatch", "failed"]).default("pending").notNull(),
  dryRun: boolean("dryRun").default(true).notNull(),
  sourceCount: int("sourceCount").default(0).notNull(),
  targetCount: int("targetCount").default(0).notNull(),
  matchedCount: int("matchedCount").default(0).notNull(),
  missingCount: int("missingCount").default(0).notNull(),
  duplicateCount: int("duplicateCount").default(0).notNull(),
  orphanCount: int("orphanCount").default(0).notNull(),
  sourceHash: varchar("sourceHash", { length: 128 }),
  targetHash: varchar("targetHash", { length: 128 }),
  summaryHash: varchar("summaryHash", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
}, (table) => [
  foreignKey({
    columns: [table.migrationRunId],
    foreignColumns: [migrationRuns.id],
    name: "fk_migration_recon_run",
  }).onDelete("restrict").onUpdate("restrict"),
  uniqueIndex("migration_reconciliation_records_run_resource_uq").on(table.migrationRunId, table.resourceType),
  index("migration_reconciliation_records_status_created_idx").on(table.status, table.createdAt),
]);

export type MigrationReconciliationRecord = typeof migrationReconciliationRecords.$inferSelect;
export type InsertMigrationReconciliationRecord = typeof migrationReconciliationRecords.$inferInsert;

// ── RELEASE 1 V2 MAGIC LINK ──────────────────────────────────────────────────
// Delivery and rate-limit records contain only opaque identifiers and hashes.
// Raw email addresses, tokens, URLs, and message bodies are never persisted.

export const magicLinkTokens = mysqlTable("magic_link_tokens", {
  id: varchar("id", { length: 64 }).primaryKey(),
  customerAccountIdentityId: varchar("customerAccountIdentityId", { length: 64 }).notNull(),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull(),
  requestScope: mysqlEnum("requestScope", ["magic_login"]).notNull(),
  tokenKeyVersion: int("tokenKeyVersion").notNull(),
  status: mysqlEnum("status", ["active", "consumed", "revoked", "expired"]).default("active").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  consumedAt: timestamp("consumedAt"),
  revokedAt: timestamp("revokedAt"),
  revocationReasonCode: varchar("revocationReasonCode", { length: 64 }),
  consumedByCustomerSessionId: varchar("consumedByCustomerSessionId", { length: 64 }),
  correlationId: varchar("correlationId", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.customerAccountIdentityId],
    foreignColumns: [customerAccountIdentities.id],
    name: "fk_magic_token_identity",
  }).onDelete("restrict").onUpdate("restrict"),
  foreignKey({
    columns: [table.consumedByCustomerSessionId],
    foreignColumns: [customerSessions.id],
    name: "fk_magic_token_session",
  }).onDelete("restrict").onUpdate("restrict"),
  uniqueIndex("magic_link_tokens_token_hash_uq").on(table.tokenHash),
  uniqueIndex("magic_link_tokens_session_uq").on(table.consumedByCustomerSessionId),
  uniqueIndex("magic_link_tokens_id_identity_uq").on(table.id, table.customerAccountIdentityId),
  index("magic_link_tokens_identity_status_expiry_idx").on(
    table.customerAccountIdentityId,
    table.status,
    table.expiresAt,
  ),
]);

export type MagicLinkToken = typeof magicLinkTokens.$inferSelect;
export type InsertMagicLinkToken = typeof magicLinkTokens.$inferInsert;

export const emailDeliveries = mysqlTable("email_deliveries", {
  id: varchar("id", { length: 64 }).primaryKey(),
  magicLinkTokenId: varchar("magicLinkTokenId", { length: 64 }).notNull(),
  customerAccountIdentityId: varchar("customerAccountIdentityId", { length: 64 }).notNull(),
  deliveryKind: varchar("deliveryKind", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["queued", "sending", "sent", "failed", "suppressed"]).default("queued").notNull(),
  dedupeKey: varchar("dedupeKey", { length: 128 }).notNull(),
  attemptCount: int("attemptCount").default(0).notNull(),
  leaseOwner: varchar("leaseOwner", { length: 64 }),
  leaseVersion: int("leaseVersion").default(0).notNull(),
  leaseExpiresAt: timestamp("leaseExpiresAt"),
  nextAttemptAt: timestamp("nextAttemptAt"),
  lastAttemptAt: timestamp("lastAttemptAt"),
  sentAt: timestamp("sentAt"),
  terminalAt: timestamp("terminalAt"),
  lastErrorCode: varchar("lastErrorCode", { length: 64 }),
  templateVersion: varchar("templateVersion", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.magicLinkTokenId, table.customerAccountIdentityId],
    foreignColumns: [magicLinkTokens.id, magicLinkTokens.customerAccountIdentityId],
    name: "fk_email_delivery_token_identity",
  }).onDelete("restrict").onUpdate("restrict"),
  uniqueIndex("email_deliveries_token_uq").on(table.magicLinkTokenId),
  uniqueIndex("email_deliveries_dedupe_key_uq").on(table.dedupeKey),
  index("email_deliveries_status_next_idx").on(table.status, table.nextAttemptAt),
  index("email_deliveries_lease_expiry_idx").on(table.leaseExpiresAt),
  index("email_deliveries_identity_created_idx").on(table.customerAccountIdentityId, table.createdAt),
]);

export type EmailDelivery = typeof emailDeliveries.$inferSelect;
export type InsertEmailDelivery = typeof emailDeliveries.$inferInsert;

export const authRateLimitBuckets = mysqlTable("auth_rate_limit_buckets", {
  id: varchar("id", { length: 64 }).primaryKey(),
  scope: varchar("scope", { length: 64 }).notNull(),
  bucketHash: varchar("bucketHash", { length: 128 }).notNull(),
  windowStartedAt: timestamp("windowStartedAt").notNull(),
  count: int("count").default(0).notNull(),
  blockedUntil: timestamp("blockedUntil"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("auth_rate_limit_scope_bucket_window_uq").on(
    table.scope,
    table.bucketHash,
    table.windowStartedAt,
  ),
  index("auth_rate_limit_buckets_expiry_idx").on(table.expiresAt),
]);

export type AuthRateLimitBucket = typeof authRateLimitBuckets.$inferSelect;
export type InsertAuthRateLimitBucket = typeof authRateLimitBuckets.$inferInsert;

// ── RELEASE 1 V2 PROMO ACCESS ─────────────────────────────────────────────────
// Tariff provenance, consent assertions, promo redemption records, and access
// grants are append-only records. They contain no provider or legal prose.

export const tariffSnapshots = mysqlTable("tariff_snapshots", {
  id: varchar("id", { length: 64 }).primaryKey(),
  tariffCode: varchar("tariffCode", { length: 64 }).notNull(),
  serviceTier: varchar("serviceTier", { length: 64 }).notNull(),
  provenanceStatus: mysqlEnum("provenanceStatus", ["draft_test_only"]).notNull(),
  catalogVersion: varchar("catalogVersion", { length: 64 }).notNull(),
  currency: mysqlEnum("currency", ["RUB"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TariffSnapshot = typeof tariffSnapshots.$inferSelect;
export type InsertTariffSnapshot = typeof tariffSnapshots.$inferInsert;

export const caseConsents = mysqlTable("case_consents", {
  id: varchar("id", { length: 64 }).primaryKey(),
  customerAccountId: varchar("customerAccountId", { length: 64 }).notNull(),
  diagnosticCaseId: varchar("diagnosticCaseId", { length: 64 }).notNull(),
  documentId: varchar("documentId", { length: 64 }).notNull(),
  documentVersion: varchar("documentVersion", { length: 64 }).notNull(),
  contentHash: varchar("contentHash", { length: 64 }).notNull(),
  consentType: mysqlEnum("consentType", ["terms", "data_processing", "marketing"]).notNull(),
  accepted: boolean("accepted").notNull(),
  actorCustomerSessionId: varchar("actorCustomerSessionId", { length: 64 }).notNull(),
  acceptedAt: timestamp("acceptedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.diagnosticCaseId, table.customerAccountId],
    foreignColumns: [diagnosticCases.id, diagnosticCases.customerAccountId],
    name: "fk_case_consent_case_owner",
  }).onDelete("restrict").onUpdate("restrict"),
  foreignKey({
    columns: [table.actorCustomerSessionId, table.customerAccountId],
    foreignColumns: [customerSessions.id, customerSessions.customerAccountId],
    name: "fk_case_consent_actor_owner",
  }).onDelete("restrict").onUpdate("restrict"),
  uniqueIndex("case_consents_assertion_uq").on(
    table.diagnosticCaseId,
    table.documentId,
    table.documentVersion,
    table.consentType,
    table.actorCustomerSessionId,
  ),
  index("case_consents_owner_case_accepted_idx").on(
    table.customerAccountId,
    table.diagnosticCaseId,
    table.accepted,
  ),
  index("case_consents_actor_idx").on(table.actorCustomerSessionId),
]);

export type CaseConsent = typeof caseConsents.$inferSelect;
export type InsertCaseConsent = typeof caseConsents.$inferInsert;

export const paymentRecords = mysqlTable("payment_records", {
  id: varchar("id", { length: 64 }).primaryKey(),
  customerAccountId: varchar("customerAccountId", { length: 64 }).notNull(),
  diagnosticCaseId: varchar("diagnosticCaseId", { length: 64 }).notNull(),
  tariffSnapshotId: varchar("tariffSnapshotId", { length: 64 }).notNull(),
  tariffCode: varchar("tariffCode", { length: 64 }).notNull(),
  campaignId: varchar("campaignId", { length: 64 }).notNull(),
  sourceType: mysqlEnum("sourceType", ["promo"]).notNull(),
  status: mysqlEnum("status", ["promo_granted"]).notNull(),
  chargedAmount: int("chargedAmount").default(0).notNull(),
  currency: mysqlEnum("currency", ["RUB"]).notNull(),
  correlationId: varchar("correlationId", { length: 64 }).notNull(),
  grantedAt: timestamp("grantedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.diagnosticCaseId, table.customerAccountId],
    foreignColumns: [diagnosticCases.id, diagnosticCases.customerAccountId],
    name: "fk_payment_record_case_owner",
  }).onDelete("restrict").onUpdate("restrict"),
  foreignKey({
    columns: [table.tariffSnapshotId],
    foreignColumns: [tariffSnapshots.id],
    name: "fk_payment_record_tariff_snapshot",
  }).onDelete("restrict").onUpdate("restrict"),
  uniqueIndex("payment_records_redemption_scope_uq").on(
    table.customerAccountId,
    table.campaignId,
    table.tariffCode,
  ),
  uniqueIndex("payment_records_id_account_case_uq").on(
    table.id,
    table.customerAccountId,
    table.diagnosticCaseId,
  ),
  index("payment_records_owner_case_idx").on(table.customerAccountId, table.diagnosticCaseId),
  check("chk_payment_records_zero_charge", sql`${table.chargedAmount} = 0`),
]);

export type PaymentRecord = typeof paymentRecords.$inferSelect;
export type InsertPaymentRecord = typeof paymentRecords.$inferInsert;

export const accessGrants = mysqlTable("access_grants", {
  id: varchar("id", { length: 64 }).primaryKey(),
  customerAccountId: varchar("customerAccountId", { length: 64 }).notNull(),
  diagnosticCaseId: varchar("diagnosticCaseId", { length: 64 }).notNull(),
  paymentRecordId: varchar("paymentRecordId", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["active", "revoked", "expired"]).notNull(),
  grantedAt: timestamp("grantedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
  revokedAt: timestamp("revokedAt"),
  revocationReasonCode: varchar("revocationReasonCode", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.paymentRecordId, table.customerAccountId, table.diagnosticCaseId],
    foreignColumns: [paymentRecords.id, paymentRecords.customerAccountId, paymentRecords.diagnosticCaseId],
    name: "fk_access_grant_payment_owner_case",
  }).onDelete("restrict").onUpdate("restrict"),
  uniqueIndex("access_grants_case_payment_uq").on(table.diagnosticCaseId, table.paymentRecordId),
  uniqueIndex("access_grants_payment_record_uq").on(table.paymentRecordId),
  index("access_grants_owner_case_status_expiry_idx").on(
    table.customerAccountId,
    table.diagnosticCaseId,
    table.status,
    table.expiresAt,
  ),
]);

export type AccessGrant = typeof accessGrants.$inferSelect;
export type InsertAccessGrant = typeof accessGrants.$inferInsert;

// ── RELEASE 1 V2 QUESTIONNAIRE PERSISTENCE ────────────────────────────────────
// Drafts, immutable answer revisions, and immutable submissions retain only
// opaque identifiers, hashes, structured values, and privacy-safe state.

export const questionnaireDrafts = mysqlTable("questionnaire_drafts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  customerAccountId: varchar("customerAccountId", { length: 64 }).notNull(),
  diagnosticCaseId: varchar("diagnosticCaseId", { length: 64 }).notNull(),
  questionnaireReleaseId: varchar("questionnaireReleaseId", { length: 64 }).notNull(),
  questionnaireVersion: varchar("questionnaireVersion", { length: 64 }).notNull(),
  questionnaireContentHash: varchar("questionnaireContentHash", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["open", "submitted"]).default("open").notNull(),
  draftRevision: int("draftRevision").default(0).notNull(),
  currentQuestionId: varchar("currentQuestionId", { length: 64 }),
  visibleQuestionIds: json("visibleQuestionIds").notNull(),
  visibleSetHash: varchar("visibleSetHash", { length: 64 }).notNull(),
  manualFollowUpRequired: boolean("manualFollowUpRequired").default(false).notNull(),
  manualFollowUpTriggerIds: json("manualFollowUpTriggerIds").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.diagnosticCaseId, table.customerAccountId],
    foreignColumns: [diagnosticCases.id, diagnosticCases.customerAccountId],
    name: "fk_questionnaire_draft_case_owner",
  }).onDelete("restrict").onUpdate("restrict"),
  uniqueIndex("questionnaire_drafts_case_uq").on(table.diagnosticCaseId),
  uniqueIndex("questionnaire_drafts_id_owner_case_uq").on(
    table.id,
    table.customerAccountId,
    table.diagnosticCaseId,
  ),
  index("questionnaire_drafts_owner_case_status_updated_idx").on(
    table.customerAccountId,
    table.diagnosticCaseId,
    table.status,
    table.updatedAt,
  ),
  check("chk_questionnaire_draft_revision_nonnegative", sql`${table.draftRevision} >= 0`),
]);

export type QuestionnaireDraft = typeof questionnaireDrafts.$inferSelect;
export type InsertQuestionnaireDraft = typeof questionnaireDrafts.$inferInsert;

export const questionnaireAnswerRevisions = mysqlTable("questionnaire_answer_revisions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  customerAccountId: varchar("customerAccountId", { length: 64 }).notNull(),
  diagnosticCaseId: varchar("diagnosticCaseId", { length: 64 }).notNull(),
  questionnaireDraftId: varchar("questionnaireDraftId", { length: 64 }).notNull(),
  questionId: varchar("questionId", { length: 64 }).notNull(),
  draftRevision: int("draftRevision").notNull(),
  valueJson: json("valueJson"),
  answerState: mysqlEnum("answerState", ["active", "inactive"]).notNull(),
  source: mysqlEnum("source", ["customer", "system_branch_recompute"]).notNull(),
  clientMutationIdHash: varchar("clientMutationIdHash", { length: 128 }).notNull(),
  deactivationReasonCode: varchar("deactivationReasonCode", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.questionnaireDraftId, table.customerAccountId, table.diagnosticCaseId],
    foreignColumns: [
      questionnaireDrafts.id,
      questionnaireDrafts.customerAccountId,
      questionnaireDrafts.diagnosticCaseId,
    ],
    name: "fk_questionnaire_answer_revision_draft_owner_case",
  }).onDelete("restrict").onUpdate("restrict"),
  uniqueIndex("questionnaire_answer_revisions_draft_question_revision_uq").on(
    table.questionnaireDraftId,
    table.questionId,
    table.draftRevision,
  ),
  uniqueIndex("questionnaire_answer_revisions_draft_mutation_uq").on(
    table.questionnaireDraftId,
    table.clientMutationIdHash,
  ),
  index("questionnaire_answer_revisions_draft_question_revision_idx").on(
    table.questionnaireDraftId,
    table.questionId,
    table.draftRevision,
  ),
  index("questionnaire_answer_revisions_case_revision_idx").on(
    table.diagnosticCaseId,
    table.draftRevision,
  ),
  check("chk_questionnaire_answer_revision_positive", sql`${table.draftRevision} > 0`),
]);

export type QuestionnaireAnswerRevision = typeof questionnaireAnswerRevisions.$inferSelect;
export type InsertQuestionnaireAnswerRevision = typeof questionnaireAnswerRevisions.$inferInsert;

export const questionnaireSubmissions = mysqlTable("questionnaire_submissions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  customerAccountId: varchar("customerAccountId", { length: 64 }).notNull(),
  diagnosticCaseId: varchar("diagnosticCaseId", { length: 64 }).notNull(),
  questionnaireDraftId: varchar("questionnaireDraftId", { length: 64 }).notNull(),
  submissionVersion: int("submissionVersion").notNull(),
  questionnaireReleaseId: varchar("questionnaireReleaseId", { length: 64 }).notNull(),
  questionnaireVersion: varchar("questionnaireVersion", { length: 64 }).notNull(),
  questionnaireContentHash: varchar("questionnaireContentHash", { length: 64 }).notNull(),
  legalCoreReleaseId: varchar("legalCoreReleaseId", { length: 64 }).notNull(),
  legalCoreVersion: varchar("legalCoreVersion", { length: 64 }).notNull(),
  rulesetId: varchar("rulesetId", { length: 64 }).notNull(),
  rulesetBundleHash: varchar("rulesetBundleHash", { length: 64 }).notNull(),
  visibleQuestionIds: json("visibleQuestionIds").notNull(),
  visibleSetHash: varchar("visibleSetHash", { length: 64 }).notNull(),
  manualFollowUpRequired: boolean("manualFollowUpRequired").notNull(),
  manualFollowUpTriggerIds: json("manualFollowUpTriggerIds").notNull(),
  inputSnapshotJson: json("inputSnapshotJson").notNull(),
  inputSnapshotHash: varchar("inputSnapshotHash", { length: 64 }).notNull(),
  submittedAt: timestamp("submittedAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.questionnaireDraftId, table.customerAccountId, table.diagnosticCaseId],
    foreignColumns: [
      questionnaireDrafts.id,
      questionnaireDrafts.customerAccountId,
      questionnaireDrafts.diagnosticCaseId,
    ],
    name: "fk_questionnaire_submission_draft_owner_case",
  }).onDelete("restrict").onUpdate("restrict"),
  uniqueIndex("questionnaire_submissions_case_version_uq").on(
    table.diagnosticCaseId,
    table.submissionVersion,
  ),
  uniqueIndex("questionnaire_submissions_case_input_hash_uq").on(
    table.diagnosticCaseId,
    table.inputSnapshotHash,
  ),
  uniqueIndex("questionnaire_submissions_id_owner_case_uq").on(
    table.id,
    table.customerAccountId,
    table.diagnosticCaseId,
  ),
  index("questionnaire_submissions_owner_case_submitted_idx").on(
    table.customerAccountId,
    table.diagnosticCaseId,
    table.submittedAt,
  ),
  check("chk_questionnaire_submission_version_positive", sql`${table.submissionVersion} > 0`),
  check(
    "chk_questionnaire_submission_legal_core_identity",
    sql`(
      ${table.legalCoreReleaseId} REGEXP '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
      AND ${table.legalCoreVersion} REGEXP '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
      AND ${table.rulesetId} REGEXP '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
      AND ${table.rulesetBundleHash} REGEXP '^[a-f0-9]{64}$'
    )`,
  ),
]);

export type QuestionnaireSubmission = typeof questionnaireSubmissions.$inferSelect;
export type InsertQuestionnaireSubmission = typeof questionnaireSubmissions.$inferInsert;

// ── RELEASE 1 V2 RULES ENGINE PERSISTENCE ─────────────────────────────────────
// Evaluations reference the immutable submission instead of duplicating its raw
// answer snapshot. Result JSON is internal-only and every write remains fenced
// to the submission owner/case plus the exact leased source outbox row.

export const questionnaireRuleEvaluations = mysqlTable("questionnaire_rule_evaluations", {
  id: varchar("id", { length: 64 }).primaryKey(),
  customerAccountId: varchar("customerAccountId", { length: 64 }).notNull(),
  diagnosticCaseId: varchar("diagnosticCaseId", { length: 64 }).notNull(),
  questionnaireSubmissionId: varchar("questionnaireSubmissionId", { length: 64 }).notNull(),
  sourceOutboxEventId: varchar("sourceOutboxEventId", { length: 64 }).notNull(),
  submittedCaseStateVersion: int("submittedCaseStateVersion").notNull(),
  rulesetId: varchar("rulesetId", { length: 64 }).notNull(),
  rulesetVersion: varchar("rulesetVersion", { length: 64 }).notNull(),
  rulesetHash: varchar("rulesetHash", { length: 64 }).notNull(),
  inputSnapshotHash: varchar("inputSnapshotHash", { length: 64 }).notNull(),
  status: mysqlEnum("status", [
    "pending",
    "succeeded",
    "manual_review_required",
    "failed",
  ]).default("pending").notNull(),
  outcomeJson: json("outcomeJson"),
  outcomeHash: varchar("outcomeHash", { length: 64 }),
  manualReviewRequired: boolean("manualReviewRequired").default(false).notNull(),
  failureCode: varchar("failureCode", { length: 64 }),
  startedAt: timestamp("startedAt").notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.customerAccountId],
    foreignColumns: [customerAccounts.id],
    name: "fk_questionnaire_rule_evaluation_owner",
  }).onDelete("restrict").onUpdate("restrict"),
  foreignKey({
    columns: [table.diagnosticCaseId, table.customerAccountId],
    foreignColumns: [diagnosticCases.id, diagnosticCases.customerAccountId],
    name: "fk_questionnaire_rule_evaluation_case_owner",
  }).onDelete("restrict").onUpdate("restrict"),
  foreignKey({
    columns: [
      table.questionnaireSubmissionId,
      table.customerAccountId,
      table.diagnosticCaseId,
    ],
    foreignColumns: [
      questionnaireSubmissions.id,
      questionnaireSubmissions.customerAccountId,
      questionnaireSubmissions.diagnosticCaseId,
    ],
    name: "fk_questionnaire_rule_evaluation_submission_owner_case",
  }).onDelete("restrict").onUpdate("restrict"),
  foreignKey({
    columns: [table.sourceOutboxEventId],
    foreignColumns: [outboxEvents.id],
    name: "fk_questionnaire_rule_evaluation_source_outbox",
  }).onDelete("restrict").onUpdate("restrict"),
  uniqueIndex("questionnaire_rule_evaluations_source_outbox_uq").on(
    table.sourceOutboxEventId,
  ),
  uniqueIndex("questionnaire_rule_evaluations_submission_ruleset_uq").on(
    table.questionnaireSubmissionId,
    table.rulesetHash,
  ),
  uniqueIndex("questionnaire_rule_evaluations_id_owner_case_submission_uq").on(
    table.id,
    table.customerAccountId,
    table.diagnosticCaseId,
    table.questionnaireSubmissionId,
  ),
  index("questionnaire_rule_evaluations_owner_case_status_idx").on(
    table.customerAccountId,
    table.diagnosticCaseId,
    table.status,
    table.createdAt,
  ),
  check(
    "chk_questionnaire_rule_evaluation_state_version_positive",
    sql`${table.submittedCaseStateVersion} > 0`,
  ),
  check(
    "chk_questionnaire_rule_evaluation_hashes",
    sql`(
      ${table.rulesetHash} REGEXP '^[a-f0-9]{64}$'
      AND ${table.inputSnapshotHash} REGEXP '^[a-f0-9]{64}$'
      AND (${table.outcomeHash} IS NULL OR ${table.outcomeHash} REGEXP '^[a-f0-9]{64}$')
    )`,
  ),
  check(
    "chk_questionnaire_rule_evaluation_lifecycle",
    sql`(
      (${table.status} = 'pending' AND ${table.outcomeJson} IS NULL AND ${table.outcomeHash} IS NULL AND ${table.manualReviewRequired} = false AND ${table.failureCode} IS NULL AND ${table.completedAt} IS NULL)
      OR (${table.status} = 'succeeded' AND ${table.outcomeJson} IS NOT NULL AND ${table.outcomeHash} IS NOT NULL AND ${table.manualReviewRequired} = false AND ${table.failureCode} IS NULL AND ${table.completedAt} IS NOT NULL)
      OR (${table.status} = 'manual_review_required' AND ${table.outcomeJson} IS NOT NULL AND ${table.outcomeHash} IS NOT NULL AND ${table.manualReviewRequired} = true AND ${table.failureCode} IS NULL AND ${table.completedAt} IS NOT NULL)
      OR (${table.status} = 'failed' AND ${table.outcomeJson} IS NULL AND ${table.outcomeHash} IS NULL AND ${table.manualReviewRequired} = false AND ${table.failureCode} IS NOT NULL AND ${table.completedAt} IS NOT NULL)
    )`,
  ),
]);

export type QuestionnaireRuleEvaluation = typeof questionnaireRuleEvaluations.$inferSelect;
export type InsertQuestionnaireRuleEvaluation = typeof questionnaireRuleEvaluations.$inferInsert;
// ── RELEASE 1 V2 WEB REPORT PERSISTENCE ──────────────────────────────────────
// A row is one immutable, versioned server artifact derived from a validated
// rule evaluation. Public APIs must project this JSON later; outbox rows remain
// privacy-safe and contain only opaque identifiers and hashes.

export const reportSnapshots = mysqlTable(
  "report_snapshots",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    customerAccountId: varchar("customerAccountId", { length: 64 }).notNull(),
    diagnosticCaseId: varchar("diagnosticCaseId", { length: 64 }).notNull(),
    questionnaireSubmissionId: varchar("questionnaireSubmissionId", {
      length: 64,
    }).notNull(),
    questionnaireRuleEvaluationId: varchar("questionnaireRuleEvaluationId", {
      length: 64,
    }).notNull(),
    sourceOutboxEventId: varchar("sourceOutboxEventId", {
      length: 64,
    }).notNull(),
    reportVersion: int("reportVersion").notNull(),
    generationReason: mysqlEnum("generationReason", ["initial_evaluation"])
      .default("initial_evaluation")
      .notNull(),
    templateVersion: varchar("templateVersion", { length: 64 }).notNull(),
    inputSnapshotHash: varchar("inputSnapshotHash", { length: 64 }).notNull(),
    outcomeHash: varchar("outcomeHash", { length: 64 }).notNull(),
    rulesetBundleHash: varchar("rulesetBundleHash", { length: 64 }).notNull(),
    status: mysqlEnum("status", [
      "pending",
      "processing",
      "ready",
      "failed",
      "superseded",
    ])
      .default("pending")
      .notNull(),
    generationMode: mysqlEnum("generationMode", ["template"])
      .default("template")
      .notNull(),
    readySlot: int("readySlot"),
    leaseOwner: varchar("leaseOwner", { length: 64 }),
    leaseVersion: int("leaseVersion").default(0).notNull(),
    leaseExpiresAt: timestamp("leaseExpiresAt"),
    attemptCount: int("attemptCount").default(0).notNull(),
    payloadJson: json("payloadJson"),
    payloadHash: varchar("payloadHash", { length: 64 }),
    contentHash: varchar("contentHash", { length: 64 }),
    failureCode: varchar("failureCode", { length: 64 }),
    lastAttemptAt: timestamp("lastAttemptAt"),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    foreignKey({
      columns: [table.customerAccountId],
      foreignColumns: [customerAccounts.id],
      name: "fk_report_snapshot_owner",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.diagnosticCaseId, table.customerAccountId],
      foreignColumns: [diagnosticCases.id, diagnosticCases.customerAccountId],
      name: "fk_report_snapshot_case_owner",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [
        table.questionnaireSubmissionId,
        table.customerAccountId,
        table.diagnosticCaseId,
      ],
      foreignColumns: [
        questionnaireSubmissions.id,
        questionnaireSubmissions.customerAccountId,
        questionnaireSubmissions.diagnosticCaseId,
      ],
      name: "fk_report_snapshot_submission_owner_case",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [
        table.questionnaireRuleEvaluationId,
        table.customerAccountId,
        table.diagnosticCaseId,
        table.questionnaireSubmissionId,
      ],
      foreignColumns: [
        questionnaireRuleEvaluations.id,
        questionnaireRuleEvaluations.customerAccountId,
        questionnaireRuleEvaluations.diagnosticCaseId,
        questionnaireRuleEvaluations.questionnaireSubmissionId,
      ],
      name: "fk_report_snapshot_evaluation_owner_case_submission",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.sourceOutboxEventId],
      foreignColumns: [outboxEvents.id],
      name: "fk_report_snapshot_source_outbox",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.sourceOutboxEventId],
      foreignColumns: [questionnaireRuleEvaluations.sourceOutboxEventId],
      name: "fk_report_snapshot_evaluation_source_outbox",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("report_snapshots_case_version_uq").on(
      table.diagnosticCaseId,
      table.reportVersion
    ),
    uniqueIndex("report_snapshots_case_input_reason_uq").on(
      table.diagnosticCaseId,
      table.inputSnapshotHash,
      table.generationReason
    ),
    uniqueIndex("report_snapshots_id_owner_case_uq").on(
      table.id,
      table.customerAccountId,
      table.diagnosticCaseId
    ),
    uniqueIndex("report_snapshots_evaluation_uq").on(
      table.questionnaireRuleEvaluationId
    ),
    uniqueIndex("report_snapshots_source_outbox_uq").on(
      table.sourceOutboxEventId
    ),
    uniqueIndex("report_snapshots_case_ready_uq").on(
      table.diagnosticCaseId,
      table.readySlot
    ),
    index("report_snapshots_owner_case_status_version_idx").on(
      table.customerAccountId,
      table.diagnosticCaseId,
      table.status,
      table.reportVersion
    ),
    index("report_snapshots_status_lease_created_idx").on(
      table.status,
      table.leaseExpiresAt,
      table.createdAt
    ),
    check("chk_report_snapshot_version", sql`${table.reportVersion} > 0`),
    check(
      "chk_report_snapshot_template_version",
      sql`${table.templateVersion} REGEXP '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'`
    ),
    check(
      "chk_report_snapshot_hashes",
      sql`(
      ${table.inputSnapshotHash} REGEXP '^[a-f0-9]{64}$'
      AND ${table.outcomeHash} REGEXP '^[a-f0-9]{64}$'
      AND ${table.rulesetBundleHash} REGEXP '^[a-f0-9]{64}$'
      AND (${table.payloadHash} IS NULL OR ${table.payloadHash} REGEXP '^[a-f0-9]{64}$')
      AND (${table.contentHash} IS NULL OR ${table.contentHash} REGEXP '^[a-f0-9]{64}$')
    )`
    ),
    check(
      "chk_report_snapshot_counters",
      sql`${table.attemptCount} >= 0 AND ${table.leaseVersion} >= 0`
    ),
    check(
      "chk_report_snapshot_failure_code_safe",
      sql`${table.failureCode} IS NULL OR ${table.failureCode} REGEXP '^[a-z][a-z0-9_]{0,63}$'`
    ),
    check(
      "chk_report_snapshot_lifecycle",
      sql`(
      (${table.status} = 'pending'
        AND ${table.readySlot} IS NULL
        AND ${table.leaseOwner} IS NULL
        AND ${table.leaseExpiresAt} IS NULL
        AND ${table.leaseVersion} = 0
        AND ${table.attemptCount} = 0
        AND ${table.lastAttemptAt} IS NULL
        AND ${table.payloadJson} IS NULL
        AND ${table.payloadHash} IS NULL
        AND ${table.contentHash} IS NULL
        AND ${table.failureCode} IS NULL
        AND ${table.completedAt} IS NULL)
      OR (${table.status} = 'processing'
        AND ${table.readySlot} IS NULL
        AND ${table.leaseOwner} IS NOT NULL
        AND ${table.leaseExpiresAt} IS NOT NULL
        AND ${table.leaseVersion} > 0
        AND ${table.attemptCount} > 0
        AND ${table.lastAttemptAt} IS NOT NULL
        AND ${table.leaseExpiresAt} > ${table.lastAttemptAt}
        AND ${table.payloadJson} IS NULL
        AND ${table.payloadHash} IS NULL
        AND ${table.contentHash} IS NULL
        AND ${table.failureCode} IS NULL
        AND ${table.completedAt} IS NULL)
      OR (${table.status} = 'ready'
        AND ${table.readySlot} = 1
        AND ${table.leaseOwner} IS NULL
        AND ${table.leaseExpiresAt} IS NULL
        AND ${table.leaseVersion} > 0
        AND ${table.attemptCount} > 0
        AND ${table.lastAttemptAt} IS NOT NULL
        AND ${table.payloadJson} IS NOT NULL
        AND ${table.payloadHash} IS NOT NULL
        AND ${table.contentHash} IS NOT NULL
        AND ${table.failureCode} IS NULL
        AND ${table.completedAt} IS NOT NULL
        AND ${table.completedAt} >= ${table.lastAttemptAt})
      OR (${table.status} = 'failed'
        AND ${table.readySlot} IS NULL
        AND ${table.leaseOwner} IS NULL
        AND ${table.leaseExpiresAt} IS NULL
        AND ${table.leaseVersion} > 0
        AND ${table.attemptCount} > 0
        AND ${table.lastAttemptAt} IS NOT NULL
        AND ${table.payloadJson} IS NULL
        AND ${table.payloadHash} IS NULL
        AND ${table.contentHash} IS NULL
        AND ${table.failureCode} IS NOT NULL
        AND ${table.completedAt} IS NOT NULL
        AND ${table.completedAt} >= ${table.lastAttemptAt})
      OR (${table.status} = 'superseded'
        AND ${table.readySlot} IS NULL
        AND ${table.leaseOwner} IS NULL
        AND ${table.leaseExpiresAt} IS NULL
        AND ${table.leaseVersion} > 0
        AND ${table.attemptCount} > 0
        AND ${table.lastAttemptAt} IS NOT NULL
        AND ${table.payloadJson} IS NOT NULL
        AND ${table.payloadHash} IS NOT NULL
        AND ${table.contentHash} IS NOT NULL
        AND ${table.failureCode} IS NULL
        AND ${table.completedAt} IS NOT NULL
        AND ${table.completedAt} >= ${table.lastAttemptAt})
    )`
    ),
  ]
);

export type ReportSnapshot = typeof reportSnapshots.$inferSelect;
export type InsertReportSnapshot = typeof reportSnapshots.$inferInsert;

// ── RELEASE 1 V2 PDF ARTIFACTS ───────────────────────────────────────────────
// The PDF bytes live in object storage; this row is the immutable, owner-bound
// artifact manifest and never contains credentials or a public share URL.
export const reportPdfArtifacts = mysqlTable(
  "report_pdf_artifacts",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    customerAccountId: varchar("customerAccountId", { length: 64 }).notNull(),
    diagnosticCaseId: varchar("diagnosticCaseId", { length: 64 }).notNull(),
    reportSnapshotId: varchar("reportSnapshotId", { length: 64 }).notNull(),
    rendererVersion: varchar("rendererVersion", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["pending", "ready", "failed"]).default("pending").notNull(),
    storageKey: varchar("storageKey", { length: 512 }),
    contentHash: varchar("contentHash", { length: 64 }),
    byteSize: int("byteSize"),
    failureCode: varchar("failureCode", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  table => [
    foreignKey({
      columns: [table.reportSnapshotId, table.customerAccountId, table.diagnosticCaseId],
      foreignColumns: [reportSnapshots.id, reportSnapshots.customerAccountId, reportSnapshots.diagnosticCaseId],
      name: "fk_report_pdf_artifact_snapshot_owner_case",
    }).onDelete("restrict").onUpdate("restrict"),
    uniqueIndex("report_pdf_artifacts_snapshot_renderer_uq").on(table.reportSnapshotId, table.rendererVersion),
    uniqueIndex("report_pdf_artifacts_id_owner_case_uq").on(table.id, table.customerAccountId, table.diagnosticCaseId),
    index("report_pdf_artifacts_owner_case_status_idx").on(table.customerAccountId, table.diagnosticCaseId, table.status),
    check("chk_report_pdf_artifact_hash", sql`(${table.contentHash} IS NULL OR ${table.contentHash} REGEXP '^[a-f0-9]{64}$')`),
  ],
);

export type ReportPdfArtifact = typeof reportPdfArtifacts.$inferSelect;
export type InsertReportPdfArtifact = typeof reportPdfArtifacts.$inferInsert;

// ── RELEASE 2 DOCUMENT INTAKE ────────────────────────────────────────────────
// The source bytes live in private object storage; this owner-bound manifest
// is the auditable intake record and treats all extracted text as untrusted.
export const r1DocumentManifests = mysqlTable(
  "r1_document_manifests",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    customerAccountId: varchar("customerAccountId", { length: 64 }).notNull(),
    diagnosticCaseId: varchar("diagnosticCaseId", { length: 64 }).notNull(),
    accessGrantId: varchar("accessGrantId", { length: 64 }).notNull(),
    categoryId: varchar("categoryId", { length: 64 }).notNull(),
    fileName: varchar("fileName", { length: 180 }).notNull(),
    format: mysqlEnum("format", ["pdf", "docx"]).notNull(),
    mimeType: varchar("mimeType", { length: 128 }).notNull(),
    byteSize: int("byteSize").notNull(),
    contentHashSha256: varchar("contentHashSha256", { length: 64 }).notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    status: mysqlEnum("status", ["uploaded", "extracting", "analyzed", "manual_review_required", "failed", "deleted"]).default("uploaded").notNull(),
    trustedContent: boolean("trustedContent").default(false).notNull(),
    promptInjectionRisk: mysqlEnum("promptInjectionRisk", ["untrusted_document_content"]).default("untrusted_document_content").notNull(),
    failureCode: varchar("failureCode", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    deletedAt: timestamp("deletedAt"),
  },
  table => [
    foreignKey({
      columns: [table.diagnosticCaseId, table.customerAccountId],
      foreignColumns: [diagnosticCases.id, diagnosticCases.customerAccountId],
      name: "fk_r1_document_manifest_case_owner",
    }).onDelete("restrict").onUpdate("restrict"),
    foreignKey({
      columns: [table.accessGrantId],
      foreignColumns: [accessGrants.id],
      name: "fk_r1_document_manifest_grant_owner_case",
    }).onDelete("restrict").onUpdate("restrict"),
    uniqueIndex("r1_document_manifests_id_owner_case_uq").on(table.id, table.customerAccountId, table.diagnosticCaseId),
    uniqueIndex("r1_document_manifests_case_hash_uq").on(table.diagnosticCaseId, table.contentHashSha256),
    index("r1_document_manifests_owner_case_status_idx").on(table.customerAccountId, table.diagnosticCaseId, table.status),
    check("chk_r1_document_manifest_hash", sql`${table.contentHashSha256} REGEXP '^[a-f0-9]{64}$'`),
    check("chk_r1_document_manifest_size", sql`${table.byteSize} > 0 AND ${table.byteSize} <= 26214400`),
  ],
);

export type R1DocumentManifest = typeof r1DocumentManifests.$inferSelect;
export type InsertR1DocumentManifest = typeof r1DocumentManifests.$inferInsert;

// ── RELEASE 2 DOCUMENT PROCESSING ────────────────────────────────────────────
// One immutable job/artifact row per document processing version. Extracted text
// lives in private object storage; this row contains only hashes and lifecycle data.
export const r1DocumentTextArtifacts = mysqlTable(
  "r1_document_text_artifacts",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    documentManifestId: varchar("documentManifestId", { length: 64 }).notNull(),
    customerAccountId: varchar("customerAccountId", { length: 64 }).notNull(),
    diagnosticCaseId: varchar("diagnosticCaseId", { length: 64 }).notNull(),
    extractorVersion: varchar("extractorVersion", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["queued", "processing", "analyzed", "manual_review_required", "failed"]).default("queued").notNull(),
    storageKey: varchar("storageKey", { length: 512 }),
    textHashSha256: varchar("textHashSha256", { length: 64 }),
    byteSize: int("byteSize"),
    attemptCount: int("attemptCount").default(0).notNull(),
    leaseOwner: varchar("leaseOwner", { length: 128 }),
    leaseExpiresAt: timestamp("leaseExpiresAt"),
    failureCode: varchar("failureCode", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  table => [
    foreignKey({
      columns: [table.documentManifestId, table.customerAccountId, table.diagnosticCaseId],
      foreignColumns: [r1DocumentManifests.id, r1DocumentManifests.customerAccountId, r1DocumentManifests.diagnosticCaseId],
      name: "fk_r1_document_text_artifact_manifest_owner_case",
    }).onDelete("restrict").onUpdate("restrict"),
    uniqueIndex("r1_document_text_artifacts_document_version_uq").on(table.documentManifestId, table.extractorVersion),
    index("r1_document_text_artifacts_queue_idx").on(table.status, table.leaseExpiresAt, table.createdAt),
    index("r1_document_text_artifacts_owner_case_idx").on(table.customerAccountId, table.diagnosticCaseId, table.status),
    check("chk_r1_document_text_artifact_hash", sql`(${table.textHashSha256} IS NULL OR ${table.textHashSha256} REGEXP '^[a-f0-9]{64}$')`),
    check("chk_r1_document_text_artifact_attempts", sql`${table.attemptCount} >= 0 AND ${table.attemptCount} <= 3`),
    check("chk_r1_document_text_artifact_size", sql`(${table.byteSize} IS NULL OR (${table.byteSize} > 0 AND ${table.byteSize} <= 2097152))`),
  ],
);

export type R1DocumentTextArtifact = typeof r1DocumentTextArtifacts.$inferSelect;
export type InsertR1DocumentTextArtifact = typeof r1DocumentTextArtifacts.$inferInsert;

export const creditEntitlements = mysqlTable(
  "credit_entitlements",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    customerAccountId: varchar("customerAccountId", { length: 64 }).notNull(),
    diagnosticCaseId: varchar("diagnosticCaseId", { length: 64 }).notNull(),
    sourcePaymentRecordId: varchar("sourcePaymentRecordId", { length: 64 }).notNull(),
    sourceReportSnapshotId: varchar("sourceReportSnapshotId", { length: 64 }).notNull(),
    sourceTariffId: varchar("sourceTariffId", { length: 64 }).notNull(),
    sourceTariffVersion: varchar("sourceTariffVersion", { length: 64 }).notNull(),
    policyId: varchar("policyId", { length: 64 }).notNull(),
    policyVersion: varchar("policyVersion", { length: 64 }).notNull(),
    amountRub: int("amountRub").notNull(),
    currency: mysqlEnum("currency", ["RUB"]).notNull(),
    eligibleProductCode: mysqlEnum("eligibleProductCode", [
      "start_product",
      "safe_sales",
      "rights_and_ip",
      "data_and_infrastructure",
      "enterprise_readiness",
    ]).notNull(),
    issuedAt: timestamp("issuedAt", { fsp: 3 }).notNull(),
    expiresAt: timestamp("expiresAt", { fsp: 3 }).notNull(),
    businessTimeZone: mysqlEnum("businessTimeZone", ["Europe/Moscow"]).notNull(),
    status: mysqlEnum("status", ["available", "expired", "revoked"])
      .default("available")
      .notNull(),
    automaticRedemptionEnabled: boolean("automaticRedemptionEnabled")
      .default(false)
      .notNull(),
    revokedAt: timestamp("revokedAt", { fsp: 3 }),
    revocationReasonCode: varchar("revocationReasonCode", { length: 64 }),
    createdAt: timestamp("createdAt", { fsp: 3 }).notNull(),
    updatedAt: timestamp("updatedAt", { fsp: 3 }).notNull(),
  },
  table => [
    foreignKey({
      columns: [table.customerAccountId],
      foreignColumns: [customerAccounts.id],
      name: "fk_credit_entitlement_owner",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [table.diagnosticCaseId, table.customerAccountId],
      foreignColumns: [diagnosticCases.id, diagnosticCases.customerAccountId],
      name: "fk_credit_entitlement_case_owner",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [
        table.sourcePaymentRecordId,
        table.customerAccountId,
        table.diagnosticCaseId,
      ],
      foreignColumns: [
        paymentRecords.id,
        paymentRecords.customerAccountId,
        paymentRecords.diagnosticCaseId,
      ],
      name: "fk_credit_entitlement_payment_owner_case",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      columns: [
        table.sourceReportSnapshotId,
        table.customerAccountId,
        table.diagnosticCaseId,
      ],
      foreignColumns: [
        reportSnapshots.id,
        reportSnapshots.customerAccountId,
        reportSnapshots.diagnosticCaseId,
      ],
      name: "fk_credit_entitlement_report_owner_case",
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    uniqueIndex("credit_entitlements_source_identity_uq").on(
      table.sourcePaymentRecordId,
      table.sourceReportSnapshotId,
      table.policyId
    ),
    uniqueIndex("credit_entitlements_report_uq").on(
      table.sourceReportSnapshotId
    ),
    index("credit_entitlements_owner_case_status_expiry_idx").on(
      table.customerAccountId,
      table.diagnosticCaseId,
      table.status,
      table.expiresAt
    ),
    check("chk_credit_entitlement_amount", sql`${table.amountRub} = 6900`),
    check(
      "chk_credit_entitlement_policy",
      sql`${table.policyId} = 'base-diagnostic-credit-6900-rub-v1'
        AND ${table.sourceTariffId} = 'lexy-advanced-diagnostic'
        AND ${table.businessTimeZone} = 'Europe/Moscow'
        AND ${table.automaticRedemptionEnabled} = false`
    ),
    check(
      "chk_credit_entitlement_expiry",
      sql`${table.expiresAt} > ${table.issuedAt}`
    ),
    check(
      "chk_credit_entitlement_lifecycle",
      sql`(
        (${table.status} IN ('available', 'expired')
          AND ${table.revokedAt} IS NULL
          AND ${table.revocationReasonCode} IS NULL)
        OR (${table.status} = 'revoked'
          AND ${table.revokedAt} IS NOT NULL
          AND ${table.revocationReasonCode} REGEXP '^[a-z][a-z0-9_]{0,63}$')
      )`
    ),
  ]
);

export type CreditEntitlement = typeof creditEntitlements.$inferSelect;
export type InsertCreditEntitlement = typeof creditEntitlements.$inferInsert;
