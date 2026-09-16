import PilotShell from "@/components/r1/PilotShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowLeft,
  FileWarning,
  ShieldAlert,
} from "lucide-react";
import { Link, useParams } from "wouter";

const SEVERITY_LABELS = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
  critical: "Критический",
} as const;

const EVIDENCE_LABELS = {
  questionnaire_based: "По данным анкеты",
  document_confirmed: "Подтверждено документом",
  not_confirmed_by_document: "Не подтверждено документом",
  additional_document_required: "Нужен дополнительный документ",
  manual_review_required: "Нужна ручная проверка",
} as const;

function ReportSkeleton() {
  return (
    <div
      className="space-y-4"
      aria-label="Загрузка технического отчёта"
      aria-busy="true"
    >
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-44 w-full rounded-xl" />
      <Skeleton className="h-36 w-full rounded-xl" />
    </div>
  );
}

function UnavailableReport({ signedIn }: { signedIn: boolean }) {
  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-6 sm:p-8">
        <AlertTriangle className="size-7 text-amber-700" aria-hidden="true" />
        <h2 className="mt-4 font-display text-xl font-800">Отчёт недоступен</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {signedIn
            ? "Готовый технический отчёт не найден или у текущей сессии нет доступа. Подробности не раскрываются."
            : "Для просмотра требуется действующая защищённая сессия кабинета."}
        </p>
        <Button asChild className="mt-6 min-h-11">
          <Link href={signedIn ? "/cabinet" : "/auth/request-link"}>
            {signedIn ? "Вернуться в кабинет" : "Запросить вход"}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function CaseReport() {
  const { publicId = "" } = useParams<{ publicId: string }>();
  const validLocator = publicId.length >= 16 && publicId.length <= 64;
  const meQuery = trpc.pilot.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const reportQuery = trpc.pilot.reports.getByCase.useQuery(
    { publicId },
    {
      enabled: Boolean(meQuery.data) && validLocator,
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const report = reportQuery.data;

  return (
    <PilotShell
      eyebrow="Защищённый контур"
      title="Технический отчёт"
      description="Предварительный результат доступен только владельцу записи в активной защищённой сессии."
    >
      <Button
        asChild
        variant="outline"
        className="mb-5 min-h-11 w-full sm:w-auto"
      >
        <Link href="/cabinet">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Вернуться в кабинет
        </Link>
      </Button>

      {(meQuery.isLoading || (meQuery.data && reportQuery.isLoading)) && (
        <ReportSkeleton />
      )}

      {!meQuery.isLoading && (meQuery.isError || !meQuery.data) && (
        <UnavailableReport signedIn={false} />
      )}

      {meQuery.data && (!validLocator || reportQuery.isError) && (
        <UnavailableReport signedIn />
      )}

      {meQuery.data &&
        !reportQuery.isLoading &&
        !reportQuery.isError &&
        validLocator &&
        !report && <UnavailableReport signedIn />}

      {report && (
        <article className="space-y-5" aria-labelledby="report-title">
          <div className="rounded-xl border-2 border-amber-600 bg-amber-50 px-4 py-4 text-amber-950 shadow-sm sm:px-6">
            <div className="flex items-start gap-3">
              <FileWarning
                className="mt-0.5 size-6 shrink-0"
                aria-hidden="true"
              />
              <div>
                <p className="font-display text-sm font-900 uppercase tracking-[0.12em]">
                  Технический тестовый черновик
                </p>
                <p className="mt-1 text-sm font-semibold leading-relaxed">
                  {report.watermark}
                </p>
              </div>
            </div>
          </div>

          <Card className="gap-4 border-border shadow-sm">
            <CardHeader className="px-5 sm:px-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Версия {report.reportVersion}</Badge>
                <Badge variant="outline">
                  {SEVERITY_LABELS[report.overallSeverity]} риск
                </Badge>
              </div>
              <CardTitle
                id="report-title"
                className="mt-3 font-display text-2xl leading-tight sm:text-3xl"
              >
                {report.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 text-sm leading-relaxed text-muted-foreground sm:px-6 sm:text-base">
              {report.summary}
            </CardContent>
          </Card>

          <section aria-labelledby="risks-title">
            <h2 id="risks-title" className="font-display text-xl font-800">
              Риски
            </h2>
            {report.risks.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                В готовой проекции нет отображаемых блоков риска.
              </p>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {report.risks.map(risk => (
                  <Card key={risk.riskId} className="gap-3 py-5 shadow-sm">
                    <CardHeader className="px-5">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">
                          {SEVERITY_LABELS[risk.severity]}
                        </Badge>
                        {risk.manualReviewRequired && (
                          <Badge variant="outline">Ручная проверка</Badge>
                        )}
                      </div>
                      <CardTitle className="mt-2 font-display text-lg leading-snug">
                        {risk.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 text-sm text-muted-foreground">
                      Основание: {EVIDENCE_LABELS[risk.evidenceStatus]}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="legal-bases-title">
            <h2 id="legal-bases-title" className="font-display text-xl font-800">
              Правовые основания
            </h2>
            <div className="mt-3 space-y-3">
              {report.legalBases.map(basis => (
                <Card key={basis.legalBasisId} className="gap-2 py-4 shadow-sm">
                  <CardHeader className="px-5">
                    <CardTitle className="font-display text-base leading-snug">
                      {basis.actTitle}, {basis.articleReference}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 text-sm leading-relaxed text-muted-foreground">
                    {basis.displayWording}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section aria-labelledby="roadmap-title">
            <h2 id="roadmap-title" className="font-display text-xl font-800">
              План действий
            </h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {([
                ["day0", "Сразу"],
                ["day30", "В течение 30 дней"],
                ["day60", "В течение 60 дней"],
                ["day90", "В течение 90 дней"],
              ] as const).map(([period, label]) => (
                <Card key={period} className="gap-2 py-4 shadow-sm">
                  <CardHeader className="px-5">
                    <CardTitle className="font-display text-base">{label}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-5">
                    {report.roadmap[period].length === 0 ? (
                      <p className="text-sm text-muted-foreground">Нет обязательных действий на этот срок.</p>
                    ) : (
                      <ul className="space-y-3 text-sm leading-relaxed">
                        {report.roadmap[period].map((task, index) => (
                          <li key={`${period}-${index}`}>
                            <p className="font-semibold">{task.action}</p>
                            <p className="mt-1 text-muted-foreground">Подтверждение: {task.completionEvidence}</p>
                            {task.requiresExpertReview && (
                              <p className="mt-1 font-semibold text-amber-800">Нужна экспертная проверка.</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <Card className="gap-3 border-primary/20 shadow-sm">
            <CardHeader className="px-5 sm:px-6">
              <CardTitle className="font-display text-xl">
                Рекомендация
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 sm:px-6">
              <p className="font-semibold">
                {report.recommendation.displayName}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {report.recommendation.fixedPackageOfferAllowed
                  ? "Допустимо рассмотреть фиксированный пакет услуг."
                  : "Фиксированный пакет услуг не предлагается без дополнительной проверки."}
              </p>
            </CardContent>
          </Card>

          {report.credit && (
            <Card className="gap-3 border-primary/20 shadow-sm">
              <CardHeader className="px-5 sm:px-6">
                <CardTitle className="font-display text-xl">Зачёт стоимости диагностики</CardTitle>
              </CardHeader>
              <CardContent className="px-5 text-sm leading-relaxed text-muted-foreground sm:px-6">
                <p className="font-semibold text-foreground">
                  {report.credit.amountRub.toLocaleString("ru-RU")} {report.credit.currency}
                </p>
                <p className="mt-2">
                  Тестовое право на зачёт: статус «{report.credit.status}», срок до {new Date(report.credit.expiresAt).toLocaleDateString("ru-RU", { timeZone: report.credit.businessTimeZone })}.
                </p>
                <p className="mt-2">Автоматическое списание в этом контуре не включено.</p>
              </CardContent>
            </Card>
          )}

          {report.escalation.required && (
            <Card className="gap-3 border-amber-500/30 shadow-sm">
              <CardHeader className="px-5 sm:px-6">
                <ShieldAlert
                  className="size-5 text-amber-700"
                  aria-hidden="true"
                />
                <CardTitle className="font-display text-xl">
                  Нужна дополнительная проверка
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 text-sm leading-relaxed text-muted-foreground sm:px-6">
                <p>{report.escalation.clientSummary}</p>
                {report.escalation.clientCta && (
                  <p className="mt-3 font-semibold text-foreground">
                    {report.escalation.clientCta}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <section aria-labelledby="limitations-title">
            <h2
              id="limitations-title"
              className="font-display text-xl font-800"
            >
              Ограничения
            </h2>
            {report.limitations.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                В готовой проекции нет дополнительных ограничений.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {report.limitations.map((limitation, index) => (
                  <li
                    key={`${limitation.category}-${index}`}
                    className="rounded-xl border bg-card p-5 text-sm leading-relaxed shadow-sm"
                  >
                    <p className="font-semibold text-foreground">
                      {limitation.category}
                    </p>
                    <p className="mt-2 text-muted-foreground">
                      {limitation.statement}
                    </p>
                    {limitation.requiresFollowUp && (
                      <p className="mt-2 font-semibold text-amber-800">
                        Требуется уточнение.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </article>
      )}
    </PilotShell>
  );
}
