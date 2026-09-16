import { describe, expect, it } from "vitest";
import { buildR1ReportHtml } from "./reportPdfRenderer";
import { REPORT_TEST_WATERMARK, type ReportViewModel } from "./types";

const report: ReportViewModel = {
  reportId: "report_test_001",
  reportVersion: 1,
  generatedAt: "2026-09-16T12:00:00.000Z",
  watermark: REPORT_TEST_WATERMARK,
  documentStatus: "draft_preliminary",
  title: "Технический отчёт о рисках",
  summary: "Единое резюме для web и PDF.",
  overallSeverity: "critical",
  risks: [{
    riskId: "risk_1",
    title: "Проверить условия подписки",
    severity: "critical",
    evidenceStatus: "manual_review_required",
    manualReviewRequired: true,
  }],
  legalBases: [{
    legalBasisId: "basis_1",
    actTitle: "ГК РФ",
    articleReference: "ст. 437",
    displayWording: "Проверить текст оферты.",
    verificationStatus: "draft_pending_legal_review",
  }],
  roadmap: {
    day0: [{ action: "Проверить путь оплаты", completionEvidence: "Скриншоты", requiresExpertReview: true }],
    day30: [{ action: "Обновить документы", completionEvidence: "Новая версия оферты", requiresExpertReview: false }],
    day60: [], day90: [],
  },
  recommendation: { productCode: "expert_review", displayName: "Экспертный разбор", fixedPackageOfferAllowed: false },
  escalation: { required: true, status: "required_not_routed", clientSummary: "Нужна проверка специалистом.", clientCta: "Подготовить материалы." },
  limitations: [{ category: "Документы", statement: "Документы не загружались.", requiresFollowUp: true }],
  credit: null,
};

describe("R1 PDF renderer", () => {
  it("contains the same semantic content as the web view model", () => {
    const html = buildR1ReportHtml(report);
    for (const value of [
      report.watermark,
      report.title,
      report.summary,
      report.risks[0]!.title,
      report.legalBases[0]!.articleReference,
      report.roadmap.day0[0]!.action,
      report.roadmap.day30[0]!.action,
      report.recommendation.displayName,
      report.limitations[0]!.statement,
    ]) expect(html).toContain(value);
    expect(html).not.toContain("report_test_001");
    expect(html).not.toContain("storageKey");
  });
});
