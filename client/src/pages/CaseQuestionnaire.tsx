import AutosaveStatus from "@/components/r1/questionnaire/AutosaveStatus";
import QuestionRenderer from "@/components/r1/questionnaire/QuestionRenderer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuestionnaireDraft } from "@/hooks/useQuestionnaireDraft";
import type { QuestionnaireAnswerInputDto } from "@shared/r1/questionnaire";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Scale,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";

function hasAnswer(value: QuestionnaireAnswerInputDto | undefined): boolean {
  if (!value) return false;
  if (value.kind === "single") return value.optionId.length > 0;
  if (value.kind === "multi") return value.optionIds.length > 0;
  return value.text.trim().length > 0;
}

function PageSkeleton() {
  return (
    <div
      className="mx-auto max-w-3xl space-y-4"
      aria-label="Загрузка анкеты"
      aria-busy="true"
    >
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-96 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
    </div>
  );
}

function Unavailable() {
  return (
    <Card className="mx-auto max-w-2xl border-border shadow-sm">
      <CardContent className="p-6 sm:p-8">
        <ShieldAlert
          className="size-6 text-muted-foreground"
          aria-hidden="true"
        />
        <h1 className="mt-4 font-display text-2xl font-800">
          Анкета недоступна
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Не удалось получить техническую анкету. Проверьте доступ через кабинет
          и повторите попытку позже.
        </p>
        <Button
          asChild
          variant="outline"
          className="mt-6 min-h-11 w-full sm:w-auto"
        >
          <Link href="/cabinet">Вернуться в кабинет</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function CaseQuestionnaire() {
  const { publicCaseId = "" } = useParams<{ publicCaseId: string }>();
  const publicId = useMemo(() => {
    try {
      return decodeURIComponent(publicCaseId);
    } catch {
      return "";
    }
  }, [publicCaseId]);
  const draft = useQuestionnaireDraft(publicId);
  const [screenQuestionId, setScreenQuestionId] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!draft.activeQuestion) return;
    setScreenQuestionId(draft.activeQuestion.id);
    setValidationMessage(null);
  }, [draft.activeQuestion?.id]);

  useEffect(() => {
    setScreenQuestionId(null);
    setValidationMessage(null);
  }, [publicId]);

  const questions = draft.questionnaire?.visibleQuestions ?? [];
  const question =
    questions.find(item => item.id === screenQuestionId) ??
    draft.activeQuestion;
  const questionIndex = question
    ? questions.findIndex(item => item.id === question.id)
    : -1;
  const displayedAnswer = question
    ? draft.answerForQuestion(question.id)
    : undefined;
  const isCurrentQuestionPending = Boolean(
    question &&
      draft.pendingQuestionId === question.id &&
      (draft.autosaveState === "saving" || draft.autosaveState === "offline")
  );
  const isConflict = draft.autosaveState === "conflict";
  const isNavigationBlocked =
    draft.hasPendingAutosave || draft.autosaveState === "offline" || isConflict;
  const requiredBlocked = Boolean(
    question?.required &&
      (!hasAnswer(displayedAnswer) || isCurrentQuestionPending || isConflict)
  );
  const isSubmitted = draft.submissionReceipt !== null;
  const visibleCount =
    draft.questionnaire?.visibleQuestionCount ?? questions.length;
  const progressValue =
    visibleCount > 0 && questionIndex >= 0
      ? ((questionIndex + 1) / visibleCount) * 100
      : 0;
  const isLastQuestion =
    questionIndex >= 0 && questionIndex === questions.length - 1;
  const canSubmit = Boolean(
    draft.questionnaire &&
      !isSubmitted &&
      draft.submitState !== "submitting" &&
      !draft.hasPendingAutosave &&
      draft.autosaveState !== "offline" &&
      !isConflict
  );

  const handleChange = (value: QuestionnaireAnswerInputDto) => {
    if (!question) return;
    setValidationMessage(null);
    draft.chooseAnswer(question.id, value);
  };

  const handleTextChange = (value: string) => {
    if (!question) return;
    setValidationMessage(null);
    draft.editText(question.id, value);
  };

  const handleClear = () => {
    if (!question) return;
    setValidationMessage(null);
    draft.clearText(question.id);
  };

  const handleNext = () => {
    if (!question) return;
    if (requiredBlocked) {
      setValidationMessage(
        isCurrentQuestionPending
          ? "Дождитесь сохранения обязательного ответа или повторите сохранение."
          : isConflict
            ? "После конфликта проверьте обязательный ответ и сохраните его снова."
            : "Ответьте на обязательный вопрос перед переходом дальше."
      );
      return;
    }
    const nextQuestion = questions[questionIndex + 1];
    if (!nextQuestion) return;
    setScreenQuestionId(nextQuestion.id);
    setValidationMessage(null);
  };

  const handlePrevious = () => {
    const previousQuestion = questions[questionIndex - 1];
    if (!previousQuestion) return;
    setScreenQuestionId(previousQuestion.id);
    setValidationMessage(null);
  };

  const handleSubmit = () => {
    if (!question || !draft.questionnaire || !canSubmit) return;
    if (question.required && !hasAnswer(displayedAnswer)) {
      setValidationMessage("Ответьте на обязательный вопрос перед отправкой.");
      return;
    }
    if (
      draft.questionnaire.activeAnsweredCount <
      draft.questionnaire.requiredActiveCount
    ) {
      setValidationMessage("Заполните обязательные вопросы перед отправкой.");
      return;
    }
    setValidationMessage(null);
    void draft.submit();
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f4f7fb] text-foreground">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#06101f]/95 text-white backdrop-blur supports-[backdrop-filter]:bg-[#06101f]/90">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          {isNavigationBlocked ? (
            <Button
              type="button"
              variant="ghost"
              disabled
              aria-describedby="questionnaire-navigation-blocked"
              className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-1 font-display font-800 outline-none transition-colors hover:text-[#55a6ff] focus-visible:ring-2 focus-visible:ring-[#4a91e8]"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#1677d2] text-white shadow-lg shadow-blue-950/30">
                <Scale className="size-4" aria-hidden="true" />
              </span>
              <span><span className="block truncate text-lg leading-none">Neolex</span><span className="mt-1 block text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Legal Tech · Lexy</span></span>
            </Button>
          ) : (
            <Button
              asChild
              variant="ghost"
              className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-1 font-display font-800 outline-none transition-colors hover:text-[#55a6ff] focus-visible:ring-2 focus-visible:ring-[#4a91e8]"
            >
              <Link href="/cabinet">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#1677d2] text-white shadow-lg shadow-blue-950/30">
                  <Scale className="size-4" aria-hidden="true" />
                </span>
                <span><span className="block truncate text-lg leading-none">Neolex</span><span className="mt-1 block text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Legal Tech · Lexy</span></span>
              </Link>
            </Button>
          )}
          {isNavigationBlocked ? (
            <Button
              type="button"
              variant="ghost"
              disabled
              aria-describedby="questionnaire-navigation-blocked"
              className="min-h-11 shrink-0 px-3"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">В кабинет</span>
            </Button>
          ) : (
            <Button asChild variant="ghost" className="min-h-11 shrink-0 px-3">
              <Link href="/cabinet">
                <ArrowLeft className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">В кабинет</span>
              </Link>
            </Button>
          )}
          {isNavigationBlocked && (
            <p id="questionnaire-navigation-blocked" className="sr-only">
              Переход недоступен, пока текущий ответ не сохранён.
            </p>
          )}
        </div>
        <div className="border-t border-[#1677d2]/30 bg-[#0b2036] px-4 py-2 text-center text-xs font-semibold leading-relaxed text-[#b9d9f8]">
          Технический тестовый контур — не юридическое заключение
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-5 pb-32 sm:px-6 sm:py-8">
        {draft.isLoading && <PageSkeleton />}
        {!draft.isLoading && draft.isUnavailable && <Unavailable />}

        {!draft.isLoading && draft.submissionReceipt && (
          <Card className="mx-auto max-w-3xl border-primary/20 shadow-sm">
            <CardContent className="p-6 text-center sm:p-10">
              <CheckCircle2
                className="mx-auto size-9 text-primary"
                aria-hidden="true"
              />
              <h1 className="mt-4 font-display text-2xl font-800">
                Анкета отправлена
              </h1>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
                Сервер подтвердил отправку технической анкеты.
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Заполнено активных вопросов:{" "}
                {draft.submissionReceipt.activeAnsweredCount} из{" "}
                {draft.submissionReceipt.requiredActiveCount} обязательных.
              </p>
              <Button asChild className="mt-6 min-h-11 w-full sm:w-auto">
                <Link href="/cabinet">Вернуться в кабинет</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {!draft.isLoading && draft.questionnaire && question && (
          <div className="mx-auto max-w-3xl">
            <section
              aria-label="Ход заполнения"
              className="rounded-xl border border-border bg-background p-4 shadow-sm sm:p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.13em] text-primary">
                    Раздел {question.blockId}
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    Вопрос {questionIndex + 1} из {visibleCount}
                  </p>
                </div>
                <AutosaveStatus
                  state={draft.autosaveState}
                  onRetry={draft.retrySave}
                />
              </div>
              <Progress
                value={progressValue}
                aria-label={`Прогресс: вопрос ${questionIndex + 1} из ${visibleCount}`}
                className="mt-3"
              />
            </section>

            {draft.autosaveState === "conflict" && (
              <Alert className="mt-4 border-amber-500/30 bg-amber-50">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Ответы обновлены с сервера</AlertTitle>
                <AlertDescription>
                  Возник конфликт изменений. Проверьте актуальный ответ и
                  выберите или введите его снова.
                </AlertDescription>
              </Alert>
            )}

            {draft.submitState === "offline" && (
              <Alert variant="destructive" className="mt-4">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Анкета не отправлена</AlertTitle>
                <AlertDescription>
                  Повторите отправку, когда соединение восстановится.
                </AlertDescription>
              </Alert>
            )}

            {draft.submitState === "conflict" && (
              <Alert className="mt-4 border-amber-500/30 bg-amber-50">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Состояние анкеты изменилось</AlertTitle>
                <AlertDescription>
                  Сервер вернул актуальную версию. Проверьте ответы и повторите
                  отправку.
                </AlertDescription>
              </Alert>
            )}

            <Card className="mt-4 shadow-sm">
              <CardContent className="p-5 sm:p-8">
                <QuestionRenderer
                  question={question}
                  value={displayedAnswer}
                  disabled={draft.isSaveRequestPending}
                  validationMessage={validationMessage}
                  onChange={handleChange}
                  onTextChange={handleTextChange}
                  onClear={handleClear}
                />
              </CardContent>
            </Card>

            {!isSubmitted && (
              <div className="mt-4 rounded-xl border border-border bg-background p-4 text-sm text-muted-foreground shadow-sm">
                Заполнено активных вопросов:{" "}
                {draft.questionnaire.activeAnsweredCount}. Обязательных активных
                вопросов: {draft.questionnaire.requiredActiveCount}.
              </div>
            )}
          </div>
        )}
      </main>

      {!draft.isLoading && draft.questionnaire && question && !isSubmitted && (
        <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur supports-[backdrop-filter]:bg-background/90">
          <div className="mx-auto grid max-w-3xl grid-cols-2 gap-3 px-4 sm:flex sm:px-6">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full text-base sm:w-auto"
              onClick={handlePrevious}
              disabled={questionIndex <= 0 || isNavigationBlocked}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Назад
            </Button>
            {!isLastQuestion ? (
              <Button
                type="button"
                className="min-h-11 w-full text-base sm:ml-auto sm:w-auto"
                onClick={handleNext}
                disabled={isNavigationBlocked}
              >
                Далее
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            ) : (
              <Button
                type="button"
                className="min-h-11 w-full text-base sm:ml-auto sm:w-auto"
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                {draft.submitState === "submitting" ? "Отправка…" : "Отправить"}
              </Button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
