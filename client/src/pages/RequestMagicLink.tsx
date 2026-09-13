import PilotShell from "@/components/r1/PilotShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, LoaderCircle, Mail, ShieldAlert } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import { Link } from "wouter";

type Feedback = "idle" | "validation" | "success" | "error";

export default function RequestMagicLink() {
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState<Feedback>("idle");
  const emailInputRef = useRef<HTMLInputElement>(null);
  const requestMagicLink = trpc.pilot.auth.requestMagicLink.useMutation();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const value = email;
    if (!value || !emailInputRef.current?.validity.valid) {
      setFeedback("validation");
      emailInputRef.current?.focus();
      return;
    }

    setFeedback("idle");

    try {
      await requestMagicLink.mutateAsync({ email: value });
      setEmail("");
      setFeedback("success");
    } catch {
      setFeedback("error");
    }
  };

  return (
    <PilotShell
      eyebrow="Защищённый вход"
      title="Вход в кабинет Pilot"
      description="Укажите адрес электронной почты, чтобы запросить вход в контролируемый контур."
    >
      <Card className="max-w-lg border-border shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Mail className="size-5" aria-hidden="true" />
          </div>
          <h2 className="mt-5 font-display text-xl font-800">Запросить вход</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Для продолжения нужен адрес электронной почты.
          </p>

          <form className="mt-6 space-y-5" noValidate onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="pilot-email">Адрес электронной почты</Label>
              <Input
                ref={emailInputRef}
                id="pilot-email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (feedback !== "idle") setFeedback("idle");
                }}
                aria-invalid={feedback === "validation"}
                aria-describedby={feedback === "validation" ? "pilot-email-feedback" : undefined}
                className="min-h-11"
                required
              />
            </div>

            <Button
              type="submit"
              className="min-h-11 w-full sm:w-auto"
              size="lg"
              disabled={requestMagicLink.isPending}
            >
              {requestMagicLink.isPending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  Обработка запроса
                </>
              ) : (
                "Продолжить"
              )}
            </Button>
          </form>

          <div id="pilot-email-feedback" className="mt-5" aria-live="polite">
            {feedback === "validation" && (
              <p className="text-sm text-destructive">Укажите корректный адрес электронной почты.</p>
            )}
            {feedback === "success" && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm leading-relaxed text-foreground">
                <CheckCircle2 className="mb-2 size-5 text-primary" aria-hidden="true" />
                <p>
                  Запрос принят. Если доступ к кабинету предусмотрен, продолжите вход в
                  установленном порядке.
                </p>
                <Button asChild variant="outline" className="mt-4 min-h-11">
                  <Link href="/pilot">Вернуться к статусу Pilot</Link>
                </Button>
              </div>
            )}
            {feedback === "error" && (
              <div className="flex gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm leading-relaxed text-foreground">
                <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
                <p>Не удалось обработать запрос. Повторите попытку позже.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </PilotShell>
  );
}
