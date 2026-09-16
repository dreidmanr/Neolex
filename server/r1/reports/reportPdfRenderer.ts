import type { ReportViewModel } from "./types";

const esc = (value: string): string => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/\"/g, "&quot;");

const severityLabel: Record<ReportViewModel["overallSeverity"], string> = {
  low: "Низкий", medium: "Средний", high: "Высокий", critical: "Критический",
};
const evidenceLabel: Record<ReportViewModel["risks"][number]["evidenceStatus"], string> = {
  questionnaire_based: "По данным анкеты",
  document_confirmed: "Подтверждено документом",
  not_confirmed_by_document: "Не подтверждено документом",
  additional_document_required: "Нужен дополнительный документ",
  manual_review_required: "Нужна ручная проверка",
};

function list(items: readonly string[]): string {
  return items.length ? `<ul>${items.map(item => `<li>${esc(item)}</li>`).join("")}</ul>` : "<p class=muted>Нет пунктов.</p>";
}
function roadmapSection(label: string, tasks: ReportViewModel["roadmap"]["day0"]): string {
  return `<section><h3>${esc(label)}</h3>${tasks.length ? `<ol>${tasks.map(task => `<li><strong>${esc(task.action)}</strong><br><span class=muted>Подтверждение: ${esc(task.completionEvidence)}${task.requiresExpertReview ? " · Нужна экспертная проверка" : ""}</span></li>`).join("")}</ol>` : `<p class=muted>Нет обязательных действий на этот срок.</p>`}</section>`;
}

export function buildR1ReportHtml(report: ReportViewModel): string {
  return `<!doctype html><html lang=ru><head><meta charset=utf-8><style>
  *{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#172033;margin:0;background:#f7f8fb;font-size:12px;line-height:1.55}
  .page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:18mm 17mm;page-break-after:always}.page:last-child{page-break-after:auto}
  .brand{display:flex;justify-content:space-between;border-bottom:2px solid #e7eaf0;padding-bottom:10px;margin-bottom:24px;font-weight:700}.brand small{color:#7b8494;font-weight:400}
  h1{font-size:28px;line-height:1.18;margin:0 0 12px;color:#101828}h2{font-size:20px;margin:0 0 12px;color:#101828}h3{font-size:14px;margin:16px 0 7px;color:#101828}
  .watermark{border:1px solid #e9b949;background:#fff8df;color:#674f10;padding:10px 12px;border-radius:8px;font-weight:700;margin-bottom:18px}.hero{border-left:5px solid #d92d20;background:#fff1f0;padding:16px;border-radius:8px;margin:18px 0}.hero .severity{font-size:16px;font-weight:700;color:#b42318}.summary{font-size:14px;color:#344054}
  .card{border:1px solid #dfe3ea;border-radius:8px;padding:13px;margin:10px 0;page-break-inside:avoid}.card h3{margin-top:0}.tag{display:inline-block;background:#f1f3f7;border-radius:999px;padding:3px 8px;font-size:10px;margin-right:5px}.muted{color:#667085}ul,ol{margin:7px 0 0;padding-left:21px}li{margin:6px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.footer{margin-top:25px;padding-top:10px;border-top:1px solid #e7eaf0;color:#667085;font-size:10px}
  </style></head><body>
  <div class=page><div class=brand><span>Lexy · Neolex</span><small>Технический отчёт v${report.reportVersion}</small></div>
  <div class=watermark>${esc(report.watermark)}</div><p class=muted>${esc(report.documentStatus === "draft_preliminary" ? "Предварительный результат" : "Архивная версия")}</p>
  <h1>${esc(report.title)}</h1><p class=summary>${esc(report.summary)}</p>
  <div class=hero><div class=muted>Общий профиль риска</div><div class=severity>${esc(severityLabel[report.overallSeverity])}</div></div>
  <h2>Рекомендация</h2><div class=card><h3>${esc(report.recommendation.displayName)}</h3><p>${report.recommendation.fixedPackageOfferAllowed ? "Допустимо рассмотреть фиксированный пакет услуг." : "Фиксированный пакет услуг не предлагается без дополнительной проверки."}</p></div>
  <div class=footer>Сформировано: ${esc(new Date(report.generatedAt).toLocaleString("ru-RU"))}. Это технический тестовый документ, не юридическое заключение.</div></div>
  <div class=page><div class=brand><span>Lexy · Риски</span><small>${report.risks.length} пунктов</small></div><h2>Риски и основания</h2>${report.risks.length ? report.risks.map(risk => `<div class=card><span class=tag>${esc(severityLabel[risk.severity])}</span>${risk.manualReviewRequired ? `<span class=tag>Ручная проверка</span>` : ""}<h3>${esc(risk.title)}</h3><p class=muted>Основание: ${esc(evidenceLabel[risk.evidenceStatus])}</p></div>`).join("") : "<p class=muted>Нет отображаемых блоков риска.</p>"}<h2>Правовые основания</h2>${report.legalBases.map(basis => `<div class=card><h3>${esc(basis.actTitle)}, ${esc(basis.articleReference)}</h3><p>${esc(basis.displayWording)}</p><p class=muted>Статус: ${esc(basis.verificationStatus)}</p></div>`).join("")}</div>
  <div class=page><div class=brand><span>Lexy · План действий</span><small>Roadmap</small></div><h2>План действий</h2>${roadmapSection("Сразу", report.roadmap.day0)}${roadmapSection("В течение 30 дней", report.roadmap.day30)}${roadmapSection("В течение 60 дней", report.roadmap.day60)}${roadmapSection("В течение 90 дней", report.roadmap.day90)}<h2>Ограничения результата</h2>${report.limitations.map(l => `<div class=card><strong>${esc(l.category)}</strong><p>${esc(l.statement)}</p>${l.requiresFollowUp ? `<p><strong>Требуется уточнение.</strong></p>` : ""}</div>`).join("")}<div class=footer>${esc(report.escalation.clientSummary)}${report.escalation.clientCta ? ` ${esc(report.escalation.clientCta)}` : ""}<br>${esc(report.watermark)}</div></div>
  </body></html>`;
}

export const R1_PDF_RENDERER_VERSION = "r1-report-pdf-v2.0.0" as const;
