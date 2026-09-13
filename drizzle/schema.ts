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
} from "drizzle-orm/mysql-core";

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
  index("outbox_events_aggregate_created_idx").on(table.aggregateType, table.aggregateId, table.createdAt),
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
