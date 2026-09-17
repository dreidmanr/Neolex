import type { Express, Response } from "express";
import { assertTechnicalPilotAllowed } from "../releaseGate";
import { requireR1Database } from "../database";
import { authenticateCustomerRequest } from "../../_core/context";
import { findOwnedCaseByPublicId } from "../cases/caseRepository";
import { findActiveOwnedAccessGrant } from "../billing/accessPolicy";
import { loadReadyReportSnapshotByPublicCase } from "../reports/reportSnapshotRepository";
import { persistPdfArtifactForReadyReport, findOwnedPdfArtifact } from "./reportPdfArtifactService";
import { storageGetSignedUrl } from "../../storage";
import { R1_PDF_RENDERER_VERSION } from "../reports/reportPdfRenderer";

function deny(res: Response): never {
  res.status(404).json({ error: "Report artifact not found" });
  throw new Error("neutral_pdf_denial");
}

export function registerR1PdfRoutes(app: Express): void {
  app.get("/api/r1/reports/:publicId/artifacts/pdf", async (req, res) => {
    try {
      assertTechnicalPilotAllowed();
      const customer = await authenticateCustomerRequest(req as never);
      if (!customer) return deny(res);
      const publicId = String((req.params as Record<string, string>).publicId ?? "");
      if (!/^[A-Za-z0-9_-]{16,64}$/.test(publicId)) return deny(res);
      const db = await requireR1Database();
      const ownedCase = await findOwnedCaseByPublicId(db, customer.accountId, publicId);
      if (!ownedCase) return deny(res);
      const grant = await findActiveOwnedAccessGrant(db, customer.accountId, ownedCase.id);
      if (!grant) return deny(res);
      const snapshot = await loadReadyReportSnapshotByPublicCase(db, {
        customerAccountId: customer.accountId,
        casePublicId: publicId,
      });
      if (!snapshot?.payloadJson) return deny(res);
      let artifact = await findOwnedPdfArtifact(db, {
        customerAccountId: customer.accountId,
        diagnosticCaseId: ownedCase.id,
        reportSnapshotId: snapshot.id,
      });
      if (!artifact) {
        artifact = await persistPdfArtifactForReadyReport(db, {
          customerAccountId: customer.accountId,
          diagnosticCaseId: ownedCase.id,
          reportSnapshotId: snapshot.id,
          payloadJson: snapshot.payloadJson as never,
        });
      }
      if (artifact.status !== "ready" || !artifact.storageKey) return deny(res);
      const signedUrl = await storageGetSignedUrl(artifact.storageKey);
      const upstream = await fetch(signedUrl);
      if (!upstream.ok) {
        res.status(502).json({ error: "PDF artifact storage unavailable" });
        return;
      }
      const bytes = Buffer.from(await upstream.arrayBuffer());
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="lexy-report-${snapshot.id.slice(-12)}.pdf"`);
      res.setHeader("Content-Length", String(bytes.byteLength));
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Lexy-Pdf-Renderer", R1_PDF_RENDERER_VERSION);
      res.send(bytes);
    } catch (error) {
      if (error instanceof Error && error.message === "neutral_pdf_denial") return;
      console.error("[R1 PDF] download failed:", error);
      res.status(500).json({ error: "PDF artifact unavailable" });
    }
  });
}
