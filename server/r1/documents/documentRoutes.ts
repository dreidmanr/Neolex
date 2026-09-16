import express, { type Express, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { paymentRecords } from "../../../drizzle/schema";
import { assertTechnicalPilotAllowed } from "../releaseGate";
import { requireR1Database } from "../database";
import { authenticateCustomerRequest } from "../../_core/context";
import { findOwnedCaseByPublicId } from "../cases/caseRepository";
import { findActiveOwnedAccessGrant } from "../billing/accessPolicy";
import { createOwnedDocumentManifest, DOCUMENT_TARIFF_CODE, DocumentAccessDeniedError } from "./documentService";
import { findOwnedDocument, listOwnedDocuments, tombstoneOwnedDocument } from "./documentRepository";
import { storageGetSignedUrl } from "../../storage";

function deny(res: Response): void {
  res.status(404).json({ error: "Document not found" });
}

function publicIdOf(req: Request): string {
  return String((req.params as Record<string, string>).publicId ?? "");
}

function validPublicId(value: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(value);
}

function documentResponse(row: Awaited<ReturnType<typeof listOwnedDocuments>>[number]) {
  return {
    id: row.id,
    categoryId: row.categoryId,
    fileName: row.fileName,
    format: row.format,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    contentHashSha256: row.contentHashSha256,
    status: row.status,
    trustedContent: row.trustedContent,
    promptInjectionRisk: row.promptInjectionRisk,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
  };
}

async function ownerCase(req: Request) {
  const customer = await authenticateCustomerRequest(req as never);
  if (!customer) return null;
  const publicId = publicIdOf(req);
  if (!validPublicId(publicId)) return null;
  const db = await requireR1Database();
  const ownedCase = await findOwnedCaseByPublicId(db, customer.accountId, publicId);
  if (!ownedCase) return null;
  const grant = await findActiveOwnedAccessGrant(db, customer.accountId, ownedCase.id);
  if (!grant) return null;
  const payment = (await db.select({ tariffCode: paymentRecords.tariffCode }).from(paymentRecords).where(and(
    eq(paymentRecords.customerAccountId, customer.accountId),
    eq(paymentRecords.diagnosticCaseId, ownedCase.id),
  )).limit(1))[0];
  if (payment?.tariffCode !== DOCUMENT_TARIFF_CODE) return null;
  return { customer, db, ownedCase, grant, publicId };
}

export function registerR1DocumentRoutes(app: Express): void {
  app.get("/api/r1/cases/:publicId/documents", async (req, res) => {
    try {
      assertTechnicalPilotAllowed();
      const owner = await ownerCase(req as never);
      if (!owner) return deny(res);
      const rows = await listOwnedDocuments(owner.db, {
        customerAccountId: owner.customer.accountId,
        diagnosticCaseId: owner.ownedCase.id,
      });
      res.setHeader("Cache-Control", "private, no-store");
      res.json({ documents: rows.map(documentResponse) });
    } catch (error) {
      console.error("[R2 documents] list failed:", error);
      res.status(500).json({ error: "Document list unavailable" });
    }
  });

  app.post("/api/r1/cases/:publicId/documents", express.raw({ limit: "25mb", type: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"] }), async (req, res) => {
    try {
      assertTechnicalPilotAllowed();
      const owner = await ownerCase(req as never);
      if (!owner) return deny(res);
      const contentType = String(req.headers["content-type"] ?? "").split(";", 1)[0].trim();
      const fileName = String(req.headers["x-lexy-file-name"] ?? "");
      const category = String(req.headers["x-lexy-document-category"] ?? "");
      const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? "");
      if (!bytes.length) return res.status(400).json({ error: "Empty document" });
      const manifest = await createOwnedDocumentManifest(owner.db, {
        customerAccountId: owner.customer.accountId,
        diagnosticCaseId: owner.ownedCase.id,
        fileName,
        category,
        mimeType: contentType,
        bytes,
      });
      res.status(201).setHeader("Cache-Control", "private, no-store").json({ document: documentResponse(manifest) });
    } catch (error) {
      if (error instanceof DocumentAccessDeniedError) return res.status(error.code === "tariff_not_eligible" ? 403 : 404).json({ error: "Document upload unavailable" });
      if (error instanceof Error && error.name === "DocumentIntakeValidationError") return res.status(400).json({ error: "Document upload rejected" });
      console.error("[R2 documents] upload failed:", error);
      res.status(500).json({ error: "Document upload unavailable" });
    }
  });

  app.get("/api/r1/cases/:publicId/documents/:documentId/download", async (req, res) => {
    try {
      assertTechnicalPilotAllowed();
      const owner = await ownerCase(req as never);
      if (!owner) return deny(res);
      const documentId = String((req.params as Record<string, string>).documentId ?? "");
      const document = await findOwnedDocument(owner.db, {
        id: documentId,
        customerAccountId: owner.customer.accountId,
        diagnosticCaseId: owner.ownedCase.id,
      });
      if (!document || document.status === "deleted") return deny(res);
      const signedUrl = await storageGetSignedUrl(document.storageKey);
      res.redirect(307, signedUrl);
    } catch (error) {
      console.error("[R2 documents] download failed:", error);
      res.status(500).json({ error: "Document download unavailable" });
    }
  });

  app.delete("/api/r1/cases/:publicId/documents/:documentId", async (req, res) => {
    try {
      assertTechnicalPilotAllowed();
      const owner = await ownerCase(req as never);
      if (!owner) return deny(res);
      const documentId = String((req.params as Record<string, string>).documentId ?? "");
      const document = await tombstoneOwnedDocument(owner.db, {
        id: documentId,
        customerAccountId: owner.customer.accountId,
        diagnosticCaseId: owner.ownedCase.id,
        now: new Date(),
      });
      if (!document) return deny(res);
      res.status(200).setHeader("Cache-Control", "private, no-store").json({ document: documentResponse(document) });
    } catch (error) {
      console.error("[R2 documents] delete failed:", error);
      res.status(500).json({ error: "Document deletion unavailable" });
    }
  });
}
