import PilotShell from "@/components/r1/PilotShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, FolderOpen, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

type CaseStatus =
  | "draft"
  | "access_granted"
  | "in_progress"
  | "submitted"
  | "scoring"
  | "manual_review_required"
  | "report_ready"
  | "failed"
  | "archived";

const CASE_STATUS: Record<CaseStatus, { label: string; className: string }> = {
  draft: { label: "Черновик", className: "border-border bg-muted text-muted-foreground" },
  access_granted: { label: "Доступ подтверждён", className: "border-primary/20 bg-primary/10 text-primary" },
  in_progress: { label: "В работе", className: "border-primary/20 bg-primary/10 text-primary" },
  submitted: { label: "Передано в обработку", className: "border-border bg-muted text-muted-foreground" },
  scoring: { label: "Техническая обработка", className: "border-border bg-muted text-muted-foreground" },
  manual_review_required: { label: "Требуется проверка", className: "border-amber-500/30 bg-amber-500/10 text-amber-800" },
  report_ready: { label: "Статус обновлён", className: "border-primary/20 bg-primary/10 text-primary" },
  failed: { label: "Требуется техническая проверка", className: "border-destructive/20 bg-destructive/10 text-destructive" },
  archived: { label: "Архив", className: "border-border bg-muted text-muted-foreground" },
};

function formatDate(value: Date | string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function ClosedCabinet() {
  return (
    <Card className="max-w-2xl border-border shadow-sm">
      <CardContent className="p-6 sm:p-8">
        <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <LockKeyhole className="size-5" aria-hidden="true" />
        </span>
        <h2 className="mt-5 font-display text-2xl font-800">Кабинет закрыт</h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Для просмотра технического контура требуется действующая защищённая сессия.
        </p>
        <Button asChild className="mt-6 min-h-11">
          <Link href="/auth/request-link">Запросить вход</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function CasesSkeleton() {
  return (
    <div className="space-y-3" aria-label="Загрузка списка" aria-busy="true">
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}

export default function Cabinet() {
  const meQuery = trpc.pilot.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const logout = trpc.pilot.auth.logout.useMutation();
  const casesQuery = trpc.pilot.cases.list.useQuery(undefined, {
    enabled: Boolean(meQuery.data),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const refreshCases = () => {
    void casesQuery.refetch();
  };

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
      window.location.assign("/auth/request-link");
    } catch {
      // The existing protected session remains in place; leave the UI available to retry.
    }
  };

  return (
    <PilotShell
      eyebrow="Защищённый контур"
      title="Кабинет"
      description="Здесь отображается только технический статус записей, связанных с текущей защищённой сессией."
    >
      {meQuery.isLoading && <CasesSkeleton />}

      {!meQuery.isLoading && (meQuery.isError || !meQuery.data) && <ClosedCabinet />}

      {!meQuery.isLoading && meQuery.data && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_17rem]">
          <section className="min-w-0" aria-labelledby="cases-title">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="cases-title" className="font-display text-xl font-800">
                  Ваши записи
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Отображаются только записи, доступные текущей сессии.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={refreshCases}
                disabled={casesQuery.isFetching}
              >
                <RefreshCw
                  className={`size-4 ${casesQuery.isFetching ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                Обновить
              </Button>
            </div>

            {casesQuery.isLoading && <CasesSkeleton />}

            {casesQuery.isError && (
              <Card className="border-destructive/20 shadow-sm">
                <CardContent className="flex gap-3 p-6 text-sm text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
                  <div>
                    <h3 className="font-display font-800 text-foreground">Список временно недоступен</h3>
                    <p className="mt-1 leading-relaxed">
                      Не удалось загрузить технический статус записей. Повторите попытку позже.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {!casesQuery.isLoading && !casesQuery.isError && casesQuery.data?.length === 0 && (
              <Card className="border-dashed shadow-none">
                <CardContent className="p-8 text-center">
                  <FolderOpen className="mx-auto size-7 text-muted-foreground" aria-hidden="true" />
                  <h3 className="mt-4 font-display text-lg font-800">Записей пока нет</h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                    В текущей защищённой сессии ещё нет доступных технических записей.
                  </p>
                </CardContent>
              </Card>
            )}

            {!casesQuery.isLoading && !casesQuery.isError && casesQuery.data && casesQuery.data.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <ul className="divide-y divide-border" aria-label="Список собственных записей">
                  {casesQuery.data.map((item) => {
                    const status = CASE_STATUS[item.status as CaseStatus] ?? {
                      label: "Технический статус",
                      className: "border-border bg-muted text-muted-foreground",
                    };
                    return (
                      <li key={item.publicId} className="p-4 sm:p-5">
                        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                          <div className="min-w-0">
                            <p className="text-xs font-bold uppercase tracking-[0.13em] text-muted-foreground">
                              Идентификатор записи
                            </p>
                            <p className="mt-1 truncate font-mono text-sm font-semibold text-foreground">
                              {item.publicId}
                            </p>
                            <p className="mt-2 text-sm text-muted-foreground">
                              Обновлено {formatDate(item.updatedAt)}
                            </p>
                          </div>
                          <Badge variant="outline" className={`w-fit shrink-0 px-3 py-1.5 ${status.className}`}>
                            {status.label}
                          </Badge>
                        </div>
                        {(item.status === "access_granted" || item.status === "in_progress") && (
                          <Button asChild className="mt-4 min-h-11 w-full sm:w-auto">
                            <Link href={`/cabinet/diagnostics/${encodeURIComponent(item.publicId)}/questionnaire`}>
                              Продолжить анкету
                            </Link>
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>

          <aside>
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-3">
                <ShieldCheck className="mb-1 size-5 text-primary" aria-hidden="true" />
                <CardTitle className="font-display text-base">Сессия защищена</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed text-muted-foreground">
                <p>
                  В кабинете не показываются контактные данные, ответы, служебные токены и
                  внутренние идентификаторы.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-5 min-h-11 w-full"
                  onClick={handleLogout}
                  disabled={logout.isPending}
                >
                  {logout.isPending ? "Выход" : "Выйти из кабинета"}
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>
      )}
    </PilotShell>
  );
}
