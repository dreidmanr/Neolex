import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, diagnosticSessions, contacts, consentRecords, questionnaireAnswers, scoringResults } from "../drizzle/schema";
import type { InsertDiagnosticSession, InsertContact, InsertConsentRecord, InsertQuestionnaireAnswer, InsertScoringResult } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ---- Users ----
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ---- Diagnostic Sessions ----
export async function createSession(data: InsertDiagnosticSession) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(diagnosticSessions).values(data);
  const result = await db.select().from(diagnosticSessions).where(eq(diagnosticSessions.sessionToken, data.sessionToken!)).limit(1);
  return result[0];
}

export async function getSessionByToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(diagnosticSessions).where(eq(diagnosticSessions.sessionToken, token)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateSessionStatus(sessionId: number, status: "started" | "consented" | "contact_collected" | "in_progress" | "completed") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(diagnosticSessions).set({ status }).where(eq(diagnosticSessions.id, sessionId));
}

export async function completeSession(sessionId: number, riskCategory: "low" | "moderate" | "high" | "critical", totalScore: number, hasCriticalEvent: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(diagnosticSessions).set({
    status: "completed",
    riskCategory,
    totalScore,
    hasCriticalEvent,
    completedAt: new Date(),
  }).where(eq(diagnosticSessions.id, sessionId));
}

// ---- Contacts ----
export async function saveContact(data: InsertContact) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(contacts).values(data);
}

export async function getContactBySession(sessionId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(contacts).where(eq(contacts.sessionId, sessionId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ---- Consents ----
export async function saveConsent(data: InsertConsentRecord) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(consentRecords).values(data);
}

// ---- Questionnaire Answers ----
export async function upsertAnswer(data: InsertQuestionnaireAnswer) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(questionnaireAnswers)
    .where(and(eq(questionnaireAnswers.sessionId, data.sessionId!), eq(questionnaireAnswers.questionId, data.questionId!)))
    .limit(1);
  if (existing.length > 0) {
    await db.update(questionnaireAnswers).set({ answerId: data.answerId!, answerText: data.answerText ?? null })
      .where(and(eq(questionnaireAnswers.sessionId, data.sessionId!), eq(questionnaireAnswers.questionId, data.questionId!)));
  } else {
    await db.insert(questionnaireAnswers).values(data);
  }
}

export async function getAnswersBySession(sessionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(questionnaireAnswers).where(eq(questionnaireAnswers.sessionId, sessionId));
}

// ---- Scoring Results ----
export async function saveScoringResult(data: InsertScoringResult) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(scoringResults).values(data).onDuplicateKeyUpdate({
    set: {
      riskCategory: data.riskCategory,
      totalScore: data.totalScore,
      hasCriticalEvent: data.hasCriticalEvent,
      criticalEvents: data.criticalEvents,
      significantRisks: data.significantRisks,
      riskBlocks: data.riskBlocks,
      mainConclusion: data.mainConclusion,
    },
  });
}

export async function getScoringResultBySession(sessionId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(scoringResults).where(eq(scoringResults.sessionId, sessionId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}
