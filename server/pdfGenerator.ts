/**
 * PDF Report Generator for Neolex
 * Generates beautiful branded PDF reports for free and paid diagnostics
 */

import puppeteer from "puppeteer";

export interface FreePdfData {
  type: "free";
  sessionToken: string;
  riskCategory: string;
  totalScore: number;
  hasCriticalEvent: boolean;
  mainConclusion: string;
  riskBlocks: Array<{
    id: string;
    title: string;
    severity: string;
    what: string;
    why: string;
    cost: string;
    impact: string;
    action: string;
    legalBasis: string;
  }>;
  contact?: {
    name?: string | null;
    email?: string | null;
    productName?: string | null;
    website?: string | null;
  } | null;
  generatedAt: string;
}

export interface PaidPdfData {
  type: "paid";
  sessionToken: string;
  riskCategory: string;
  totalScore: number;
  criticalTriggers: string[];
  riskBlocks: Array<{
    title: string;
    riskLevel: string;
    whatFound: string;
    whyItMatters: string;
    legalBasis: string;
    financialRange: string;
    whatToDo: string;
  }>;
  keyFindings: string[];
  missingDocuments: string[];
  roadmap: {
    immediate?: string[];
    days30?: string[];
    days60?: string[];
    days90?: string[];
    scaling?: string[];
  };
  reportMarkdown?: string;
  productName?: string;
  generatedAt: string;
}

const RISK_LABELS: Record<string, string> = {
  low: "Низкий",
  moderate: "Умеренный",
  high: "Высокий",
  critical: "Критический",
};

const RISK_COLORS: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  low: { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0", badge: "#dcfce7" },
  moderate: { bg: "#fefce8", text: "#a16207", border: "#fde68a", badge: "#fef9c3" },
  high: { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa", badge: "#ffedd5" },
  critical: { bg: "#fef2f2", text: "#b91c1c", border: "#fecaca", badge: "#fee2e2" },
};

const SEVERITY_COLORS: Record<string, { dot: string; bg: string; text: string }> = {
  critical: { dot: "#ef4444", bg: "#fef2f2", text: "#b91c1c" },
  high: { dot: "#f97316", bg: "#fff7ed", text: "#c2410c" },
  moderate: { dot: "#eab308", bg: "#fefce8", text: "#a16207" },
  low: { dot: "#22c55e", bg: "#f0fdf4", text: "#15803d" },
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildFreeReportHtml(data: FreePdfData): string {
  const rc = data.riskCategory as string;
  const colors = RISK_COLORS[rc] || RISK_COLORS.moderate;
  const label = RISK_LABELS[rc] || rc;

  const riskBlocksHtml = data.riskBlocks
    .map((block) => {
      const sc = SEVERITY_COLORS[block.severity] || SEVERITY_COLORS.moderate;
      const sevLabel = RISK_LABELS[block.severity] || block.severity;
      return `
      <div class="risk-card">
        <div class="risk-card-header">
          <div class="risk-dot" style="background:${sc.dot}"></div>
          <div class="risk-card-title">${escapeHtml(block.title)}</div>
          <span class="severity-badge" style="background:${sc.bg};color:${sc.text}">${sevLabel}</span>
        </div>
        <div class="risk-card-body">
          <div class="risk-field">
            <div class="risk-field-label">Суть риска</div>
            <div class="risk-field-value">${escapeHtml(block.what)}</div>
          </div>
          <div class="risk-field">
            <div class="risk-field-label">Почему это важно</div>
            <div class="risk-field-value">${escapeHtml(block.why)}</div>
          </div>
          <div class="risk-grid-2">
            <div class="risk-cost-box">
              <div class="risk-field-label" style="color:#b91c1c">Денежные последствия</div>
              <div class="risk-field-value">${escapeHtml(block.cost)}</div>
            </div>
            <div class="risk-impact-box">
              <div class="risk-field-label" style="color:#c2410c">Влияние на бизнес</div>
              <div class="risk-field-value">${escapeHtml(block.impact)}</div>
            </div>
          </div>
          <div class="risk-action-box">
            <div class="risk-field-label" style="color:#1d4ed8">Что проверить</div>
            <div class="risk-field-value">${escapeHtml(block.action)}</div>
          </div>
          <div class="legal-basis">Правовое основание: ${escapeHtml(block.legalBasis)}</div>
        </div>
      </div>`;
    })
    .join("");

  const zoneLabels: Array<{ id: string; label: string }> = [
    { id: "ip_rights", label: "Права на продукт" },
    { id: "personal_data", label: "Персональные данные" },
    { id: "personal_data_special", label: "Спец. категории данных" },
    { id: "data_storage", label: "Хранение данных" },
    { id: "documents", label: "Документы" },
    { id: "consumer_protection", label: "Защита потребителей" },
    { id: "payments", label: "Платёжная модель" },
    { id: "contractors", label: "Подрядчики" },
    { id: "regulated_sector", label: "Регулируемая сфера" },
  ];
  const activeIds = new Set(data.riskBlocks.map((b) => b.id));

  const matrixHtml = zoneLabels
    .map((z) => {
      const block = data.riskBlocks.find((b) => b.id === z.id);
      const isActive = activeIds.has(z.id);
      const sc = block ? SEVERITY_COLORS[block.severity] : null;
      return `<div class="matrix-cell ${isActive ? "matrix-cell-active" : "matrix-cell-inactive"}" style="${isActive && sc ? `background:${sc.bg};color:${sc.text};border-color:${sc.dot}` : ""}">
        <div class="matrix-dot" style="background:${isActive && sc ? sc.dot : "#d1d5db"}"></div>
        <span>${escapeHtml(z.label)}</span>
      </div>`;
    })
    .join("");

  const productLine = data.contact?.productName
    ? `<div class="meta-line"><span class="meta-label">Продукт:</span> ${escapeHtml(data.contact.productName)}</div>`
    : "";
  const nameLine = data.contact?.name
    ? `<div class="meta-line"><span class="meta-label">Для:</span> ${escapeHtml(data.contact.name)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',sans-serif;background:#fff;color:#111827;font-size:13px;line-height:1.6}
  
  /* Cover */
  .cover{background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 60%,#1d4ed8 100%);min-height:297mm;padding:48px 56px;display:flex;flex-direction:column;justify-content:space-between;page-break-after:always}
  .cover-logo{display:flex;align-items:center;gap:10px;margin-bottom:auto}
  .cover-logo-icon{width:40px;height:40px;background:rgba(255,255,255,0.15);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:#fff;border:1px solid rgba(255,255,255,0.2)}
  .cover-logo-text{font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.5px}
  .cover-badge{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:100px;padding:6px 14px;color:rgba(255,255,255,0.7);font-size:11px;font-weight:500;margin-bottom:24px;width:fit-content}
  .cover-title{font-size:42px;font-weight:900;color:#fff;line-height:1.15;letter-spacing:-1px;margin-bottom:16px}
  .cover-subtitle{font-size:16px;color:rgba(255,255,255,0.6);margin-bottom:48px;max-width:480px;line-height:1.6}
  .cover-risk-box{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:20px;padding:28px 32px;margin-bottom:40px}
  .cover-risk-label{font-size:11px;font-weight:600;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
  .cover-risk-value{font-size:32px;font-weight:900;color:#fff;margin-bottom:4px}
  .cover-risk-score{font-size:13px;color:rgba(255,255,255,0.5)}
  .cover-meta{border-top:1px solid rgba(255,255,255,0.1);padding-top:24px;display:flex;justify-content:space-between;align-items:flex-end}
  .cover-meta-left{display:flex;flex-direction:column;gap:4px}
  .meta-line{font-size:12px;color:rgba(255,255,255,0.5)}
  .meta-label{font-weight:600;color:rgba(255,255,255,0.7)}
  .cover-disclaimer{font-size:10px;color:rgba(255,255,255,0.3);max-width:280px;text-align:right;line-height:1.5}

  /* Content pages */
  .page{padding:48px 56px;page-break-after:always}
  .page:last-child{page-break-after:auto}
  .page-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:40px;padding-bottom:20px;border-bottom:2px solid #f3f4f6}
  .page-header-logo{display:flex;align-items:center;gap:8px}
  .page-header-logo-icon{width:28px;height:28px;background:#0f172a;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;color:#fff}
  .page-header-logo-text{font-size:14px;font-weight:800;color:#0f172a}
  .page-header-tag{font-size:11px;color:#9ca3af;font-weight:500}
  
  /* Section headers */
  .section-title{font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.5px;margin-bottom:6px}
  .section-subtitle{font-size:13px;color:#6b7280;margin-bottom:24px}
  
  /* Risk summary hero */
  .risk-hero{border-radius:16px;padding:28px;margin-bottom:32px;border:2px solid}
  .risk-hero-top{display:flex;align-items:flex-start;gap:16px;margin-bottom:16px}
  .risk-hero-icon{width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;border:1.5px solid}
  .risk-hero-badges{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}
  .risk-badge{display:inline-flex;align-items:center;padding:4px 12px;border-radius:100px;font-size:11px;font-weight:700;border:1.5px solid}
  .risk-hero-title{font-size:24px;font-weight:900;color:#0f172a;letter-spacing:-0.5px;margin-bottom:10px}
  .risk-hero-conclusion{font-size:13px;color:#374151;line-height:1.7}
  
  /* Score stats */
  .stats-row{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:32px}
  .stat-box{background:#f9fafb;border:1px solid #f3f4f6;border-radius:14px;padding:20px;text-align:center}
  .stat-value{font-size:32px;font-weight:900;color:#0f172a;line-height:1}
  .stat-label{font-size:11px;color:#9ca3af;margin-top:6px;font-weight:500}
  
  /* Matrix */
  .matrix-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
  .matrix-cell{border-radius:10px;padding:10px 12px;border:1.5px solid #e5e7eb;display:flex;align-items:center;gap:8px;font-size:11.5px;font-weight:500;color:#6b7280}
  .matrix-cell-active{font-weight:600}
  .matrix-cell-inactive{background:#f9fafb}
  .matrix-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
  .matrix-legend{display:flex;gap:20px;padding-top:14px;border-top:1px solid #f3f4f6}
  .legend-item{display:flex;align-items:center;gap:6px;font-size:11px;color:#6b7280}
  .legend-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
  
  /* Risk cards */
  .risk-card{border:1.5px solid #e5e7eb;border-radius:16px;overflow:hidden;margin-bottom:16px;page-break-inside:avoid}
  .risk-card-header{display:flex;align-items:center;gap:12px;padding:16px 20px;background:#f9fafb;border-bottom:1px solid #f3f4f6}
  .risk-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
  .risk-card-title{font-size:14px;font-weight:700;color:#0f172a;flex:1}
  .severity-badge{padding:3px 10px;border-radius:100px;font-size:10.5px;font-weight:700}
  .risk-card-body{padding:20px}
  .risk-field{margin-bottom:14px}
  .risk-field-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#9ca3af;margin-bottom:5px}
  .risk-field-value{font-size:12.5px;color:#374151;line-height:1.6}
  .risk-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
  .risk-cost-box{background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px}
  .risk-impact-box{background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px}
  .risk-action-box{background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px;margin-bottom:14px}
  .legal-basis{font-size:11px;color:#9ca3af;font-family:monospace;padding:8px 12px;background:#f9fafb;border-radius:8px;border:1px solid #f3f4f6}
  
  /* Disclaimer */
  .disclaimer{background:#f9fafb;border:1px solid #f3f4f6;border-radius:12px;padding:16px 20px;margin-top:24px}
  .disclaimer-text{font-size:11px;color:#9ca3af;line-height:1.7}
  
  /* Footer */
  .pdf-footer{position:fixed;bottom:0;left:0;right:0;padding:12px 56px;background:#fff;border-top:1px solid #f3f4f6;display:flex;justify-content:space-between;align-items:center}
  .pdf-footer-left{font-size:10px;color:#d1d5db;font-weight:600}
  .pdf-footer-right{font-size:10px;color:#d1d5db}
  
  @media print{
    .pdf-footer{display:none}
  }
  @page{margin:0;size:A4}
</style>
</head>
<body>

<!-- COVER PAGE -->
<div class="cover">
  <div class="cover-logo">
    <div class="cover-logo-icon">N</div>
    <div class="cover-logo-text">Neolex</div>
  </div>
  
  <div>
    <div class="cover-badge">⚡ Экспресс-диагностика · Бесплатный отчёт</div>
    <div class="cover-title">Отчёт о правовых рисках IT-продукта</div>
    <div class="cover-subtitle">Предварительная правовая оценка на основе ответов на вопросы диагностики. Результаты носят информационный характер.</div>
    
    <div class="cover-risk-box">
      <div class="cover-risk-label">Категория риска</div>
      <div class="cover-risk-value" style="color:${colors.text}">${label}</div>
      <div class="cover-risk-score">Итоговый балл: ${data.totalScore}${data.hasCriticalEvent ? " · Обнаружено критическое событие" : ""}</div>
    </div>
  </div>
  
  <div class="cover-meta">
    <div class="cover-meta-left">
      ${nameLine}
      ${productLine}
      <div class="meta-line"><span class="meta-label">Дата:</span> ${formatDate(data.generatedAt)}</div>
      <div class="meta-line"><span class="meta-label">Сервис:</span> Lexy by Neolex</div>
    </div>
    <div class="cover-disclaimer">Диагностика носит информационный характер и не является юридической консультацией или правовым заключением.</div>
  </div>
</div>

<!-- RESULTS PAGE -->
<div class="page">
  <div class="page-header">
    <div class="page-header-logo">
      <div class="page-header-logo-icon">N</div>
      <div class="page-header-logo-text">Neolex</div>
    </div>
    <div class="page-header-tag">Отчёт о правовых рисках · ${formatDate(data.generatedAt)}</div>
  </div>

  <!-- Risk hero -->
  <div class="risk-hero" style="background:${colors.bg};border-color:${colors.border}">
    <div class="risk-hero-top">
      <div class="risk-hero-icon" style="background:${colors.badge};border-color:${colors.border}">
        ${rc === "low" ? "✓" : rc === "moderate" ? "!" : rc === "high" ? "⚠" : "✕"}
      </div>
      <div style="flex:1">
        <div class="risk-hero-badges">
          <span class="risk-badge" style="background:${colors.badge};color:${colors.text};border-color:${colors.border}">${label} риск</span>
          <span class="risk-badge" style="background:#f3f4f6;color:#6b7280;border-color:#e5e7eb">Балл: ${data.totalScore}</span>
          ${data.hasCriticalEvent ? `<span class="risk-badge" style="background:#fee2e2;color:#b91c1c;border-color:#fecaca">Критическое событие</span>` : ""}
        </div>
        <div class="risk-hero-title">Категория риска: ${label}</div>
        <div class="risk-hero-conclusion">${escapeHtml(data.mainConclusion)}</div>
      </div>
    </div>
  </div>

  <!-- Matrix -->
  <div class="section-title">Матрица зон риска</div>
  <div class="section-subtitle">Выявленные и невыявленные зоны правовой уязвимости</div>
  <div class="matrix-grid">
    ${matrixHtml}
  </div>
  <div class="matrix-legend">
    <div class="legend-item"><div class="legend-dot" style="background:#ef4444"></div>Критично</div>
    <div class="legend-item"><div class="legend-dot" style="background:#f97316"></div>Высокий</div>
    <div class="legend-item"><div class="legend-dot" style="background:#eab308"></div>Умеренный</div>
    <div class="legend-item"><div class="legend-dot" style="background:#d1d5db"></div>Не выявлен</div>
  </div>
</div>

<!-- RISK BLOCKS PAGE(S) -->
${
  data.riskBlocks.length > 0
    ? `<div class="page">
  <div class="page-header">
    <div class="page-header-logo">
      <div class="page-header-logo-icon">N</div>
      <div class="page-header-logo-text">Neolex</div>
    </div>
    <div class="page-header-tag">Выявленные риски (${data.riskBlocks.length})</div>
  </div>
  <div class="section-title">Выявленные риски</div>
  <div class="section-subtitle">Детальный анализ каждой зоны правовой уязвимости</div>
  ${riskBlocksHtml}
  <div class="disclaimer">
    <div class="risk-field-label" style="margin-bottom:6px">Важное уведомление</div>
    <div class="disclaimer-text">Данная диагностика носит информационный характер и не является юридической консультацией. Результаты основаны на ваших ответах и не учитывают полный контекст деятельности компании. Для получения юридически значимых выводов необходима работа с реальными документами. Сервис Lexy by Neolex.</div>
  </div>
</div>`
    : ""
}

</body>
</html>`;
}

function buildPaidReportHtml(data: PaidPdfData): string {
  const rc = data.riskCategory as string;
  const colors = RISK_COLORS[rc] || RISK_COLORS.moderate;
  const label = RISK_LABELS[rc] || rc;

  const riskBlocksHtml = (data.riskBlocks || [])
    .map((block) => {
      const sc = SEVERITY_COLORS[block.riskLevel] || SEVERITY_COLORS.moderate;
      const sevLabel = RISK_LABELS[block.riskLevel] || block.riskLevel;
      return `
      <div class="risk-card">
        <div class="risk-card-header">
          <div class="risk-dot" style="background:${sc.dot}"></div>
          <div class="risk-card-title">${escapeHtml(block.title)}</div>
          <span class="severity-badge" style="background:${sc.bg};color:${sc.text}">${sevLabel}</span>
        </div>
        <div class="risk-card-body">
          <div class="risk-grid-2">
            <div class="risk-field">
              <div class="risk-field-label">Что обнаружено</div>
              <div class="risk-field-value">${escapeHtml(block.whatFound || "")}</div>
            </div>
            <div class="risk-field">
              <div class="risk-field-label">Почему важно</div>
              <div class="risk-field-value">${escapeHtml(block.whyItMatters || "")}</div>
            </div>
          </div>
          <div class="risk-grid-2">
            <div class="risk-cost-box">
              <div class="risk-field-label" style="color:#b91c1c">Финансовые последствия</div>
              <div class="risk-field-value">${escapeHtml(block.financialRange || "")}</div>
            </div>
            <div class="risk-action-box" style="margin-bottom:0">
              <div class="risk-field-label" style="color:#1d4ed8">Что делать</div>
              <div class="risk-field-value">${escapeHtml(block.whatToDo || "")}</div>
            </div>
          </div>
          <div class="legal-basis" style="margin-top:12px">Правовое основание: ${escapeHtml(block.legalBasis || "")}</div>
        </div>
      </div>`;
    })
    .join("");

  const roadmapSections = [
    { key: "immediate", label: "Немедленно", color: "#fef2f2", border: "#fecaca", textColor: "#b91c1c" },
    { key: "days30", label: "30 дней", color: "#fff7ed", border: "#fed7aa", textColor: "#c2410c" },
    { key: "days60", label: "60 дней", color: "#fefce8", border: "#fde68a", textColor: "#a16207" },
    { key: "days90", label: "90 дней", color: "#f0fdf4", border: "#bbf7d0", textColor: "#15803d" },
    { key: "scaling", label: "Масштабирование", color: "#eff6ff", border: "#bfdbfe", textColor: "#1d4ed8" },
  ];

  const roadmapHtml = roadmapSections
    .map(({ key, label: rl, color, border, textColor }) => {
      const items = (data.roadmap as Record<string, string[]>)[key] || [];
      if (!items.length) return "";
      return `<div style="background:${color};border:1.5px solid ${border};border-radius:14px;padding:18px;break-inside:avoid">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:${textColor};margin-bottom:10px">${rl}</div>
        <ul style="list-style:none;padding:0;margin:0">
          ${items.map((item) => `<li style="font-size:12px;color:#374151;padding:4px 0;border-bottom:1px solid rgba(0,0,0,0.05);display:flex;gap:8px;align-items:flex-start"><span style="color:${textColor};font-weight:700;flex-shrink:0">→</span>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </div>`;
    })
    .join("");

  const keyFindingsHtml = (data.keyFindings || [])
    .map((f) => `<li style="font-size:12.5px;color:#374151;padding:6px 0;border-bottom:1px solid #f3f4f6;display:flex;gap:8px;align-items:flex-start"><span style="color:#1d4ed8;font-weight:700;flex-shrink:0">✓</span>${escapeHtml(f)}</li>`)
    .join("");

  const missingDocsHtml = (data.missingDocuments || [])
    .map((d) => `<li style="font-size:12.5px;color:#374151;padding:6px 0;border-bottom:1px solid #f3f4f6;display:flex;gap:8px;align-items:flex-start"><span style="color:#ef4444;font-weight:700;flex-shrink:0">✕</span>${escapeHtml(d)}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',sans-serif;background:#fff;color:#111827;font-size:13px;line-height:1.6}
  
  .cover{background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 60%,#7c3aed 100%);min-height:297mm;padding:48px 56px;display:flex;flex-direction:column;justify-content:space-between;page-break-after:always}
  .cover-logo{display:flex;align-items:center;gap:10px}
  .cover-logo-icon{width:40px;height:40px;background:rgba(255,255,255,0.15);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:#fff;border:1px solid rgba(255,255,255,0.2)}
  .cover-logo-text{font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.5px}
  .cover-badge{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:100px;padding:6px 14px;color:rgba(255,255,255,0.7);font-size:11px;font-weight:500;margin-bottom:24px;width:fit-content}
  .cover-title{font-size:40px;font-weight:900;color:#fff;line-height:1.15;letter-spacing:-1px;margin-bottom:12px}
  .cover-product{font-size:18px;color:rgba(255,255,255,0.5);margin-bottom:40px}
  .cover-risk-box{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:20px;padding:28px 32px;margin-bottom:32px}
  .cover-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:40px}
  .cover-stat{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:16px;text-align:center}
  .cover-stat-value{font-size:28px;font-weight:900;color:#fff}
  .cover-stat-label{font-size:10px;color:rgba(255,255,255,0.4);margin-top:4px;font-weight:500}
  .cover-meta{border-top:1px solid rgba(255,255,255,0.1);padding-top:24px;display:flex;justify-content:space-between;align-items:flex-end}
  .meta-line{font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:3px}
  .meta-label{font-weight:600;color:rgba(255,255,255,0.7)}
  .cover-disclaimer{font-size:10px;color:rgba(255,255,255,0.3);max-width:280px;text-align:right;line-height:1.5}
  
  .page{padding:48px 56px;page-break-after:always}
  .page:last-child{page-break-after:auto}
  .page-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:36px;padding-bottom:18px;border-bottom:2px solid #f3f4f6}
  .page-header-logo{display:flex;align-items:center;gap:8px}
  .page-header-logo-icon{width:28px;height:28px;background:#0f172a;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;color:#fff}
  .page-header-logo-text{font-size:14px;font-weight:800;color:#0f172a}
  .page-header-tag{font-size:11px;color:#9ca3af;font-weight:500}
  
  .section-title{font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.5px;margin-bottom:6px}
  .section-subtitle{font-size:13px;color:#6b7280;margin-bottom:24px}
  
  .risk-card{border:1.5px solid #e5e7eb;border-radius:16px;overflow:hidden;margin-bottom:16px;page-break-inside:avoid}
  .risk-card-header{display:flex;align-items:center;gap:12px;padding:16px 20px;background:#f9fafb;border-bottom:1px solid #f3f4f6}
  .risk-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
  .risk-card-title{font-size:14px;font-weight:700;color:#0f172a;flex:1}
  .severity-badge{padding:3px 10px;border-radius:100px;font-size:10.5px;font-weight:700}
  .risk-card-body{padding:20px}
  .risk-field{margin-bottom:14px}
  .risk-field-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#9ca3af;margin-bottom:5px}
  .risk-field-value{font-size:12.5px;color:#374151;line-height:1.6}
  .risk-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
  .risk-cost-box{background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px}
  .risk-action-box{background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px}
  .legal-basis{font-size:11px;color:#9ca3af;font-family:monospace;padding:8px 12px;background:#f9fafb;border-radius:8px;border:1px solid #f3f4f6}
  
  .critical-box{background:#fef2f2;border:1.5px solid #fecaca;border-radius:14px;padding:20px;margin-bottom:24px}
  .critical-title{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;color:#b91c1c;margin-bottom:12px}
  .critical-item{font-size:12.5px;color:#7f1d1d;padding:5px 0;border-bottom:1px solid rgba(239,68,68,0.1);display:flex;gap:8px;align-items:flex-start}
  
  .roadmap-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  
  .disclaimer{background:#f9fafb;border:1px solid #f3f4f6;border-radius:12px;padding:16px 20px;margin-top:24px}
  .disclaimer-text{font-size:11px;color:#9ca3af;line-height:1.7}
  
  @page{margin:0;size:A4}
</style>
</head>
<body>

<!-- COVER -->
<div class="cover">
  <div class="cover-logo">
    <div class="cover-logo-icon">N</div>
    <div class="cover-logo-text">Neolex</div>
  </div>
  
  <div>
    <div class="cover-badge">🔍 Углублённая диагностика · Полный отчёт</div>
    <div class="cover-title">Углублённый отчёт о правовых рисках</div>
    ${data.productName ? `<div class="cover-product">${escapeHtml(data.productName)}</div>` : ""}
    
    <div class="cover-risk-box">
      <div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Категория риска</div>
      <div style="font-size:32px;font-weight:900;color:${colors.text};margin-bottom:4px">${label}</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.5)">Итоговый балл: ${data.totalScore}</div>
    </div>
    
    <div class="cover-stats">
      <div class="cover-stat">
        <div class="cover-stat-value">${data.totalScore}</div>
        <div class="cover-stat-label">Общий балл</div>
      </div>
      <div class="cover-stat">
        <div class="cover-stat-value" style="color:#f87171">${(data.criticalTriggers || []).length}</div>
        <div class="cover-stat-label">Критических</div>
      </div>
      <div class="cover-stat">
        <div class="cover-stat-value" style="color:#fb923c">${(data.riskBlocks || []).length}</div>
        <div class="cover-stat-label">Зон риска</div>
      </div>
    </div>
  </div>
  
  <div class="cover-meta">
    <div>
      <div class="meta-line"><span class="meta-label">Дата:</span> ${formatDate(data.generatedAt)}</div>
      <div class="meta-line"><span class="meta-label">Сервис:</span> Lexy by Neolex</div>
    </div>
    <div class="cover-disclaimer">Углублённая диагностика носит информационный характер и не является юридической консультацией или правовым заключением.</div>
  </div>
</div>

<!-- KEY FINDINGS PAGE -->
${
  (data.keyFindings?.length > 0 || data.criticalTriggers?.length > 0)
    ? `<div class="page">
  <div class="page-header">
    <div class="page-header-logo">
      <div class="page-header-logo-icon">N</div>
      <div class="page-header-logo-text">Neolex</div>
    </div>
    <div class="page-header-tag">Ключевые выводы</div>
  </div>
  
  ${
    data.criticalTriggers?.length > 0
      ? `<div class="critical-box">
    <div class="critical-title">⚠ Критические триггеры (${data.criticalTriggers.length})</div>
    ${data.criticalTriggers.map((t) => `<div class="critical-item"><span style="color:#ef4444;font-weight:700;flex-shrink:0">!</span>${escapeHtml(t)}</div>`).join("")}
  </div>`
      : ""
  }
  
  ${
    data.keyFindings?.length > 0
      ? `<div class="section-title">Ключевые выводы</div>
  <div class="section-subtitle">Наиболее значимые результаты диагностики</div>
  <ul style="list-style:none;padding:0;margin:0 0 24px">
    ${keyFindingsHtml}
  </ul>`
      : ""
  }
  
  ${
    data.missingDocuments?.length > 0
      ? `<div class="section-title">Отсутствующие документы</div>
  <div class="section-subtitle">Документы, которые необходимо разработать или восстановить</div>
  <ul style="list-style:none;padding:0;margin:0">
    ${missingDocsHtml}
  </ul>`
      : ""
  }
</div>`
    : ""
}

<!-- RISK BLOCKS PAGE -->
${
  data.riskBlocks?.length > 0
    ? `<div class="page">
  <div class="page-header">
    <div class="page-header-logo">
      <div class="page-header-logo-icon">N</div>
      <div class="page-header-logo-text">Neolex</div>
    </div>
    <div class="page-header-tag">Выявленные риски (${data.riskBlocks.length})</div>
  </div>
  <div class="section-title">Выявленные риски</div>
  <div class="section-subtitle">Детальный анализ каждой зоны правовой уязвимости</div>
  ${riskBlocksHtml}
</div>`
    : ""
}

<!-- ROADMAP PAGE -->
${
  roadmapHtml
    ? `<div class="page">
  <div class="page-header">
    <div class="page-header-logo">
      <div class="page-header-logo-icon">N</div>
      <div class="page-header-logo-text">Neolex</div>
    </div>
    <div class="page-header-tag">Дорожная карта</div>
  </div>
  <div class="section-title">Дорожная карта устранения рисков</div>
  <div class="section-subtitle">Приоритизированный план действий: немедленно, 30, 60, 90 дней и масштабирование</div>
  <div class="roadmap-grid">
    ${roadmapHtml}
  </div>
  <div class="disclaimer" style="margin-top:32px">
    <div class="risk-field-label" style="margin-bottom:6px">Важное уведомление</div>
    <div class="disclaimer-text">Данная диагностика носит информационный характер и не является юридической консультацией. Результаты основаны на ваших ответах. Для получения юридически значимых выводов необходима работа с реальными документами. Сервис Lexy by Neolex.</div>
  </div>
</div>`
    : ""
}

</body>
</html>`;
}

export async function generatePdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
    ],
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 30000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export { buildFreeReportHtml, buildPaidReportHtml };
