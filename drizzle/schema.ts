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
