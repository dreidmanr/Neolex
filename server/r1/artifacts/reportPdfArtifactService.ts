import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { reportPdfArtifacts, type ReportPdfArtifact } from "../../../drizzle/schema";
import type { R1Database } from "../database";
import { storagePut } from "../../storage";
import { generatePdf } from "../../pdfGenerator";
import { buildR1ReportHtml, R1_PDF_RENDERER_VERSION } from "../reports/reportPdfRenderer";
import { deriveReportViewModel } from "../reports/reportViewModel";
import type { ValidatedReportSnapshot } from "../reports/types";

export { R1_PDF_RENDERER_VERSION };

export async function findOwnedPdfArtifact(
  db: R1Database,
  input: { customerAccountId: string; diagnosticCaseId: string; reportSnapshotId: string },
): Promise<ReportPdfArtifact | null> {
  const rows = await db.select().from(reportPdfArtifacts).where(and(
    eq(reportPdfArtifacts.customerAccountId, input.customerAccountId),
    eq(reportPdfArtifacts.diagnosticCaseId, input.diagnosticCaseId),
    eq(reportPdfArtifacts.reportSnapshotId, input.reportSnapshotId),
    eq(reportPdfArtifacts.rendererVersion, R1_PDF_RENDERER_VERSION),
  )).limit(1);
  return rows[0] ?? null;
}

export async function persistPdfArtifactForReadyReport(
  db: R1Database,
  input: { customerAccountId: string; diagnosticCaseId: string; reportSnapshotId: string; payloadJson: ValidatedReportSnapshot },
): Promise<ReportPdfArtifact> {
  const existing = await findOwnedPdfArtifact(db, input);
  if (existing?.status === "ready") return existing;

  const viewModel = deriveReportViewModel(input.payloadJson);
  const pdf = await generatePdf(buildR1ReportHtml(viewModel));
  const contentHash = createHash("sha256").update(pdf).digest("hex");
  const uploaded = await storagePut(
    `r1/reports/${input.reportSnapshotId}/${R1_PDF_RENDERER_VERSION}.pdf`,
    pdf,
    "application/pdf",
  );
  const row = {
    id: existing?.id ?? `pdf_${createHash("sha256").update(`${input.reportSnapshotId}:${R1_PDF_RENDERER_VERSION}`).digest("hex").slice(0, 40)}`,
    customerAccountId: input.customerAccountId,
    diagnosticCaseId: input.diagnosticCaseId,
    reportSnapshotId: input.reportSnapshotId,
    rendererVersion: R1_PDF_RENDERER_VERSION,
    status: "ready" as const,
    storageKey: uploaded.key,
    contentHash,
    byteSize: pdf.byteLength,
    failureCode: null,
    completedAt: new Date(),
  };
  try {
    await db.insert(reportPdfArtifacts).values(row);
  } catch (error) {
    const reread = await findOwnedPdfArtifact(db, input);
    if (reread?.status === "ready") return reread;
    throw error;
  }
  return (await findOwnedPdfArtifact(db, input))!;
}
