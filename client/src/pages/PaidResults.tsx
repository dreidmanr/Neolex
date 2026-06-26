import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Shield, AlertTriangle, ChevronRight, X, Check } from "lucide-react";
import { useState } from "react";

export default function PaidResults() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();

  const { data, isLoading, error } = trpc.paid.getReport.useQuery(
    { sessionToken: token ?? "" },
    { enabled: !!token }
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-gray-900 flex items-center justify-center mx-auto animate-pulse">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <p className="text-gray-500">Загружаем отчёт...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4 max-w-sm">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto" />
          <h2 className="text-xl font-bold text-gray-900">Отчёт не найден</h2>
          <p className="text-gray-500 text-sm">Проверьте ссылку или пройдите диагностику заново.</p>
          <button onClick={() => navigate("/paid")} className="px-6 py-3 bg-gray-900 text-white rounded-xl font-semibold text-sm">
            Начать диагностику
          </button>
        </div>
      </div>
    );
  }

  // Build scoring object from report fields
  const scoring = {
    riskCategory: data.report.riskCategory,
    totalScore: data.report.totalRiskScore ?? 0,
    criticalTriggers: (data.report.criticalTriggers as string[]) ?? [],
    riskBlocks: (data.report.riskBlocks as any[]) ?? [],
    keyFindings: (data.report.keyFindings as string[]) ?? [],
    missingDocuments: (data.report.missingDocuments as string[]) ?? [],
    roadmap: (data.report.roadmap as any) ?? {},
    nextStep: (data.report.nextStep as any) ?? null,
    scopeLimitations: (data.report.scopeAndLimitations as string[]) ?? [],
  };
  const reportMarkdown = data.report.reportMarkdown ?? "";
  const productName = data.session.productName ?? "";

  const riskColors: Record<string, string> = {
    low: "text-green-700 bg-green-50 border-green-200",
    moderate: "text-yellow-700 bg-yellow-50 border-yellow-200",
    high: "text-orange-700 bg-orange-50 border-orange-200",
    critical: "text-red-700 bg-red-50 border-red-200",
  };
  const riskLabels: Record<string, string> = {
    low: "Низкий", moderate: "Умеренный", high: "Высокий", critical: "Критический",
  };

  const category = scoring.riskCategory as string;
  const colorClass = riskColors[category] ?? riskColors.moderate;
  const label = riskLabels[category] ?? category;

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 text-gray-900 hover:opacity-70 transition-opacity">
            <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center">
              <span className="text-white font-bold text-xs">N</span>
            </div>
            <span className="font-semibold text-sm">Neolex</span>
          </button>
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${colorClass}`}>
            <Shield className="w-3 h-3" />
            Риск: {label}
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-12 space-y-10">
        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold text-gray-900">Отчёт о правовых рисках</h1>
          {productName && <p className="text-gray-500">{productName}</p>}
        </div>

        {/* Score summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-2xl">
            <div className="text-3xl font-bold text-gray-900">{scoring.totalScore}</div>
            <div className="text-xs text-gray-500 mt-1">Общий балл</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-2xl">
            <div className="text-3xl font-bold text-red-600">{scoring.criticalTriggers?.length ?? 0}</div>
            <div className="text-xs text-gray-500 mt-1">Критических</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-2xl">
            <div className="text-3xl font-bold text-orange-600">{scoring.riskBlocks?.length ?? 0}</div>
            <div className="text-xs text-gray-500 mt-1">Зон риска</div>
          </div>
        </div>

        {/* Critical triggers */}
        {scoring.criticalTriggers?.length > 0 && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-red-800">
              <AlertTriangle className="w-5 h-5" />
              Критические триггеры
            </div>
            <ul className="space-y-1.5">
              {scoring.criticalTriggers.map((t: string, i: number) => (
                <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                  <span className="text-red-400 mt-0.5">•</span>{t}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Risk blocks */}
        {scoring.riskBlocks?.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-900">Выявленные риски</h2>
            {scoring.riskBlocks.map((rb: any, i: number) => (
              <RiskBlockCard key={i} block={rb} />
            ))}
          </div>
        )}

        {/* Full report */}
        {reportMarkdown && (
          <div className="border border-gray-100 rounded-2xl p-6 space-y-4">
            <h2 className="text-xl font-bold text-gray-900">Полный отчёт</h2>
            <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap">
              {reportMarkdown}
            </div>
          </div>
        )}

        {/* Roadmap */}
        {scoring.roadmap && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-900">Дорожная карта</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { key: "immediate", label: "Немедленно", color: "bg-red-50 border-red-100" },
                { key: "days30", label: "30 дней", color: "bg-orange-50 border-orange-100" },
                { key: "days60", label: "60 дней", color: "bg-yellow-50 border-yellow-100" },
                { key: "days90", label: "90 дней", color: "bg-green-50 border-green-100" },
                { key: "scaling", label: "Масштабирование", color: "bg-blue-50 border-blue-100" },
              ].map(({ key, label, color }) => {
                const items = scoring.roadmap[key] as string[];
                if (!items?.length) return null;
                return (
                  <div key={key} className={`border rounded-2xl p-4 ${color}`}>
                    <div className="font-semibold text-gray-800 mb-2 text-sm">{label}</div>
                    <ul className="space-y-1">
                      {items.map((item: string, i: number) => (
                        <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                          <span className="mt-0.5">•</span>{item}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Missing documents */}
        {scoring.missingDocuments?.length > 0 && (
          <div className="bg-gray-50 rounded-2xl p-5 space-y-3">
            <h3 className="font-semibold text-gray-900">Отсутствующие документы</h3>
            <ul className="space-y-1.5">
              {scoring.missingDocuments.map((d: string, i: number) => (
                <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                  <X className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  {d}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Next step */}
        {scoring.nextStep && (
          <div className="bg-gray-900 rounded-3xl p-8 text-white text-center space-y-4">
            <div className="text-sm text-gray-400 uppercase tracking-wider">Следующий шаг</div>
            <h3 className="text-2xl font-bold">{scoring.nextStep.title}</h3>
            <p className="text-gray-300 max-w-md mx-auto">{scoring.nextStep.description}</p>
            <button className="px-8 py-3 bg-white text-gray-900 rounded-xl font-semibold hover:bg-gray-100 active:scale-[0.98] transition-all duration-150">
              Связаться с Lexy
            </button>
          </div>
        )}

        <div className="text-center">
          <button onClick={() => navigate("/")} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            Вернуться на главную
          </button>
        </div>
      </div>
    </div>
  );
}

function RiskBlockCard({ block }: { block: any }) {
  const [open, setOpen] = useState(false);
  const levelColors: Record<string, string> = {
    low: "bg-green-100 text-green-700",
    moderate: "bg-yellow-100 text-yellow-700",
    high: "bg-orange-100 text-orange-700",
    critical: "bg-red-100 text-red-700",
  };
  const levelLabels: Record<string, string> = {
    low: "Низкий", moderate: "Умеренный", high: "Высокий", critical: "Критический",
  };

  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${levelColors[block.riskLevel] ?? levelColors.moderate}`}>
            {levelLabels[block.riskLevel] ?? block.riskLevel}
          </span>
          <span className="font-medium text-gray-900 text-sm">{block.title}</span>
        </div>
        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-3 border-t border-gray-50">
          <div className="grid md:grid-cols-2 gap-3 pt-3">
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Что обнаружено</div>
              <div className="text-sm text-gray-700">{block.whatFound}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Почему важно</div>
              <div className="text-sm text-gray-700">{block.whyItMatters}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Правовое основание</div>
              <div className="text-sm text-gray-700">{block.legalBasis}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Финансовые последствия</div>
              <div className="text-sm text-orange-700 font-medium">{block.financialRange}</div>
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Что делать</div>
            <div className="text-sm text-gray-700">{block.whatToDo}</div>
          </div>
        </div>
      )}
    </div>
  );
}
