import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Scale, CheckCircle2, AlertCircle } from "lucide-react";
import { QUESTIONS, CONSENT_VERSIONS } from "../../../shared/diagnosticData";

type Step = "consent" | "contact" | "questionnaire" | "processing";

const SESSION_KEY = "neolex_session_token";

export default function Diagnostic() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("consent");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  // answers: Record<questionId, string | string[]>
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  // Consent state
  const [userAgreementAccepted, setUserAgreementAccepted] = useState(false);
  const [marketingAccepted, setMarketingAccepted] = useState(false);

  // Contact state — phone removed per spec
  const [contactForm, setContactForm] = useState({
    name: "",       // "Как к вам обращаться"
    email: "",
    productName: "",
    website: "",
  });
  const [emailError, setEmailError] = useState("");

  // Mutations
  const createSession = trpc.diagnostic.createSession.useMutation();
  const saveConsents = trpc.diagnostic.saveConsents.useMutation();
  const saveContact = trpc.diagnostic.saveContact.useMutation();
  const saveAnswer = trpc.diagnostic.saveAnswer.useMutation();
  const complete = trpc.diagnostic.complete.useMutation();

  // Restore session from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) setSessionToken(stored);
  }, []);

  // Load saved answers when session token is available
  const { data: savedAnswersData } = trpc.diagnostic.getAnswers.useQuery(
    { sessionToken: sessionToken || "" },
    { enabled: !!sessionToken && step === "questionnaire" }
  );

  useEffect(() => {
    if (savedAnswersData && savedAnswersData.length > 0) {
      const restored: Record<string, string | string[]> = {};
      for (const row of savedAnswersData) {
        // Prefer answerIds array if available (multi-select)
        const ids = row.answerIds as string[] | null;
        if (ids && Array.isArray(ids) && ids.length > 1) {
          restored[row.questionId] = ids;
        } else {
          restored[row.questionId] = row.answerId;
        }
      }
      setAnswers((prev) => ({ ...restored, ...prev }));
    }
  }, [savedAnswersData]);

  // Init session on mount if none
  useEffect(() => {
    if (!sessionToken) {
      createSession.mutate(undefined, {
        onSuccess: (data) => {
          if (data.sessionToken) {
            setSessionToken(data.sessionToken);
            localStorage.setItem(SESSION_KEY, data.sessionToken);
          }
        },
      });
    }
  }, []);

  const totalQuestions = QUESTIONS.length;
  const progress =
    step === "consent" ? 5
    : step === "contact" ? 15
    : step === "questionnaire" ? 15 + (currentQuestion / totalQuestions) * 75
    : 95;

  // ── CONSENT STEP ──
  const handleConsentNext = async () => {
    if (!userAgreementAccepted) {
      toast.error("Необходимо принять пользовательское соглашение");
      return;
    }
    if (!sessionToken) return;
    await saveConsents.mutateAsync({
      sessionToken,
      userAgreementAccepted,
      marketingAccepted,
    });
    setStep("contact");
  };

  // ── CONTACT STEP ──
  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleContactNext = async () => {
    if (!contactForm.email) {
      setEmailError("Email обязателен");
      return;
    }
    if (!validateEmail(contactForm.email)) {
      setEmailError("Введите корректный email");
      return;
    }
    setEmailError("");
    if (!sessionToken) return;
    await saveContact.mutateAsync({
      sessionToken,
      name: contactForm.name || undefined,
      email: contactForm.email,
      productName: contactForm.productName || undefined,
      website: contactForm.website || undefined,
    });
    setStep("questionnaire");
  };

  // ── QUESTIONNAIRE STEP ──

  // Helper: get currently selected ids for a question
  const getSelected = (questionId: string): string[] => {
    const val = answers[questionId];
    if (!val) return [];
    return Array.isArray(val) ? val : [val];
  };

  const isOptionSelected = (questionId: string, optionId: string): boolean => {
    return getSelected(questionId).includes(optionId);
  };

  // Handle single-select answer
  const handleSelectSingle = useCallback(async (questionId: string, answerId: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answerId }));
    if (sessionToken) {
      saveAnswer.mutate({ sessionToken, questionId, answerId, answerIds: [answerId] });
    }
  }, [sessionToken]);

  // Handle multi-select answer toggle
  const handleToggleMulti = useCallback(async (questionId: string, answerId: string, exclusive: boolean) => {
    setAnswers((prev) => {
      const current = getSelected(questionId);
      let next: string[];

      if (exclusive) {
        // Exclusive option: select only this one
        next = current.includes(answerId) ? [] : [answerId];
      } else {
        // Remove exclusive options if any were selected
        const q = QUESTIONS.find(q => q.id === questionId);
        const exclusiveIds = q?.options.filter(o => o.exclusive).map(o => o.id) ?? [];
        const withoutExclusive = current.filter(id => !exclusiveIds.includes(id));

        if (withoutExclusive.includes(answerId)) {
          next = withoutExclusive.filter(id => id !== answerId);
        } else {
          next = [...withoutExclusive, answerId];
        }
      }

      const primaryId = next[0] ?? answerId;
      if (sessionToken) {
        saveAnswer.mutate({ sessionToken, questionId, answerId: primaryId, answerIds: next });
      }
      return { ...prev, [questionId]: next };
    });
  }, [sessionToken]);

  const hasAnsweredCurrentQuestion = (): boolean => {
    const q = QUESTIONS[currentQuestion];
    const selected = getSelected(q.id);
    return selected.length > 0;
  };

  const handleQuestionNext = () => {
    const q = QUESTIONS[currentQuestion];
    if (!hasAnsweredCurrentQuestion()) {
      toast.error("Пожалуйста, выберите ответ");
      return;
    }
    if (currentQuestion < totalQuestions - 1) {
      setCurrentQuestion((p) => p + 1);
    } else {
      handleComplete();
    }
  };

  const handleQuestionBack = () => {
    if (currentQuestion > 0) setCurrentQuestion((p) => p - 1);
    else setStep("contact");
  };

  const handleComplete = async () => {
    if (!sessionToken) return;
    setStep("processing");
    try {
      await complete.mutateAsync({ sessionToken, answers });
      localStorage.removeItem(SESSION_KEY);
      navigate(`/results/${sessionToken}`);
    } catch {
      toast.error("Произошла ошибка. Попробуйте ещё раз.");
      setStep("questionnaire");
    }
  };

  const currentQ = QUESTIONS[currentQuestion];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container flex items-center justify-between h-14">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <Scale className="w-5 h-5" />
            <span className="font-display font-700 text-base">Lexy</span>
          </button>
          {step !== "processing" && (
            <div className="flex items-center gap-3">
              <div className="text-sm text-muted-foreground">
                {step === "consent" && "Согласие"}
                {step === "contact" && "Контакты"}
                {step === "questionnaire" && `Вопрос ${currentQuestion + 1} из ${totalQuestions}`}
              </div>
            </div>
          )}
        </div>
        {/* Progress bar */}
        <div className="progress-track rounded-none h-1">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </nav>

      {/* Lexy header */}
      <div className="bg-muted/40 border-b border-border py-3">
        <div className="container flex items-center gap-3">
          <div className="lexy-avatar text-sm">L</div>
          <div>
            <div className="font-display font-700 text-sm text-foreground">Lexy</div>
            <div className="text-xs text-muted-foreground">Веду вас через диагностику</div>
          </div>
        </div>
      </div>

      <main className="flex-1 flex items-start justify-center py-12 px-4">
        <div className="w-full max-w-2xl">

          {/* ── CONSENT ── */}
          {step === "consent" && (
            <div className="animate-fade-in-up">
              <div className="mb-8">
                <h1 className="font-display text-3xl font-800 mb-3">Прежде чем начать</h1>
                <p className="text-muted-foreground leading-relaxed">
                  Для прохождения диагностики нам нужно ваше согласие на обработку данных. Это стандартное требование законодательства.
                </p>
              </div>

              <div className="card-premium p-6 rounded-2xl space-y-5">
                {/* User agreement */}
                <div className="flex gap-4 p-4 rounded-xl bg-muted/40 border border-border">
                  <Checkbox
                    id="user-agreement"
                    checked={userAgreementAccepted}
                    onCheckedChange={(v) => setUserAgreementAccepted(!!v)}
                    className="mt-0.5 flex-shrink-0"
                  />
                  <div>
                    <Label htmlFor="user-agreement" className="font-display font-600 text-sm cursor-pointer">
                      Принимаю{" "}
                      <a href="/legal/user-agreement" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:opacity-80" onClick={(e) => e.stopPropagation()}>
                        пользовательское соглашение
                      </a>{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Я ознакомился(-ась) с условиями использования сервиса Lexy и соглашаюсь с тем, что результаты диагностики носят информационный характер и не являются юридической консультацией. Версия документа: {CONSENT_VERSIONS.userAgreement} · {new Date().toLocaleDateString("ru-RU")}
                    </p>
                  </div>
                </div>

                {/* Marketing consent */}
                <div className="flex gap-4 p-4 rounded-xl bg-muted/40 border border-border">
                  <Checkbox
                    id="marketing"
                    checked={marketingAccepted}
                    onCheckedChange={(v) => setMarketingAccepted(!!v)}
                    className="mt-0.5 flex-shrink-0"
                  />
                  <div>
                    <Label htmlFor="marketing" className="font-display font-600 text-sm cursor-pointer">
                      Согласен(-на) получать рекламные рассылки. Необязательно. От согласия можно отказаться в любой момент
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Обработка данных в соответствии с{" "}
                      <a href="/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:opacity-80" onClick={(e) => e.stopPropagation()}>
                        Политикой обработки персональных данных
                      </a>.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Необязательно. Вы можете отписаться в любой момент. Версия: {CONSENT_VERSIONS.marketing} · {new Date().toLocaleDateString("ru-RU")}
                    </p>
                  </div>
                </div>

                {!userAgreementAccepted && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    Принятие пользовательского соглашения обязательно для прохождения диагностики
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleConsentNext}
                  disabled={!userAgreementAccepted || saveConsents.isPending}
                  className="btn-electric flex items-center gap-2 px-8 py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saveConsents.isPending ? "Сохраняем..." : "Продолжить"}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── CONTACT ── */}
          {step === "contact" && (
            <div className="animate-fade-in-up">
              <div className="mb-8">
                <h1 className="font-display text-3xl font-800 mb-3">Расскажите о себе</h1>
                <p className="text-muted-foreground leading-relaxed">
                  Результат диагностики будет привязан к вашему продукту. Email — единственное обязательное поле.
                </p>
              </div>

              <div className="card-premium p-6 rounded-2xl space-y-5">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name" className="text-sm font-medium mb-1.5 block">Как к вам обращаться</Label>
                    <Input
                      id="name"
                      placeholder="Иван"
                      value={contactForm.name}
                      onChange={(e) => setContactForm((p) => ({ ...p, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="email" className="text-sm font-medium mb-1.5 block">
                      Email <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="ivan@company.ru"
                      value={contactForm.email}
                      onChange={(e) => { setContactForm((p) => ({ ...p, email: e.target.value })); setEmailError(""); }}
                      className={emailError ? "border-destructive" : ""}
                    />
                    {emailError && <p className="text-xs text-destructive mt-1">{emailError}</p>}
                  </div>
                  <div>
                    <Label htmlFor="product" className="text-sm font-medium mb-1.5 block">Название продукта</Label>
                    <Input
                      id="product"
                      placeholder="Мой продукт"
                      value={contactForm.productName}
                      onChange={(e) => setContactForm((p) => ({ ...p, productName: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="website" className="text-sm font-medium mb-1.5 block">Сайт продукта</Label>
                    <Input
                      id="website"
                      placeholder="https://myproduct.ru"
                      value={contactForm.website}
                      onChange={(e) => setContactForm((p) => ({ ...p, website: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between">
                <button
                  onClick={() => setStep("consent")}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Назад
                </button>
                <button
                  onClick={handleContactNext}
                  disabled={saveContact.isPending}
                  className="btn-electric flex items-center gap-2 px-8 py-3 rounded-xl disabled:opacity-50"
                >
                  {saveContact.isPending ? "Сохраняем..." : "Начать диагностику"}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── QUESTIONNAIRE ── */}
          {step === "questionnaire" && currentQ && (
            <div className="animate-fade-in-up" key={currentQuestion}>
              {/* Question header */}
              <div className="mb-8">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                  <span className="font-display font-700 text-primary">Вопрос {currentQuestion + 1}</span>
                  <span>из {totalQuestions}</span>
                  {currentQ.multiSelect && (
                    <span className="ml-auto text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                      Можно выбрать несколько
                    </span>
                  )}
                </div>
                <h1 className="font-display text-2xl sm:text-3xl font-800 mb-3 leading-tight">
                  {currentQ.title}
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed bg-muted/50 rounded-lg px-4 py-3 border border-border">
                  💡 {currentQ.hint}
                </p>
              </div>

              {/* Answer options */}
              <div className="space-y-3">
                {currentQ.options.map((option) => {
                  const isSelected = isOptionSelected(currentQ.id, option.id);

                  if (currentQ.multiSelect) {
                    // Multi-select: checkbox style
                    return (
                      <button
                        key={option.id}
                        onClick={() => handleToggleMulti(currentQ.id, option.id, !!option.exclusive)}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-150 ${
                          isSelected
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border bg-card hover:border-primary/40 hover:bg-muted/40"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                            isSelected ? "border-primary bg-primary" : "border-border"
                          }`}>
                            {isSelected && (
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                          <span className={`text-sm font-medium leading-relaxed ${isSelected ? "text-foreground" : "text-foreground/80"}`}>
                            {option.text}
                          </span>
                        </div>
                      </button>
                    );
                  } else {
                    // Single-select: radio style
                    return (
                      <button
                        key={option.id}
                        onClick={() => handleSelectSingle(currentQ.id, option.id)}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-150 ${
                          isSelected
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border bg-card hover:border-primary/40 hover:bg-muted/40"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                            isSelected ? "border-primary bg-primary" : "border-border"
                          }`}>
                            {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                          <span className={`text-sm font-medium leading-relaxed ${isSelected ? "text-foreground" : "text-foreground/80"}`}>
                            {option.text}
                          </span>
                        </div>
                      </button>
                    );
                  }
                })}
              </div>

              <div className="mt-8 flex items-center justify-between">
                <button
                  onClick={handleQuestionBack}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Назад
                </button>
                <button
                  onClick={handleQuestionNext}
                  disabled={!hasAnsweredCurrentQuestion() || complete.isPending}
                  className="btn-electric flex items-center gap-2 px-8 py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {currentQuestion === totalQuestions - 1
                    ? (complete.isPending ? "Обрабатываем..." : "Получить результат")
                    : "Следующий вопрос"}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── PROCESSING ── */}
          {step === "processing" && (
            <div className="text-center py-20 animate-fade-in-up">
              <div className="lexy-avatar w-16 h-16 text-xl mx-auto mb-6">L</div>
              <h2 className="font-display text-2xl font-800 mb-3">Lexy анализирует ответы</h2>
              <p className="text-muted-foreground mb-8">Рассчитываем категорию риска и формируем персональный отчёт...</p>
              <div className="flex justify-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-primary animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
