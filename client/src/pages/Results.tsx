import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Scale, AlertTriangle, CheckCircle2, XCircle, Info, ChevronDown, ChevronUp, Star, MessageSquare, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { RISK_CATEGORY_LABELS, UPSELL_TEXTS } from "../../../shared/diagnosticData";
import type { RiskCategory, RiskBlock } from "../../../shared/diagnosticData";
import { ReportSharePanel } from "@/components/ReportSharePanel";

// ── Feedback Form ──────────────────────────────────────────────────────────
function FeedbackForm({ sessionToken }: { sessionToken?: string }) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [usefulnessRating, setUsefulnessRating] = useState(0);
  const [hoverUsefulness, setHoverUsefulness] = useState(0);
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null);
  const [foundAccurate, setFoundAccurate] = useState<boolean | null>(null);
  const [interestedInPaid, setInterestedInPaid] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = trpc.feedback.submit.useMutation({
    onSuccess: () => setSubmitted(true),
  });

  if (submitted) {
    return (
      <div className="card-premium rounded-2xl p-8 text-center animate-fade-in-up">
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <ThumbsUp className="w-6 h-6 text-green-600" />
        </div>
        <h3 className="font-display font-700 text-lg mb-2">Спасибо за обратную связь!</h3>
        <p className="text-muted-foreground text-sm">Ваш отзыв помогает нам улучшать сервис.</p>
      </div>
    );
  }

  const StarRow = ({
    value, hover, onSet, onHover, onLeave, label,
  }: {
    value: number; hover: number;
    onSet: (n: number) => void;
    onHover: (n: number) => void;
    onLeave: () => void;
    label: string;
  }) => (
    <div>
      <div className="text-sm font-600 text-foreground mb-2">{label}</div>
      <div className="flex gap-1" onMouseLeave={onLeave}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onSet(n)}
            onMouseEnter={() => onHover(n)}
            className="p-0.5 transition-transform hover:scale-110 active:scale-95"
          >
            <Star
              className={`w-7 h-7 transition-colors ${
                n <= (hover || value)
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-muted-foreground/30"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );

  const YesNoRow = ({
    label, value, onChange,
  }: {
    label: string; value: boolean | null; onChange: (v: boolean) => void;
  }) => (
    <div>
      <div className="text-sm font-600 text-foreground mb-2">{label}</div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`px-4 py-1.5 rounded-lg text-sm font-500 border transition-colors ${
            value === true
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border hover:border-primary/50"
          }`}
        >
          Да
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`px-4 py-1.5 rounded-lg text-sm font-500 border transition-colors ${
            value === false
              ? "bg-muted text-foreground border-border"
              : "border-border hover:border-muted"
          }`}
        >
          Нет
        </button>
      </div>
    </div>
  );

  return (
    <div className="card-premium rounded-2xl p-6 sm:p-8 animate-fade-in-up">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <MessageSquare className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-display font-700 text-lg">Обратная связь</h3>
          <p className="text-muted-foreground text-sm">Помогите нам улучшить сервис — это займёт 1 минуту</p>
        </div>
      </div>

      <div className="space-y-6">
        <StarRow
          label="Общая оценка диагностики"
          value={rating}
          hover={hoverRating}
          onSet={setRating}
          onHover={setHoverRating}
          onLeave={() => setHoverRating(0)}
        />

        <StarRow
          label="Насколько полезны результаты?"
          value={usefulnessRating}
          hover={hoverUsefulness}
          onSet={setUsefulnessRating}
          onHover={setHoverUsefulness}
          onLeave={() => setHoverUsefulness(0)}
        />

        <YesNoRow
          label="Результаты диагностики показались вам точными?"
          value={foundAccurate}
          onChange={setFoundAccurate}
        />

        <YesNoRow
          label="Порекомендовали бы вы сервис коллегам?"
          value={wouldRecommend}
          onChange={setWouldRecommend}
        />

        <YesNoRow
          label="Интересна ли вам углублённая диагностика?"
          value={interestedInPaid}
          onChange={setInterestedInPaid}
        />

        <div>
          <div className="text-sm font-600 text-foreground mb-2">Комментарий (необязательно)</div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Что понравилось? Что можно улучшить?"
            rows={3}
            maxLength={2000}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
          />
        </div>

        <button
          type="button"
          disabled={rating === 0 || submitMutation.isPending}
          onClick={() =>
            submitMutation.mutate({
              sessionToken,
              rating,
              usefulnessRating: usefulnessRating || undefined,
              wouldRecommend: wouldRecommend ?? undefined,
              foundAccurate: foundAccurate ?? undefined,
              interestedInPaid: interestedInPaid ?? undefined,
              comment: comment.trim() || undefined,
            })
          }
          className="btn-electric w-full py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitMutation.isPending ? "Отправляем..." : "Отправить отзыв"}
        </button>
        {rating === 0 && (
          <p className="text-xs text-muted-foreground text-center">Поставьте оценку, чтобы отправить отзыв</p>
        )}
      </div>
    </div>
  );
}

const RISK_COLORS: Record<RiskCategory, { bg: string; text: string; border: string; badge: string }> = {
  low: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200", badge: "risk-low" },
  moderate: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200", badge: "risk-moderate" },
  high: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", badge: "risk-high" },
  critical: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", badge: "risk-critical" },
};

const SEVERITY_COLORS: Record<string, { dot: string; label: string; labelText: string }> = {
  critical: { dot: "bg-red-500", label: "bg-red-100", labelText: "text-red-700" },
  high: { dot: "bg-orange-500", label: "bg-orange-100", labelText: "text-orange-700" },
  moderate: { dot: "bg-yellow-500", label: "bg-yellow-100", labelText: "text-yellow-700" },
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "Критично",
  high: "Высокий",
  moderate: "Умеренный",
};

function RiskBlockCard({ block }: { block: RiskBlock }) {
  const [expanded, setExpanded] = useState(false);
  const sc = SEVERITY_COLORS[block.severity] || SEVERITY_COLORS.moderate;

  return (
    <div className="card-premium rounded-2xl overflow-hidden">
      <button
        className="w-full text-left p-6 flex items-start gap-4"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${sc.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display font-700 text-foreground leading-snug">{block.title}</h3>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`text-xs font-600 px-2 py-0.5 rounded-full ${sc.label} ${sc.labelText}`}>
                {SEVERITY_LABELS[block.severity]}
              </span>
              {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed line-clamp-2">{block.what}</p>
        </div>
      </button>

      {expanded && (
        <div className="px-6 pb-6 space-y-4 border-t border-border pt-4">
          <div>
            <div className="text-xs font-700 text-muted-foreground uppercase tracking-wider mb-1.5">Суть риска</div>
            <p className="text-sm text-foreground leading-relaxed">{block.what}</p>
          </div>
          <div>
            <div className="text-xs font-700 text-muted-foreground uppercase tracking-wider mb-1.5">Почему это важно</div>
            <p className="text-sm text-foreground leading-relaxed">{block.why}</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/15">
              <div className="text-xs font-700 text-destructive uppercase tracking-wider mb-1.5">Денежные последствия</div>
              <p className="text-sm text-foreground leading-relaxed">{block.cost}</p>
            </div>
            <div className="p-4 rounded-xl bg-orange-50 border border-orange-200">
              <div className="text-xs font-700 text-orange-700 uppercase tracking-wider mb-1.5">Влияние на бизнес</div>
              <p className="text-sm text-foreground leading-relaxed">{block.impact}</p>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-primary/5 border border-primary/15">
            <div className="text-xs font-700 text-primary uppercase tracking-wider mb-1.5">Что проверить</div>
            <p className="text-sm text-foreground leading-relaxed">{block.action}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="font-mono">{block.legalBasis}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Risk zone matrix
const ZONE_LABELS = [
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

export default function Results() {
  const params = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const [showUpsell, setShowUpsell] = useState(false);

  const { data, isLoading, error } = trpc.diagnostic.getResults.useQuery(
    { sessionToken: params.token || "" },
    { enabled: !!params.token }
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="lexy-avatar w-16 h-16 text-xl mx-auto mb-4">L</div>
          <p className="text-muted-foreground">Загружаем результаты...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="font-display font-700 text-xl mb-2">Результаты не найдены</h2>
          <p className="text-muted-foreground mb-6">Возможно, ссылка устарела или диагностика не была завершена.</p>
          <button onClick={() => navigate("/diagnostic")} className="btn-electric px-6 py-3 rounded-xl">
            Пройти диагностику
          </button>
        </div>
      </div>
    );
  }

  const { result } = data;
  const riskCategory = result.riskCategory as RiskCategory;
  const riskBlocks = (result.riskBlocks as RiskBlock[]) || [];
  const activeRiskIds = new Set(riskBlocks.map((b) => b.id));
  const colors = RISK_COLORS[riskCategory];
  const upsell = UPSELL_TEXTS[riskCategory];
  const categoryLabel = RISK_CATEGORY_LABELS[riskCategory];

  const categoryIcon = {
    low: CheckCircle2,
    moderate: Info,
    high: AlertTriangle,
    critical: XCircle,
  }[riskCategory];
  const CategoryIcon = categoryIcon;

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container flex items-center justify-between h-14">
          <button onClick={() => navigate("/")} className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-primary" />
            <span className="font-display font-700 text-base">Lexy</span>
          </button>
          <div className="text-sm text-muted-foreground">Результаты диагностики</div>
        </div>
      </nav>

      {/* Lexy bar */}
      <div className="bg-muted/40 border-b border-border py-3">
        <div className="container flex items-center gap-3">
          <div className="lexy-avatar text-sm">L</div>
          <div>
            <div className="font-display font-700 text-sm">Lexy</div>
            <div className="text-xs text-muted-foreground">Диагностика завершена · Ниже — ваш персональный отчёт</div>
          </div>
        </div>
      </div>

      <main className="container py-12 max-w-3xl">

        {/* ── RISK CATEGORY HERO ── */}
        <div className={`rounded-2xl p-8 mb-8 border-2 ${colors.bg} ${colors.border} animate-fade-in-up`}>
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${colors.bg} border ${colors.border}`}>
              <CategoryIcon className={`w-6 h-6 ${colors.text}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <span className={`risk-badge ${colors.badge}`}>{categoryLabel} риск</span>
                <span className="text-xs text-muted-foreground">Балл: {result.totalScore}</span>
                {result.hasCriticalEvent && (
                  <span className="risk-badge risk-critical">Критическое событие</span>
                )}
              </div>
              <h1 className="font-display text-2xl font-800 text-foreground mb-3">
                Категория риска: {categoryLabel}
              </h1>
              <p className="text-sm text-foreground/80 leading-relaxed">{result.mainConclusion}</p>
            </div>
          </div>
        </div>

        {/* ── RISK ZONE MATRIX ── */}
        <div className="mb-8 animate-fade-in-up animate-delay-100">
          <h2 className="font-display text-xl font-800 mb-4">Матрица зон риска</h2>
          <div className="card-premium rounded-2xl p-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {ZONE_LABELS.map((zone) => {
                const isActive = activeRiskIds.has(zone.id);
                const block = riskBlocks.find((b) => b.id === zone.id);
                const sc = block ? SEVERITY_COLORS[block.severity] : null;
                return (
                  <div
                    key={zone.id}
                    className={`rounded-xl p-3 border flex items-center gap-2 ${
                      isActive
                        ? `border-current ${sc?.label || "bg-muted"}`
                        : "border-border bg-muted/30"
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? (sc?.dot || "bg-muted-foreground") : "bg-muted-foreground/30"}`} />
                    <span className={`text-xs font-medium leading-tight ${isActive ? (sc?.labelText || "text-foreground") : "text-muted-foreground"}`}>
                      {zone.label}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-2 h-2 rounded-full bg-red-500" /> Критично
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-2 h-2 rounded-full bg-orange-500" /> Высокий
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-2 h-2 rounded-full bg-yellow-500" /> Умеренный
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-2 h-2 rounded-full bg-muted-foreground/30" /> Не выявлен
              </div>
            </div>
          </div>
        </div>

        {/* ── RISK BLOCKS ── */}
        {riskBlocks.length > 0 && (
          <div className="mb-8 animate-fade-in-up animate-delay-200">
            <h2 className="font-display text-xl font-800 mb-4">
              Выявленные риски ({riskBlocks.length})
            </h2>
            <div className="space-y-4">
              {riskBlocks.map((block) => (
                <RiskBlockCard key={block.id} block={block} />
              ))}
            </div>
          </div>
        )}

        {/* ── DISCLAIMER ── */}
        <div className="p-4 rounded-xl bg-muted/50 border border-border mb-6 animate-fade-in-up animate-delay-300">
          <div className="flex items-start gap-3">
            <Info className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Данная диагностика носит информационный характер и не является юридической консультацией. Результаты основаны на ваших ответах и не учитывают полный контекст деятельности компании. Для получения юридически значимых выводов необходима работа с реальными документами.
            </p>
          </div>
        </div>

        {/* ── DOWNLOAD & SHARE ── */}
        <div className="mb-8 animate-fade-in-up animate-delay-350">
          <ReportSharePanel
            pdfUrl={`/api/pdf/free/${params.token}`}
            type="free"
            riskLabel={categoryLabel}
            productName={undefined}
          />
        </div>

        {/* ── UPSELL ── */}
        {riskCategory !== "low" && !showUpsell && (
          <div className="section-dark rounded-2xl p-8 animate-fade-in-up animate-delay-400">
            <div className="flex items-start gap-4 mb-6">
              <div className="lexy-avatar flex-shrink-0">L</div>
              <div>
                <div className="font-display font-700 text-white mb-1">Lexy рекомендует</div>
                <p className="text-white/60 text-sm">На основе результатов вашей диагностики</p>
              </div>
            </div>
            <h3 className="font-display text-2xl font-800 text-white mb-3">{upsell.title}</h3>
            <p className="text-white/70 leading-relaxed mb-6">{upsell.description}</p>
            <div className="space-y-2 mb-8">
              {upsell.points.map((point, i) => (
                <div key={i} className="flex items-center gap-3 text-sm text-white/80">
                  <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                  {point}
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowUpsell(true)}
              className="btn-electric flex items-center gap-2 px-8 py-3 rounded-xl"
            >
              Узнать подробнее
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── UPSELL EXPANDED ── */}
        {showUpsell && (
          <div className="section-dark rounded-2xl p-8 animate-fade-in-up">
            <div className="flex items-start gap-4 mb-6">
              <div className="lexy-avatar flex-shrink-0">L</div>
              <div>
                <div className="font-display font-700 text-white mb-1">Расширенная диагностика</div>
                <p className="text-white/60 text-sm">Следующий шаг для вашего продукта</p>
              </div>
            </div>
            <h3 className="font-display text-2xl font-800 text-white mb-4">{upsell.title}</h3>
            <p className="text-white/70 leading-relaxed mb-6">{upsell.description}</p>
            <div className="space-y-3 mb-8">
              {upsell.points.map((point, i) => (
                <div key={i} className="flex items-center gap-3 text-sm text-white/80">
                  <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                  {point}
                </div>
              ))}
            </div>
            <div className="p-5 rounded-xl bg-white/6 border border-white/12 mb-6">
              <p className="text-white/80 text-sm leading-relaxed">
                Расширенная диагностика проводится с участием юриста на основе ваших реальных документов. Вы получите детальный отчёт с конкретными рекомендациями и приоритетами исправлений.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <a
                href="mailto:hello@lexy.ru?subject=Запрос на расширенную диагностику"
                className="btn-electric flex items-center justify-center gap-2 px-8 py-3 rounded-xl"
              >
                Записаться на расширенную диагностику
                <ArrowRight className="w-4 h-4" />
              </a>
              <button
                onClick={() => setShowUpsell(false)}
                className="btn-ghost-dark flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm"
              >
                Позже
              </button>
            </div>
          </div>
        )}

        {/* Low risk upsell */}
        {riskCategory === "low" && (
          <div className="section-dark rounded-2xl p-8 animate-fade-in-up animate-delay-400">
            <div className="flex items-start gap-4 mb-4">
              <div className="lexy-avatar flex-shrink-0">L</div>
              <div>
                <div className="font-display font-700 text-white mb-1">Lexy</div>
                <p className="text-white/60 text-sm">Хорошие новости — и важная оговорка</p>
              </div>
            </div>
            <h3 className="font-display text-xl font-800 text-white mb-3">{upsell.title}</h3>
            <p className="text-white/70 leading-relaxed mb-6">{upsell.description}</p>
            <a
              href="mailto:hello@lexy.ru?subject=Профилактическая проверка продукта"
              className="btn-electric flex items-center gap-2 px-8 py-3 rounded-xl inline-flex"
            >
              Запросить профилактическую проверку
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        )}

        {/* Feedback Form */}
        <div className="mt-10 animate-fade-in-up animate-delay-500">
          <FeedbackForm sessionToken={params.token} />
        </div>

        {/* New diagnostic */}
        <div className="mt-8 text-center">
          <button
            onClick={() => navigate("/diagnostic")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
          >
            Пройти диагностику заново
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="section-dark py-8 mt-12 border-t border-white/8">
        <div className="container flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-white/50" />
            <span className="font-display font-700 text-white text-sm">Lexy</span>
          </div>
          <p className="text-white/40 text-xs text-center">
            Диагностика носит информационный характер и не является юридической консультацией.
          </p>
        </div>
      </footer>
    </div>
  );
}
