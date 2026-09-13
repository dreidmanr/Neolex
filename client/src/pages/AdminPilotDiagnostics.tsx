import PilotShell from "@/components/r1/PilotShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ClipboardList, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";

const PURPOSE_CODE = "pilot_quality_review";

type DiagnosticStatus =
  | "draft"
  | "access_granted"
  | "in_progress"
  | "submitted"
  | "scoring"
  | "manual_review_required"
  | "report_ready"
  | "failed"
  | "archived";

const STATUS_LABELS: Record<DiagnosticStatus, string> = {
  draft: "Черновик",
  access_granted: "Доступ подтверждён",
  in_progress: "В работе",
  submitted: "Передано в обработку",
  scoring: "Техническая обработка",
  manual_review_required: "Требуется проверка",
  report_ready: "Статус обновлён",
  failed: "Требуется техническая проверка",
  archived: "Архив",
};

function formatDate(value: Date | string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function DiagnosticsSkeleton() {
  return (
    <div className="space-y-3" aria-label="Загрузка диагностики" aria-busy="true">
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
    </div>
  );
}

function RestrictedState({ adminRequired = false }: { adminRequired?: boolean }) {
  return (
    <Card className="max-w-2xl border-border shadow-sm">
      <CardContent className="p-6 sm:p-8">
        <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <LockKeyhole className="size-5" aria-hidden="true" />
        </span>
        <h2 className="mt-5 font-display text-2xl font-800">
          {adminRequired ? "Требуется доступ администратора" : "Диагностика закрыта"}
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {adminRequired
            ? "Эта техническая диагностика доступна только авторизованным администраторам."
            : "Проверка диагностических данных временно недоступна. Попробуйте обновить страницу позже."}
        </p>
      </CardContent>
    </Card>
  );
}

export default function AdminPilotDiagnostics() {
  const authQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const isAdmin = authQuery.data?.role === "admin";
  const diagnosticsQuery = trpc.pilotAdmin.diagnostics.list.useQuery(
    {
      purposeCode: PURPOSE_CODE,
      limit: 25,
    },
    {
      enabled: isAdmin,
      retry: false,
      refetchOnWindowFocus: false,
    },
  );

  return (
    <PilotShell
      admin
      eyebrow="Внутренняя техническая проверка"
      title="Pilot diagnostics"
      description="Минимальный просмотр статусов для контроля качества. В интерфейсе не раскрываются персональные данные, ответы, токены или служебные идентификаторы."
    >
      {authQuery.isLoading && <DiagnosticsSkeleton />}

      {!authQuery.isLoading && !isAdmin && <RestrictedState adminRequired />}

      {!authQuery.isLoading && isAdmin && (
        <section aria-labelledby="diagnostics-title">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
                <h2 id="diagnostics-title" className="font-display text-xl font-800">
                  Статусы записей
                </h2>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Просмотр выполняется для контролируемой проверки качества.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => void diagnosticsQuery.refetch()}
              disabled={diagnosticsQuery.isFetching}
            >
              <RefreshCw
                className={`size-4 ${diagnosticsQuery.isFetching ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              Обновить
            </Button>
          </div>

          {diagnosticsQuery.isLoading && <DiagnosticsSkeleton />}

          {diagnosticsQuery.isError && <RestrictedState />}

          {!diagnosticsQuery.isLoading && !diagnosticsQuery.isError && diagnosticsQuery.data?.items.length === 0 && (
            <Card className="border-dashed shadow-none">
              <CardContent className="p-8 text-center">
                <ClipboardList className="mx-auto size-7 text-muted-foreground" aria-hidden="true" />
                <h3 className="mt-4 font-display text-lg font-800">Записей нет</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                  В техническом контуре пока нет записей для отображения.
                </p>
              </CardContent>
            </Card>
          )}

          {!diagnosticsQuery.isLoading && !diagnosticsQuery.isError && diagnosticsQuery.data && diagnosticsQuery.data.items.length > 0 && (
            <>
              <div className="space-y-3 lg:hidden" aria-label="Список статусов">
                {diagnosticsQuery.data.items.map((item) => (
                  <Card key={item.publicId} className="gap-3 py-4 shadow-sm">
                    <CardHeader className="px-4">
                      <p className="font-mono text-sm font-semibold">{item.publicId}</p>
                      <Badge variant="outline" className="mt-1 w-fit px-2.5 py-1 text-xs">
                        {STATUS_LABELS[item.status as DiagnosticStatus] ?? "Технический статус"}
                      </Badge>
                    </CardHeader>
                    <CardContent className="px-4 text-sm text-muted-foreground">
                      Обновлено {formatDate(item.updatedAt)}
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="hidden overflow-x-auto rounded-xl border border-border bg-card shadow-sm lg:block">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <caption className="sr-only">Минимальная таблица статусов Pilot</caption>
                  <thead className="border-b border-border bg-muted/35 text-xs uppercase tracking-[0.1em] text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-5 py-4 font-bold">Публичный идентификатор</th>
                      <th scope="col" className="px-5 py-4 font-bold">Статус</th>
                      <th scope="col" className="px-5 py-4 font-bold">Контур</th>
                      <th scope="col" className="px-5 py-4 text-right font-bold">Обновлено</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {diagnosticsQuery.data.items.map((item) => (
                      <tr key={item.publicId} className="transition-colors hover:bg-muted/20">
                        <td className="px-5 py-4 font-mono text-xs font-semibold text-foreground">
                          {item.publicId}
                        </td>
                        <td className="px-5 py-4">
                          <Badge variant="outline" className="px-2.5 py-1">
                            {STATUS_LABELS[item.status as DiagnosticStatus] ?? "Технический статус"}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 text-muted-foreground">{item.tier}</td>
                        <td className="px-5 py-4 text-right text-muted-foreground">
                          {formatDate(item.updatedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!diagnosticsQuery.isLoading && !diagnosticsQuery.isError && diagnosticsQuery.data?.nextCursor && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              Для следующей страницы требуется отдельный контролируемый запрос.
            </div>
          )}
        </section>
      )}
    </PilotShell>
  );
}
