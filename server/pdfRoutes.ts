/**
 * Express routes for PDF report generation
 * GET /api/pdf/free/:sessionToken  — free diagnostic PDF
 * GET /api/pdf/paid/:sessionToken  — paid diagnostic PDF
 */

import { Router } from "express";
import { getSessionByToken, getContactBySession, getScoringResultBySession } from "./db";
import { getPaidSessionByToken, getPaidReport } from "./paidDb";
import { buildFreeReportHtml, buildPaidReportHtml, generatePdf } from "./pdfGenerator";
import type { FreePdfData, PaidPdfData } from "./pdfGenerator";

export function registerPdfRoutes(app: Router) {
  // ---- Free diagnostic PDF ----
  app.get("/api/pdf/free/:sessionToken", async (req, res) => {
    try {
      const { sessionToken } = req.params as { sessionToken: string };
      const session = await getSessionByToken(sessionToken);
      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      const [scoring, contact] = await Promise.all([
        getScoringResultBySession(session.id),
        getContactBySession(session.id),
      ]);

      if (!scoring) {
        res.status(404).json({ error: "Scoring result not found" });
        return;
      }

      const riskBlocks = (scoring.riskBlocks as any[]) ?? [];

      const data: FreePdfData = {
        type: "free",
        sessionToken,
        riskCategory: scoring.riskCategory,
        totalScore: scoring.totalScore ?? 0,
        hasCriticalEvent: !!scoring.hasCriticalEvent,
        mainConclusion: (scoring.mainConclusion as string) ?? "",
        riskBlocks: riskBlocks.map((b: any) => ({
          id: b.id ?? "",
          title: b.title ?? "",
          severity: b.severity ?? "moderate",
          what: b.what ?? "",
          why: b.why ?? "",
          cost: b.cost ?? "",
          impact: b.impact ?? "",
          action: b.action ?? "",
          legalBasis: b.legalBasis ?? "",
        })),
        contact: contact
          ? {
              name: contact.name ?? null,
              email: contact.email ?? null,
              productName: contact.productName ?? null,
              website: contact.website ?? null,
            }
          : null,
        generatedAt: new Date().toISOString(),
      };

      const html = buildFreeReportHtml(data);
      const pdfBuffer = await generatePdf(html);

      const filename = `neolex-free-report-${sessionToken.slice(0, 8)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (err) {
      console.error("[PDF] Free report error:", err);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  });

  // ---- Paid diagnostic PDF ----
  app.get("/api/pdf/paid/:sessionToken", async (req, res) => {
    try {
      const { sessionToken } = req.params as { sessionToken: string };
      const session = await getPaidSessionByToken(sessionToken);
      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      const report = await getPaidReport(session.id);
      if (!report) {
        res.status(404).json({ error: "Report not found" });
        return;
      }

      const data: PaidPdfData = {
        type: "paid",
        sessionToken,
        riskCategory: report.riskCategory ?? "moderate",
        totalScore: report.totalRiskScore ?? 0,
        criticalTriggers: (report.criticalTriggers as string[]) ?? [],
        riskBlocks: ((report.riskBlocks as any[]) ?? []).map((b: any) => ({
          title: b.title ?? "",
          riskLevel: b.riskLevel ?? "moderate",
          whatFound: b.whatFound ?? "",
          whyItMatters: b.whyItMatters ?? "",
          legalBasis: b.legalBasis ?? "",
          financialRange: b.financialRange ?? "",
          whatToDo: b.whatToDo ?? "",
        })),
        keyFindings: (report.keyFindings as string[]) ?? [],
        missingDocuments: (report.missingDocuments as string[]) ?? [],
        roadmap: (report.roadmap as any) ?? {},
        reportMarkdown: report.reportMarkdown ?? "",
        productName: session.productName ?? "",
        generatedAt: new Date().toISOString(),
      };

      const html = buildPaidReportHtml(data);
      const pdfBuffer = await generatePdf(html);

      const filename = `neolex-paid-report-${sessionToken.slice(0, 8)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (err) {
      console.error("[PDF] Paid report error:", err);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  });
}
