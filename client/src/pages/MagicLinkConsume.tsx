import PilotShell from "@/components/r1/PilotShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, LoaderCircle, RotateCcw, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
type ConsumeStatus = "processing" | "success" | "retry";
type ConsumeResponse = {
  consumed?: unknown;
};
function hasConsumedMagicLink(response: unknown): response is ConsumeResponse {
  return (
    typeof response === "object" &&
    response !== null &&
    "consumed" in response &&
    (response as ConsumeResponse).consumed === true
  );
}
export default function MagicLinkConsume() {
  const [, setLocation] = useLocation();
  const [token] = useState(() => window.location.hash.slice(1));
  const [status, setStatus] = useState<ConsumeStatus>(() =>
    token ? "processing" : "retry",
  );
  const consumptionStarted = useRef(false);
  useEffect(() => {
    if (!token) {
      if (!consumptionStarted.current) setStatus("retry");
      return;
    }
    if (consumptionStarted.current) return;
    consumptionStarted.current = true;
    window.history.replaceState(null, "", "/auth/consume");
    const consume = async () => {
      try {
        const response = await fetch("/api/r1/auth/magic-link/consume", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Referrer-Policy": "no-referrer",
          },
          referrerPolicy: "no-referrer",
          cache: "no-store",
          body: JSON.stringify({ token }),
        });
        const result: unknown = await response.json().catch(() => null);
        setStatus(response.ok && hasConsumedMagicLink(result) ? "success" : "retry");
      } catch {
        setStatus("retry");
      }
    };
    void consume();
  }, [token]);
  useEffect(() => {
    if (status !== "success") return;
    const redirectTimer = window.setTimeout(() => {
      setLocation("/cabinet", { replace: true });
    }, 600);
    return () => window.clearTimeout(redirectTimer);
  }, [setLocation, status]);
  return (
    <PilotShell
      eyebrow="Защищённый вход"
      title="Подтверждение входа"
      description="Проверяем возможность открыть контролируемый кабинет."
    >
      <Card className="max-w-lg border-border shadow-sm">
        <CardContent className="p-6 sm:p-8" aria-live="polite">
          {status === "processing" && (
            <div>
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
              </div>
              <h2 className="mt-5 font-display text-xl font-800">Подтверждаем вход</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Пожалуйста, не закрывайте эту страницу.
              </p>
            </div>
          )}
          {status === "success" && (
            <div>
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <CheckCircle2 className="size-5" aria-hidden="true" />
              </div>
              <h2 className="mt-5 font-display text-xl font-800">Вход подтверждён</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Открываем защищённый кабинет.
              </p>
              <Button asChild variant="outline" className="mt-5 min-h-11">
                <Link href="/cabinet" replace>
                  Перейти в кабинет
                </Link>
              </Button>
            </div>
          )}
          {status === "retry" && (
            <div>
              <div className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <ShieldAlert className="size-5" aria-hidden="true" />
              </div>
              <h2 className="mt-5 font-display text-xl font-800">Не удалось подтвердить вход</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Запрос больше не действует или не может быть обработан. Запросите новый вход и
                повторите попытку.
              </p>
              <Button asChild className="mt-5 min-h-11">
                <Link href="/auth/request-link">
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Запросить новый вход
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </PilotShell>
  );
}
