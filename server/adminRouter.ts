import { adminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  diagnosticSessions,
  contacts,
  scoringResults,
  paidSessions,
  paidReports,
} from "../drizzle/schema";
import { desc, eq, count, sql } from "drizzle-orm";

export const adminRouter = router({
  // ── Free diagnostic: list all completed sessions with contact + scoring ──
  getFreeSessions: adminProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];

      // Join diagnostic_sessions → contacts → scoring_results
      const rows = await db
        .select({
          id: diagnosticSessions.id,
          sessionToken: diagnosticSessions.sessionToken,
          status: diagnosticSessions.status,
          riskCategory: diagnosticSessions.riskCategory,
          totalScore: diagnosticSessions.totalScore,
          hasCriticalEvent: diagnosticSessions.hasCriticalEvent,
          completedAt: diagnosticSessions.completedAt,
          createdAt: diagnosticSessions.createdAt,
          // Contact
          contactName: contacts.name,
          contactEmail: contacts.email,
          productName: contacts.productName,
          website: contacts.website,
          // Scoring
          mainConclusion: scoringResults.mainConclusion,
          criticalEvents: scoringResults.criticalEvents,
          significantRisks: scoringResults.significantRisks,
        })
        .from(diagnosticSessions)
        .leftJoin(contacts, eq(contacts.sessionId, diagnosticSessions.id))
        .leftJoin(scoringResults, eq(scoringResults.sessionId, diagnosticSessions.id))
        .orderBy(desc(diagnosticSessions.createdAt))
        .limit(500);

      return rows;
    }),

  // ── Paid diagnostic: list all sessions with payment status + report ──
  getPaidSessions: adminProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];

      const rows = await db
        .select({
          id: paidSessions.id,
          sessionToken: paidSessions.sessionToken,
          status: paidSessions.status,
          paymentStatus: paidSessions.paymentStatus,
          paymentAmount: paidSessions.paymentAmount,
          paidAt: paidSessions.paidAt,
          riskCategory: paidSessions.riskCategory,
          contactName: paidSessions.contactName,
          contactEmail: paidSessions.contactEmail,
          productName: paidSessions.productName,
          website: paidSessions.website,
          createdAt: paidSessions.createdAt,
          completedAt: paidSessions.completedAt,
          reportGeneratedAt: paidSessions.reportGeneratedAt,
          // Report summary
          reportRiskCategory: paidReports.riskCategory,
          totalRiskScore: paidReports.totalRiskScore,
        })
        .from(paidSessions)
        .leftJoin(paidReports, eq(paidReports.paidSessionId, paidSessions.id))
        .orderBy(desc(paidSessions.createdAt))
        .limit(500);

      return rows;
    }),

  // ── Statistics / KPIs ──
  getStats: adminProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return null;

      // Free diagnostic counts
      const [freeTotal] = await db
        .select({ count: count() })
        .from(diagnosticSessions);

      const [freeCompleted] = await db
        .select({ count: count() })
        .from(diagnosticSessions)
        .where(eq(diagnosticSessions.status, "completed"));

      // Free: by risk category
      const freeByCat = await db
        .select({
          riskCategory: diagnosticSessions.riskCategory,
          count: count(),
        })
        .from(diagnosticSessions)
        .where(eq(diagnosticSessions.status, "completed"))
        .groupBy(diagnosticSessions.riskCategory);

      // Paid counts
      const [paidTotal] = await db
        .select({ count: count() })
        .from(paidSessions);

      const [paidPaid] = await db
        .select({ count: count() })
        .from(paidSessions)
        .where(eq(paidSessions.paymentStatus, "paid"));

      const [paidCompleted] = await db
        .select({ count: count() })
        .from(paidSessions)
        .where(eq(paidSessions.status, "completed"));

      // Revenue
      const [revenue] = await db
        .select({ total: sql<number>`COALESCE(SUM(${paidSessions.paymentAmount}), 0)` })
        .from(paidSessions)
        .where(eq(paidSessions.paymentStatus, "paid"));

      return {
        free: {
          total: freeTotal?.count ?? 0,
          completed: freeCompleted?.count ?? 0,
          byCategory: freeByCat,
        },
        paid: {
          total: paidTotal?.count ?? 0,
          paid: paidPaid?.count ?? 0,
          completed: paidCompleted?.count ?? 0,
          revenue: revenue?.total ?? 0,
        },
      };
    }),
});
