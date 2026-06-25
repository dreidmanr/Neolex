import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  json,
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

// Diagnostic sessions
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

// Questionnaire answers
export const questionnaireAnswers = mysqlTable("questionnaire_answers", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  questionId: varchar("questionId", { length: 64 }).notNull(),
  answerId: varchar("answerId", { length: 64 }).notNull(),
  answerText: text("answerText"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type QuestionnaireAnswer = typeof questionnaireAnswers.$inferSelect;
export type InsertQuestionnaireAnswer = typeof questionnaireAnswers.$inferInsert;

// Scoring results with full risk breakdown
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
