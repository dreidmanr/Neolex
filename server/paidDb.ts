import { eq, desc } from "drizzle-orm";
import { getDb } from "./db";
import {
  paidSessions,
  paidAnswers,
  paidConsentRecords,
  paidDocuments,
  paidReports,
} from "../drizzle/schema";
import { nanoid } from "nanoid";

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function createPaidSession(data: {
  contactEmail: string;
  contactName?: string;
  productName?: string;
  website?: string;
  freeSessionId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const sessionToken = nanoid(32);
  await db.insert(paidSessions).values({
    sessionToken,
    contactEmail: data.contactEmail,
    contactName: data.contactName ?? null,
    productName: data.productName ?? null,
    website: data.website ?? null,
    freeSessionId: data.freeSessionId ?? null,
    status: "created",
    paymentStatus: "pending",
  });
  const rows = await db
    .select()
    .from(paidSessions)
    .where(eq(paidSessions.sessionToken, sessionToken))
    .limit(1);
  return rows[0]!;
}

export async function getPaidSessionByToken(token: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(paidSessions)
    .where(eq(paidSessions.sessionToken, token))
    .limit(1);
  return rows[0] ?? null;
}

export async function getPaidSessionById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(paidSessions)
    .where(eq(paidSessions.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function updatePaidSessionStatus(
  id: number,
  status: "created" | "payment_pending" | "paid" | "in_progress" | "completed" | "report_ready",
  extra?: Partial<{
    currentBlock: number;
    currentQuestion: number;
    riskCategory: "low" | "moderate" | "high" | "critical";
    criticalTriggers: string[];
    userGoals: string[];
    urgencyDeadline: string;
    criticalQuestion: string;
    startedAt: Date;
    completedAt: Date;
    reportGeneratedAt: Date;
  }>
) {
  const db = await getDb();
  if (!db) return;
  const updateData: Record<string, unknown> = { status };
  if (extra) {
    if (extra.currentBlock !== undefined) updateData.currentBlock = extra.currentBlock;
    if (extra.currentQuestion !== undefined) updateData.currentQuestion = extra.currentQuestion;
    if (extra.riskCategory !== undefined) updateData.riskCategory = extra.riskCategory;
    if (extra.criticalTriggers !== undefined) updateData.criticalTriggers = JSON.stringify(extra.criticalTriggers);
    if (extra.userGoals !== undefined) updateData.userGoals = JSON.stringify(extra.userGoals);
    if (extra.urgencyDeadline !== undefined) updateData.urgencyDeadline = extra.urgencyDeadline;
    if (extra.criticalQuestion !== undefined) updateData.criticalQuestion = extra.criticalQuestion;
    if (extra.startedAt !== undefined) updateData.startedAt = extra.startedAt;
    if (extra.completedAt !== undefined) updateData.completedAt = extra.completedAt;
    if (extra.reportGeneratedAt !== undefined) updateData.reportGeneratedAt = extra.reportGeneratedAt;
  }
  await db.update(paidSessions).set(updateData as any).where(eq(paidSessions.id, id));
}

export async function markPaidSessionPaid(id: number, paymentId?: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(paidSessions)
    .set({
      paymentStatus: "paid",
      status: "paid",
      paidAt: new Date(),
      paymentId: paymentId ?? null,
    } as any)
    .where(eq(paidSessions.id, id));
}

// ── Consents ──────────────────────────────────────────────────────────────────

export async function savePaidConsent(data: {
  paidSessionId: number;
  consentType: "user_agreement" | "marketing" | "data_processing";
  accepted: boolean;
  documentVersion: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(paidConsentRecords).values({
    paidSessionId: data.paidSessionId,
    consentType: data.consentType,
    accepted: data.accepted,
    documentVersion: data.documentVersion,
    acceptedAt: new Date(),
  });
}

// ── Answers ───────────────────────────────────────────────────────────────────

export async function upsertPaidAnswer(data: {
  paidSessionId: number;
  blockId: number;
  questionId: string;
  answerType: "single" | "multi" | "text" | "file";
  answerId?: string;
  answerIds?: string[];
  answerText?: string;
}) {
  const db = await getDb();
  if (!db) return;
  // Check if answer exists
  const existing = await db
    .select()
    .from(paidAnswers)
    .where(eq(paidAnswers.paidSessionId, data.paidSessionId))
    .limit(100);
  const found = existing.find(a => a.questionId === data.questionId);
  if (found) {
    await db
      .update(paidAnswers)
      .set({
        answerId: data.answerId ?? null,
        answerIds: data.answerIds ? JSON.stringify(data.answerIds) : null,
        answerText: data.answerText ?? null,
      } as any)
      .where(eq(paidAnswers.id, found.id));
  } else {
    await db.insert(paidAnswers).values({
      paidSessionId: data.paidSessionId,
      blockId: data.blockId,
      questionId: data.questionId,
      answerType: data.answerType,
      answerId: data.answerId ?? null,
      answerIds: data.answerIds ? JSON.stringify(data.answerIds) : null,
      answerText: data.answerText ?? null,
    });
  }
}

export async function getPaidAnswers(paidSessionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(paidAnswers)
    .where(eq(paidAnswers.paidSessionId, paidSessionId));
}

// ── Documents ─────────────────────────────────────────────────────────────────

export async function savePaidDocument(data: {
  paidSessionId: number;
  blockId?: number;
  questionId?: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  storageKey: string;
  storageUrl: string;
  documentCategory?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(paidDocuments).values({
    paidSessionId: data.paidSessionId,
    blockId: data.blockId ?? null,
    questionId: data.questionId ?? null,
    fileName: data.fileName,
    fileSize: data.fileSize ?? null,
    mimeType: data.mimeType ?? null,
    storageKey: data.storageKey,
    storageUrl: data.storageUrl,
    documentCategory: data.documentCategory ?? null,
  });
}

export async function getPaidDocuments(paidSessionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(paidDocuments)
    .where(eq(paidDocuments.paidSessionId, paidSessionId));
}

// ── Reports ───────────────────────────────────────────────────────────────────

export async function savePaidReport(data: {
  paidSessionId: number;
  riskCategory: "low" | "moderate" | "high" | "critical";
  keyFindings: string[];
  scopeAndLimitations: string[];
  factualInputs: Record<string, unknown>;
  riskMap: Record<string, unknown>;
  riskBlocks: unknown[];
  missingDocuments: string[];
  financialConsequences: unknown[];
  roadmap: Record<string, unknown>;
  nextStep: Record<string, unknown>;
  reportMarkdown: string;
  criticalTriggers: string[];
  totalRiskScore: number;
  generationModel?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(paidReports).values({
    paidSessionId: data.paidSessionId,
    riskCategory: data.riskCategory,
    keyFindings: JSON.stringify(data.keyFindings),
    scopeAndLimitations: JSON.stringify(data.scopeAndLimitations),
    factualInputs: JSON.stringify(data.factualInputs),
    riskMap: JSON.stringify(data.riskMap),
    riskBlocks: JSON.stringify(data.riskBlocks),
    missingDocuments: JSON.stringify(data.missingDocuments),
    financialConsequences: JSON.stringify(data.financialConsequences),
    roadmap: JSON.stringify(data.roadmap),
    nextStep: JSON.stringify(data.nextStep),
    reportMarkdown: data.reportMarkdown,
    criticalTriggers: JSON.stringify(data.criticalTriggers),
    totalRiskScore: data.totalRiskScore,
    generationModel: data.generationModel ?? null,
  });
}

export async function getPaidReport(paidSessionId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(paidReports)
    .where(eq(paidReports.paidSessionId, paidSessionId))
    .limit(1);
  return rows[0] ?? null;
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export async function getAllPaidSessions(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(paidSessions).orderBy(desc(paidSessions.createdAt)).limit(limit);
}
