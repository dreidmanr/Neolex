import PilotShell from "@/components/r1/PilotShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ArrowRight, ClipboardCheck, LockKeyhole, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

function StatusPanel({
  tone,
  title,
  children,
}: {
  tone: "neutral" | "available";
  title: string;
  children: React.ReactNode;
}) {
  const Icon = tone === "available" ? ClipboardCheck : LockKeyhole;

  return (
    <Card className="overflow-hidden border-border shadow-sm">
      <CardHeader className="border-b border-border bg-muted/30 pb-5">
        <div className="flex items-start gap-3">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
              tone === "available"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Технический статус
            </p>
            <CardTitle className="mt-1 font-display text-xl">{title}</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 text-sm leading-relaxed text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  );
}

export default function Pilot() {
  const statusQuery = trpc.pilot.status.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const isSynthetic = statusQuery.data?.mode === "synthetic";

  return (
    <PilotShell
      eyebrow="Контролируемый контур"
      title="Pilot"
      description="Технический контур изолирован от основного пользовательского пути и доступен только в предусмотренном режиме."
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <section aria-live="polite">
          {statusQuery.isLoading && <Skeleton className="h-56 w-full rounded-xl" />}

          {statusQuery.isError && (
            <StatusPanel tone="neutral" title="Проверка статуса временно недоступна">
              <p>
                Технический Pilot находится в разработке. Доступ реальным клиентам пока не
                открыт; финальным условием остаётся legal review.
              </p>
            </StatusPanel>
          )}

          {!statusQuery.isLoading && !statusQuery.isError && !isSynthetic && (
            <StatusPanel tone="neutral" title="Технический Pilot в разработке">
              <p>
                Доступ реальным клиентам пока не открыт. Финальным условием перед любым
                клиентским использованием остаётся legal review.
              </p>
            </StatusPanel>
          )}

          {!statusQuery.isLoading && !statusQuery.isError && isSynthetic && (
            <StatusPanel tone="available" title="Технический тестовый режим">
              <p>
                Среда доступна только для контролируемой технической проверки. Материалы и
                действия для клиентского использования на этой странице не предоставляются.
              </p>
              {statusQuery.data?.promoAccessAvailable === true && (
                <Button asChild className="mt-5 min-h-11" size="lg">
                  <Link href="/pilot/access">
                    Открыть доступ R1
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
              )}
            </StatusPanel>
          )}
        </section>

        <aside className="space-y-3" aria-label="Принципы доступа">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <ShieldCheck className="mb-4 size-5 text-primary" aria-hidden="true" />
            <h2 className="font-display text-base font-800">Контролируемый доступ</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Статус отображается без технических параметров среды и внутренних служебных
              данных.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <AlertTriangle className="mb-4 size-5 text-muted-foreground" aria-hidden="true" />
            <h2 className="font-display text-base font-800">Без клиентского запуска</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Экран не открывает создание сценариев или иные действия, не входящие в этот
              технический increment.
            </p>
          </div>
        </aside>
      </div>
    </PilotShell>
  );
}
