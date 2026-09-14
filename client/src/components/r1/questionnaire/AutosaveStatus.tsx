import { Button } from "@/components/ui/button";
import type { AutosaveState } from "@/hooks/useQuestionnaireDraft";
import { AlertTriangle, Check, CloudOff, LoaderCircle } from "lucide-react";

const STATUS_TEXT: Record<AutosaveState, string> = {
  idle: "Изменений нет",
  saving: "Сохранение…",
  saved: "Сохранено",
  offline: "Не сохранено",
  conflict: "Конфликт изменений. Проверьте ответ и повторите попытку.",
};

type AutosaveStatusProps = {
  state: AutosaveState;
  onRetry: () => void;
};

export default function AutosaveStatus({ state, onRetry }: AutosaveStatusProps) {
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-end gap-2 text-sm text-muted-foreground">
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="inline-flex min-h-11 items-center gap-2"
      >
        {state === "saving" && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
        {state === "saved" && <Check className="size-4 text-primary" aria-hidden="true" />}
        {state === "offline" && <CloudOff className="size-4 text-destructive" aria-hidden="true" />}
        {state === "conflict" && <AlertTriangle className="size-4 text-amber-700" aria-hidden="true" />}
        <span>{STATUS_TEXT[state]}</span>
      </div>
      {state === "offline" && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 text-base"
          onClick={onRetry}
        >
          Повторить
        </Button>
      )}
    </div>
  );
}
