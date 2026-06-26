import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  PAID_BLOCKS,
  PAID_PRICE_RUB,
  type PaidBlock,
  type PaidQuestion,
} from "../../../shared/paidDiagnosticData";
import {
  ChevronLeft,
  ChevronRight,
  Upload,
  FileText,
  Check,
  Shield,
  AlertTriangle,
  Lock,
  X,
} from "lucide-react";
import { ReportSharePanel } from "@/components/ReportSharePanel";

// ─── Types ────────────────────────────────────────────────────────────────────

type FlowStep =
  | "landing"
  | "consent"
  | "contact"
  | "payment"
  | "questionnaire"
  | "processing"
  | "report";

// ─── Constants ────────────────────────────────────────────────────────────────

const CONSENT_DOC_VERSION = "2.0";
const STORAGE_KEY = "neolex_paid_session";

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PaidDiagnostic() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<FlowStep>("landing");

  // Session
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);

  // Consents
  const [userAgreement, setUserAgreement] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [dataProcessing, setDataProcessing] = useState(true);

  // Contact
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [productName, setProductName] = useState("");
  const [website, setWebsite] = useState("");

  // Questionnaire
  const [currentBlock, setCurrentBlock] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, { name: string; url: string }[]>>({});

  // Report
  const [reportMarkdown, setReportMarkdown] = useState("");
  const [scoring, setScoring] = useState<any>(null);

  const topRef = useRef<HTMLDivElement>(null);

  // Restore session from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.sessionToken) setSessionToken(parsed.sessionToken);
        if (parsed.sessionId) setSessionId(parsed.sessionId);
        if (parsed.answers) setAnswers(parsed.answers);
        if (parsed.contactEmail) setContactEmail(parsed.contactEmail);
        if (parsed.contactName) setContactName(parsed.contactName);
        if (parsed.productName) setProductName(parsed.productName);
        if (parsed.website) setWebsite(parsed.website);
        if (parsed.step && parsed.step !== "landing") setStep(parsed.step);
        if (parsed.currentBlock) setCurrentBlock(parsed.currentBlock);
      } catch {}
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (sessionToken) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        sessionToken, sessionId, answers, contactEmail, contactName,
        productName, website, step, currentBlock,
      }));
    }
  }, [sessionToken, sessionId, answers, contactEmail, contactName, productName, website, step, currentBlock]);

  const scrollTop = () => topRef.current?.scrollIntoView({ behavior: "smooth" });

  // ── tRPC mutations ──────────────────────────────────────────────────────────

  const createSession = trpc.paid.createSession.useMutation();
  const saveConsents = trpc.paid.saveConsents.useMutation();
  const confirmPayment = trpc.paid.confirmPayment.useMutation();
  const saveAnswer = trpc.paid.saveAnswer.useMutation();
  const uploadDocument = trpc.paid.uploadDocument.useMutation();
  const completeMutation = trpc.paid.complete.useMutation();

  // ── Step: Landing → Consent ─────────────────────────────────────────────────

  const handleStartDiagnostic = () => {
    setStep("consent");
    scrollTop();
  };

  // ── Step: Consent → Contact ─────────────────────────────────────────────────

  const handleConsentSubmit = async () => {
    if (!userAgreement) {
      toast.error("Необходимо принять пользовательское соглашение");
      return;
    }
    setStep("contact");
    scrollTop();
  };

  // ── Step: Contact → Payment ─────────────────────────────────────────────────

  const handleContactSubmit = async () => {
    if (!contactEmail) {
      toast.error("Email обязателен");
      return;
    }
    try {
      const result = await createSession.mutateAsync({
        contactEmail,
        contactName: contactName || undefined,
        productName: productName || undefined,
        website: website || undefined,
      });
      setSessionToken(result.sessionToken);
      setSessionId(result.sessionId);

      await saveConsents.mutateAsync({
        sessionToken: result.sessionToken,
        userAgreementAccepted: userAgreement,
        marketingAccepted: marketingConsent,
        dataProcessingAccepted: dataProcessing,
      });

      setStep("payment");
      scrollTop();
    } catch (e: any) {
      toast.error("Ошибка создания сессии: " + (e.message || "Попробуйте ещё раз"));
    }
  };

  // ── Step: Payment → Questionnaire ───────────────────────────────────────────

  const handlePaymentConfirm = async () => {
    if (!sessionToken) return;
    try {
      await confirmPayment.mutateAsync({ sessionToken });
      setStep("questionnaire");
      setCurrentBlock(0);
      scrollTop();
    } catch (e: any) {
      toast.error("Ошибка подтверждения оплаты: " + (e.message || "Попробуйте ещё раз"));
    }
  };

  // ── Questionnaire: answer handling ─────────────────────────────────────────

  const handleSingleAnswer = useCallback(async (question: PaidQuestion, optionId: string) => {
    const newAnswers = { ...answers, [question.id]: optionId };
    setAnswers(newAnswers);
    if (sessionToken) {
      await saveAnswer.mutateAsync({
        sessionToken,
        blockId: question.blockId,
        questionId: question.id,
        answerType: "single",
        answerId: optionId,
      }).catch(() => {});
    }
  }, [answers, sessionToken]);

  const handleMultiAnswer = useCallback(async (question: PaidQuestion, optionId: string) => {
    const current = (answers[question.id] as string[] | undefined) ?? [];
    const updated = current.includes(optionId)
      ? current.filter(id => id !== optionId)
      : [...current, optionId];
    const newAnswers = { ...answers, [question.id]: updated };
    setAnswers(newAnswers);
    if (sessionToken) {
      await saveAnswer.mutateAsync({
        sessionToken,
        blockId: question.blockId,
        questionId: question.id,
        answerType: "multi",
        answerIds: updated,
      }).catch(() => {});
    }
  }, [answers, sessionToken]);

  const handleTextAnswer = useCallback(async (question: PaidQuestion, text: string) => {
    setAnswers(prev => ({ ...prev, [question.id]: text }));
  }, []);

  const handleTextBlur = useCallback(async (question: PaidQuestion) => {
    const text = answers[question.id] as string | undefined;
    if (sessionToken && text) {
      await saveAnswer.mutateAsync({
        sessionToken,
        blockId: question.blockId,
        questionId: question.id,
        answerType: "text",
        answerText: text,
      }).catch(() => {});
    }
  }, [answers, sessionToken]);

  const handleFileUpload = useCallback(async (question: PaidQuestion, file: File) => {
    if (!sessionToken) return;
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string).split(",")[1];
        const result = await uploadDocument.mutateAsync({
          sessionToken,
          blockId: question.blockId,
          questionId: question.id,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          fileBase64: base64,
          documentCategory: "diagnostic_document",
        });
        setUploadedFiles(prev => ({
          ...prev,
          [question.id]: [...(prev[question.id] ?? []), { name: file.name, url: result.storageUrl }],
        }));
        toast.success(`Файл "${file.name}" загружен`);
      };
      reader.readAsDataURL(file);
    } catch (e: any) {
      toast.error("Ошибка загрузки файла: " + (e.message || "Попробуйте ещё раз"));
    }
  }, [sessionToken]);

  // ── Questionnaire: block navigation ────────────────────────────────────────

  const block = PAID_BLOCKS[currentBlock];

  const isBlockVisible = (b: PaidBlock): boolean => {
    // All 14 blocks are always shown (branching is handled at question level)
    return true;
  };

  const visibleBlocks = PAID_BLOCKS.filter(isBlockVisible);
  const totalBlocks = visibleBlocks.length;
  const progress = totalBlocks > 0 ? ((currentBlock + 1) / totalBlocks) * 100 : 0;

  const isQuestionVisible = (q: PaidQuestion): boolean => {
    if (!q.branchCondition) return true;
    const { questionId, answerIds } = q.branchCondition;
    const ans = answers[questionId];
    if (!ans) return false;
    if (Array.isArray(ans)) return answerIds.some(id => ans.includes(id));
    return answerIds.includes(ans);
  };

  const isBlockComplete = (b: PaidBlock): boolean => {
    const requiredVisible = b.questions.filter(q => q.required && isQuestionVisible(q));
    return requiredVisible.every(q => {
      const ans = answers[q.id];
      if (!ans) return false;
      if (Array.isArray(ans)) return ans.length > 0;
      return ans.trim().length > 0;
    });
  };

  const handleNextBlock = () => {
    if (!isBlockComplete(block)) {
      toast.error("Пожалуйста, ответьте на все обязательные вопросы");
      return;
    }
    if (currentBlock < totalBlocks - 1) {
      setCurrentBlock(prev => prev + 1);
      scrollTop();
    } else {
      handleComplete();
    }
  };

  const handlePrevBlock = () => {
    if (currentBlock > 0) {
      setCurrentBlock(prev => prev - 1);
      scrollTop();
    }
  };

  // ── Complete diagnostic ─────────────────────────────────────────────────────

  const handleComplete = async () => {
    if (!sessionToken) return;
    setStep("processing");
    scrollTop();
    try {
      const result = await completeMutation.mutateAsync({ sessionToken, answers });
      setScoring(result.scoring);
      setReportMarkdown(result.reportMarkdown);
      setStep("report");
      scrollTop();
      localStorage.removeItem(STORAGE_KEY);
    } catch (e: any) {
      toast.error("Ошибка генерации отчёта: " + (e.message || "Попробуйте ещё раз"));
      setStep("questionnaire");
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div ref={topRef} className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 text-gray-900 hover:opacity-70 transition-opacity">
            <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center">
              <span className="text-white font-bold text-xs">N</span>
            </div>
            <span className="font-semibold text-sm">Neolex</span>
          </button>
          {step === "questionnaire" && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">Блок {currentBlock + 1} из {totalBlocks}</span>
              <div className="w-32 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gray-900 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Lock className="w-3 h-3" />
            <span>Защищено</span>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* ── LANDING ── */}
        {step === "landing" && <PaidLanding onStart={handleStartDiagnostic} />}

        {/* ── CONSENT ── */}
        {step === "consent" && (
          <ConsentScreen
            userAgreement={userAgreement}
            setUserAgreement={setUserAgreement}
            marketingConsent={marketingConsent}
            setMarketingConsent={setMarketingConsent}
            dataProcessing={dataProcessing}
            setDataProcessing={setDataProcessing}
            onSubmit={handleConsentSubmit}
            docVersion={CONSENT_DOC_VERSION}
          />
        )}

        {/* ── CONTACT ── */}
        {step === "contact" && (
          <ContactScreen
            name={contactName}
            setName={setContactName}
            email={contactEmail}
            setEmail={setContactEmail}
            productName={productName}
            setProductName={setProductName}
            website={website}
            setWebsite={setWebsite}
            onSubmit={handleContactSubmit}
            isLoading={createSession.isPending || saveConsents.isPending}
          />
        )}

        {/* ── PAYMENT ── */}
        {step === "payment" && (
          <PaymentScreen
            amount={PAID_PRICE_RUB}
            email={contactEmail}
            onConfirm={handlePaymentConfirm}
            isLoading={confirmPayment.isPending}
          />
        )}

        {/* ── QUESTIONNAIRE ── */}
        {step === "questionnaire" && block && (
          <QuestionnaireBlock
            block={block}
            blockIndex={currentBlock}
            totalBlocks={totalBlocks}
            answers={answers}
            uploadedFiles={uploadedFiles}
            onSingle={handleSingleAnswer}
            onMulti={handleMultiAnswer}
            onText={handleTextAnswer}
            onTextBlur={handleTextBlur}
            onFileUpload={handleFileUpload}
            onNext={handleNextBlock}
            onPrev={handlePrevBlock}
            isQuestionVisible={isQuestionVisible}
            isLastBlock={currentBlock === totalBlocks - 1}
            isComplete={isBlockComplete(block)}
            uploadLoading={uploadDocument.isPending}
          />
        )}

        {/* ── PROCESSING ── */}
        {step === "processing" && <ProcessingScreen />}

        {/* ── REPORT ── */}
        {step === "report" && scoring && (
          <ReportScreen
            scoring={scoring}
            reportMarkdown={reportMarkdown}
            productName={productName || (answers["b1_q1"] as string) || "ваш продукт"}
            sessionToken={sessionToken}
            onNavigateHome={() => navigate("/")}
          />
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PaidLanding({ onStart }: { onStart: () => void }) {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <div className="text-center space-y-6">
        <div className="inline-flex items-center gap-2 bg-gray-900 text-white px-4 py-1.5 rounded-full text-sm font-medium">
          <Shield className="w-3.5 h-3.5" />
          Углублённая правовая диагностика
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 leading-tight">
          Полный правовой аудит<br />
          <span className="text-gray-400">вашего IT-продукта</span>
        </h1>
        <p className="text-lg text-gray-600 max-w-xl mx-auto leading-relaxed">
          14 блоков анализа, 50+ вопросов, AI-отчёт с дорожной картой устранения рисков на 30/60/90 дней. Подготовка к инвестициям, сделкам и масштабированию.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={onStart}
            className="px-8 py-4 bg-gray-900 text-white rounded-2xl font-semibold text-lg hover:bg-gray-800 active:scale-[0.98] transition-all duration-150"
          >
            Начать диагностику — {PAID_PRICE_RUB.toLocaleString("ru-RU")} ₽
          </button>
          <span className="text-sm text-gray-400">Результат через 20–30 минут</span>
        </div>
      </div>

      {/* What's included */}
      <div className="grid md:grid-cols-2 gap-4">
        {[
          { icon: "📋", title: "14 блоков анализа", desc: "Корпоративная структура, ИС, персональные данные, договоры, платежи, команда, споры и другие зоны риска" },
          { icon: "🤖", title: "AI-отчёт с выводами", desc: "Персонализированный отчёт на основе ваших ответов с конкретными рекомендациями и правовыми основаниями" },
          { icon: "🗺️", title: "Дорожная карта 30/60/90 дней", desc: "Чёткий план устранения рисков с приоритизацией по срочности и финансовым последствиям" },
          { icon: "📄", title: "Загрузка документов", desc: "Возможность приложить документы для более точного анализа и подтверждённых выводов" },
          { icon: "⚖️", title: "Правовые основания", desc: "Каждый риск подкреплён ссылками на конкретные нормы российского законодательства" },
          { icon: "💰", title: "Финансовые последствия", desc: "Денежная оценка каждого риска: штрафы, убытки, стоимость исправления" },
        ].map((item) => (
          <div key={item.title} className="p-5 border border-gray-100 rounded-2xl hover:border-gray-200 transition-colors">
            <div className="text-2xl mb-3">{item.icon}</div>
            <div className="font-semibold text-gray-900 mb-1">{item.title}</div>
            <div className="text-sm text-gray-500 leading-relaxed">{item.desc}</div>
          </div>
        ))}
      </div>

      {/* Blocks preview */}
      <div className="bg-gray-50 rounded-3xl p-8">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Что входит в диагностику</h2>
        <div className="grid sm:grid-cols-2 gap-2">
          {PAID_BLOCKS.map((b, i) => (
            <div key={b.id} className="flex items-center gap-3 py-2">
              <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center flex-shrink-0">
                {i + 1}
              </span>
              <span className="text-sm text-gray-700">{b.title}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="text-center space-y-4">
        <button
          onClick={onStart}
          className="px-10 py-4 bg-gray-900 text-white rounded-2xl font-semibold text-lg hover:bg-gray-800 active:scale-[0.98] transition-all duration-150"
        >
          Начать диагностику — {PAID_PRICE_RUB.toLocaleString("ru-RU")} ₽
        </button>
        <p className="text-sm text-gray-400">Оплата картой · Результат сразу после прохождения</p>
      </div>
    </div>
  );
}

function ConsentScreen({
  userAgreement, setUserAgreement,
  marketingConsent, setMarketingConsent,
  dataProcessing, setDataProcessing,
  onSubmit, docVersion,
}: {
  userAgreement: boolean; setUserAgreement: (v: boolean) => void;
  marketingConsent: boolean; setMarketingConsent: (v: boolean) => void;
  dataProcessing: boolean; setDataProcessing: (v: boolean) => void;
  onSubmit: () => void; docVersion: string;
}) {
  const now = new Date().toLocaleString("ru-RU");
  return (
    <div className="max-w-xl mx-auto space-y-8">
      <div className="text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-gray-900 flex items-center justify-center mx-auto">
          <Shield className="w-6 h-6 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Согласие на обработку данных</h2>
        <p className="text-gray-500 text-sm">Перед началом диагностики ознакомьтесь с условиями</p>
      </div>

      <div className="space-y-4">
        {/* Mandatory */}
        <label className="flex items-start gap-3 p-4 border-2 border-gray-900 rounded-2xl cursor-pointer bg-gray-50">
          <div
            className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors ${userAgreement ? "bg-gray-900 border-gray-900" : "border-gray-300"}`}
            onClick={() => setUserAgreement(!userAgreement)}
          >
            {userAgreement && <Check className="w-3 h-3 text-white" />}
          </div>
          <div className="text-sm">
            <span className="font-semibold text-gray-900">Обязательно: </span>
            <span className="text-gray-700">Я принимаю условия </span>
            <a href="/legal/terms" target="_blank" className="text-gray-900 underline">пользовательского соглашения</a>
            <span className="text-gray-700"> и </span>
            <a href="/legal/privacy" target="_blank" className="text-gray-900 underline">политики обработки персональных данных</a>
            <span className="text-gray-700"> сервиса Lexy.</span>
            <div className="text-gray-400 text-xs mt-1">Версия документа: {docVersion} · Дата принятия: {now}</div>
          </div>
        </label>

        {/* Data processing */}
        <label className="flex items-start gap-3 p-4 border border-gray-100 rounded-2xl cursor-pointer hover:border-gray-200 transition-colors">
          <div
            className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors ${dataProcessing ? "bg-gray-900 border-gray-900" : "border-gray-300"}`}
            onClick={() => setDataProcessing(!dataProcessing)}
          >
            {dataProcessing && <Check className="w-3 h-3 text-white" />}
          </div>
          <div className="text-sm">
            <span className="font-semibold text-gray-900">Обязательно: </span>
            <span className="text-gray-700">Я даю согласие на обработку персональных данных в целях проведения диагностики в соответствии с 152-ФЗ.</span>
          </div>
        </label>

        {/* Marketing */}
        <label className="flex items-start gap-3 p-4 border border-gray-100 rounded-2xl cursor-pointer hover:border-gray-200 transition-colors">
          <div
            className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors ${marketingConsent ? "bg-gray-900 border-gray-900" : "border-gray-300"}`}
            onClick={() => setMarketingConsent(!marketingConsent)}
          >
            {marketingConsent && <Check className="w-3 h-3 text-white" />}
          </div>
          <div className="text-sm">
            <span className="font-medium text-gray-700">Необязательно: </span>
            <span className="text-gray-500">Я согласен(а) получать от сервиса Lexy полезные материалы по правовым рискам IT-продуктов.</span>
          </div>
        </label>
      </div>

      <button
        onClick={onSubmit}
        disabled={!userAgreement || !dataProcessing}
        className="w-full py-4 bg-gray-900 text-white rounded-2xl font-semibold text-base hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all duration-150"
      >
        Продолжить
      </button>
    </div>
  );
}

function ContactScreen({
  name, setName, email, setEmail, productName, setProductName, website, setWebsite,
  onSubmit, isLoading,
}: {
  name: string; setName: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  productName: string; setProductName: (v: string) => void;
  website: string; setWebsite: (v: string) => void;
  onSubmit: () => void; isLoading: boolean;
}) {
  return (
    <div className="max-w-xl mx-auto space-y-8">
      <div className="text-center space-y-3">
        <h2 className="text-2xl font-bold text-gray-900">Расскажите о себе</h2>
        <p className="text-gray-500 text-sm">Это поможет персонализировать отчёт</p>
      </div>
      <div className="space-y-4">
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Как к вам обращаться</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Имя или никнейм" className="rounded-xl h-12" />
        </div>
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Email <span className="text-red-500">*</span></Label>
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" className="rounded-xl h-12" required />
          <p className="text-xs text-gray-400 mt-1">На этот адрес придёт ссылка на отчёт</p>
        </div>
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Название продукта или компании</Label>
          <Input value={productName} onChange={e => setProductName(e.target.value)} placeholder="Например: MyApp, ООО «Ромашка»" className="rounded-xl h-12" />
        </div>
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Сайт</Label>
          <Input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://example.com" className="rounded-xl h-12" />
        </div>
      </div>
      <button
        onClick={onSubmit}
        disabled={!email || isLoading}
        className="w-full py-4 bg-gray-900 text-white rounded-2xl font-semibold text-base hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all duration-150"
      >
        {isLoading ? "Сохраняем..." : "Перейти к оплате"}
      </button>
    </div>
  );
}

function PaymentScreen({ amount, email, onConfirm, isLoading }: {
  amount: number; email: string; onConfirm: () => void; isLoading: boolean;
}) {
  return (
    <div className="max-w-md mx-auto space-y-8">
      <div className="text-center space-y-3">
        <h2 className="text-2xl font-bold text-gray-900">Оплата диагностики</h2>
        <p className="text-gray-500 text-sm">После оплаты вы сразу перейдёте к анкете</p>
      </div>

      <div className="border border-gray-100 rounded-3xl p-6 space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Углублённая правовая диагностика</span>
          <span className="font-bold text-gray-900">{amount.toLocaleString("ru-RU")} ₽</span>
        </div>
        <div className="border-t border-gray-100 pt-4 flex justify-between items-center">
          <span className="font-semibold text-gray-900">Итого</span>
          <span className="text-2xl font-bold text-gray-900">{amount.toLocaleString("ru-RU")} ₽</span>
        </div>
        <div className="text-xs text-gray-400">Квитанция будет отправлена на {email}</div>
      </div>

      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <strong>Демо-режим:</strong> Интеграция с платёжной системой в разработке. Нажмите «Оплатить», чтобы перейти к диагностике.
        </div>
      </div>

      <button
        onClick={onConfirm}
        disabled={isLoading}
        className="w-full py-4 bg-gray-900 text-white rounded-2xl font-semibold text-lg hover:bg-gray-800 disabled:opacity-40 active:scale-[0.98] transition-all duration-150"
      >
        {isLoading ? "Подтверждаем..." : `Оплатить ${amount.toLocaleString("ru-RU")} ₽`}
      </button>

      <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
        <div className="flex items-center gap-1"><Lock className="w-3 h-3" /> Защищённое соединение</div>
        <div>Возврат в течение 14 дней</div>
      </div>
    </div>
  );
}

function QuestionnaireBlock({
  block, blockIndex, totalBlocks, answers, uploadedFiles,
  onSingle, onMulti, onText, onTextBlur, onFileUpload,
  onNext, onPrev, isQuestionVisible, isLastBlock, isComplete, uploadLoading,
}: {
  block: PaidBlock; blockIndex: number; totalBlocks: number;
  answers: Record<string, string | string[]>;
  uploadedFiles: Record<string, { name: string; url: string }[]>;
  onSingle: (q: PaidQuestion, id: string) => void;
  onMulti: (q: PaidQuestion, id: string) => void;
  onText: (q: PaidQuestion, text: string) => void;
  onTextBlur: (q: PaidQuestion) => void;
  onFileUpload: (q: PaidQuestion, file: File) => void;
  onNext: () => void; onPrev: () => void;
  isQuestionVisible: (q: PaidQuestion) => boolean;
  isLastBlock: boolean; isComplete: boolean; uploadLoading: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeFileQuestion, setActiveFileQuestion] = useState<PaidQuestion | null>(null);

  const visibleQuestions = block.questions.filter(isQuestionVisible);

  return (
    <div className="space-y-8">
      {/* Block header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span>Блок {blockIndex + 1} из {totalBlocks}</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">{block.title}</h2>
        <p className="text-gray-500">{block.description}</p>
        {block.why && (
          <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-600">
            <span className="font-medium text-gray-700">Зачем мы спрашиваем: </span>{block.why}
          </div>
        )}
      </div>

      {/* Questions */}
      <div className="space-y-6">
        {visibleQuestions.map((q) => (
          <div key={q.id} className="space-y-3">
            <div className="space-y-1">
              <p className="font-medium text-gray-900">
                {q.text}
                {q.required && <span className="text-red-400 ml-1">*</span>}
              </p>
              {q.hint && <p className="text-sm text-gray-400">{q.hint}</p>}
            </div>

            {/* Single select */}
            {q.type === "single" && q.options && (
              <div className="grid gap-2">
                {q.options.map(opt => {
                  const selected = answers[q.id] === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => onSingle(q, opt.id)}
                      className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all duration-150 active:scale-[0.99] ${
                        selected
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-100 bg-white text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {selected && <Check className="w-4 h-4 flex-shrink-0" />}
                        {opt.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Multi select */}
            {q.type === "multi" && q.options && (
              <div className="grid gap-2">
                {q.options.map(opt => {
                  const selected = Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      onClick={() => onMulti(q, opt.id)}
                      className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all duration-150 active:scale-[0.99] ${
                        selected
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-100 bg-white text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${selected ? "border-white bg-white" : "border-current"}`}>
                          {selected && <Check className="w-2.5 h-2.5 text-gray-900" />}
                        </div>
                        {opt.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Text */}
            {q.type === "text" && (
              <Textarea
                value={(answers[q.id] as string) ?? ""}
                onChange={e => onText(q, e.target.value)}
                onBlur={() => onTextBlur(q)}
                placeholder="Введите ответ..."
                className="rounded-xl min-h-[100px] resize-none"
              />
            )}

            {/* File upload */}
            {q.type === "file" && (
              <div className="space-y-3">
                <div
                  className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-gray-400 transition-colors"
                  onClick={() => {
                    setActiveFileQuestion(q);
                    fileInputRef.current?.click();
                  }}
                >
                  {uploadLoading ? (
                    <div className="text-sm text-gray-500">Загружаем...</div>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Нажмите для загрузки файла</p>
                      <p className="text-xs text-gray-400 mt-1">PDF, DOCX, JPG, PNG до 16 МБ</p>
                    </>
                  )}
                </div>
                {(uploadedFiles[q.id] ?? []).map((f, i) => (
                  <div key={i} className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl text-sm">
                    <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-700 truncate">{f.name}</span>
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0 ml-auto" />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file && activeFileQuestion) onFileUpload(activeFileQuestion, file);
          e.target.value = "";
        }}
      />

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        <button
          onClick={onPrev}
          disabled={blockIndex === 0}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Назад
        </button>
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-xl font-semibold text-sm hover:bg-gray-800 active:scale-[0.98] transition-all duration-150"
        >
          {isLastBlock ? "Получить отчёт" : "Следующий блок"}
          {!isLastBlock && <ChevronRight className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function ProcessingScreen() {
  const [dots, setDots] = useState(".");
  useEffect(() => {
    const interval = setInterval(() => setDots(d => d.length >= 3 ? "." : d + "."), 600);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center space-y-8">
      <div className="w-16 h-16 rounded-2xl bg-gray-900 flex items-center justify-center animate-pulse">
        <Shield className="w-8 h-8 text-white" />
      </div>
      <div className="space-y-3">
        <h2 className="text-2xl font-bold text-gray-900">Анализируем ваши ответы{dots}</h2>
        <p className="text-gray-500 max-w-sm">Lexy изучает данные и формирует персональный отчёт с рекомендациями</p>
      </div>
      <div className="space-y-2 text-sm text-gray-400 max-w-xs">
        {["Анализ корпоративной структуры", "Оценка рисков по 14 блокам", "Формирование дорожной карты", "Генерация отчёта"].map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportScreen({ scoring, reportMarkdown, productName, sessionToken, onNavigateHome }: {
  scoring: any; reportMarkdown: string; productName: string; sessionToken: string | null; onNavigateHome: () => void;
}) {
  const riskColors: Record<string, string> = {
    low: "text-green-700 bg-green-50 border-green-200",
    moderate: "text-yellow-700 bg-yellow-50 border-yellow-200",
    high: "text-orange-700 bg-orange-50 border-orange-200",
    critical: "text-red-700 bg-red-50 border-red-200",
  };
  const riskLabels: Record<string, string> = {
    low: "Низкий", moderate: "Умеренный", high: "Высокий", critical: "Критический",
  };

  const category = scoring.riskCategory as string;
  const colorClass = riskColors[category] ?? riskColors.moderate;
  const label = riskLabels[category] ?? category;

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border font-semibold text-sm ${colorClass}`}>
          <Shield className="w-4 h-4" />
          Категория риска: {label}
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Отчёт о правовых рисках</h1>
        <p className="text-gray-500">{productName}</p>
      </div>

      {/* Score summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center p-4 bg-gray-50 rounded-2xl">
          <div className="text-3xl font-bold text-gray-900">{scoring.totalScore}</div>
          <div className="text-xs text-gray-500 mt-1">Общий балл риска</div>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded-2xl">
          <div className="text-3xl font-bold text-red-600">{scoring.criticalTriggers?.length ?? 0}</div>
          <div className="text-xs text-gray-500 mt-1">Критических триггеров</div>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded-2xl">
          <div className="text-3xl font-bold text-orange-600">{scoring.riskBlocks?.length ?? 0}</div>
          <div className="text-xs text-gray-500 mt-1">Зон риска</div>
        </div>
      </div>

      {/* Critical triggers */}
      {scoring.criticalTriggers?.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 font-semibold text-red-800">
            <AlertTriangle className="w-5 h-5" />
            Критические триггеры
          </div>
          <ul className="space-y-1.5">
            {scoring.criticalTriggers.map((t: string, i: number) => (
              <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                <span className="text-red-400 mt-0.5">•</span>{t}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Risk blocks */}
      {scoring.riskBlocks?.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900">Выявленные риски</h2>
          {scoring.riskBlocks.map((rb: any, i: number) => (
            <RiskBlockCard key={i} block={rb} />
          ))}
        </div>
      )}

      {/* Full report markdown — rendered cleanly */}
      {reportMarkdown && (
        <div className="border border-gray-100 rounded-2xl p-6 space-y-4">
          <h2 className="text-xl font-bold text-gray-900">Полный отчёт</h2>
          <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
            {reportMarkdown
              .replace(/^#+\s*/gm, "")
              .replace(/\*\*([^*]+)\*\*/g, "$1")
              .replace(/^[-*]\s+/gm, "• ")
              .split("\n")
              .filter((l: string) => l.trim())
              .map((line: string, i: number) => (
                <p key={i} className={line.startsWith("• ") ? "ml-3" : ""}>{line}</p>
              ))}
          </div>
        </div>
      )}

      {/* Roadmap */}
      {scoring.roadmap && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900">Дорожная карта устранения рисков</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { key: "immediate", label: "Немедленно", color: "bg-red-50 border-red-100" },
              { key: "days30", label: "30 дней", color: "bg-orange-50 border-orange-100" },
              { key: "days60", label: "60 дней", color: "bg-yellow-50 border-yellow-100" },
              { key: "days90", label: "90 дней", color: "bg-green-50 border-green-100" },
              { key: "scaling", label: "Масштабирование", color: "bg-blue-50 border-blue-100" },
            ].map(({ key, label, color }) => {
              const items = scoring.roadmap[key] as string[];
              if (!items?.length) return null;
              return (
                <div key={key} className={`border rounded-2xl p-4 ${color}`}>
                  <div className="font-semibold text-gray-800 mb-2 text-sm">{label}</div>
                  <ul className="space-y-1">
                    {items.map((item: string, i: number) => (
                      <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                        <span className="mt-0.5">•</span>{item}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Missing documents */}
      {scoring.missingDocuments?.length > 0 && (
        <div className="bg-gray-50 rounded-2xl p-5 space-y-3">
          <h3 className="font-semibold text-gray-900">Отсутствующие документы</h3>
          <ul className="space-y-1.5">
            {scoring.missingDocuments.map((d: string, i: number) => (
              <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                <X className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Scope limitations */}
      {scoring.scopeLimitations?.length > 0 && (
        <div className="border border-gray-100 rounded-2xl p-5 space-y-2">
          <h3 className="font-semibold text-gray-700 text-sm">Ограничения отчёта</h3>
          <ul className="space-y-1">
            {scoring.scopeLimitations.map((l: string, i: number) => (
              <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                <span className="mt-0.5">•</span>{l}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Download & Share */}
      {sessionToken && (
        <ReportSharePanel
          pdfUrl={`/api/pdf/paid/${sessionToken}`}
          type="paid"
          riskLabel={label}
          productName={productName}
        />
      )}

      {/* Next step CTA */}
      {scoring.nextStep && (
        <div className="bg-gray-900 rounded-3xl p-8 text-white text-center space-y-4">
          <div className="text-sm text-gray-400 uppercase tracking-wider">Следующий шаг</div>
          <h3 className="text-2xl font-bold">{scoring.nextStep.title}</h3>
          <p className="text-gray-300 max-w-md mx-auto">{scoring.nextStep.description}</p>
          <button className="px-8 py-3 bg-white text-gray-900 rounded-xl font-semibold hover:bg-gray-100 active:scale-[0.98] transition-all duration-150">
            Связаться с Lexy
          </button>
        </div>
      )}

      <div className="text-center">
        <button onClick={onNavigateHome} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
          Вернуться на главную
        </button>
      </div>
    </div>
  );
}

function RiskBlockCard({ block }: { block: any }) {
  const [open, setOpen] = useState(false);
  const levelColors: Record<string, string> = {
    low: "bg-green-100 text-green-700",
    moderate: "bg-yellow-100 text-yellow-700",
    high: "bg-orange-100 text-orange-700",
    critical: "bg-red-100 text-red-700",
  };
  const levelLabels: Record<string, string> = {
    low: "Низкий", moderate: "Умеренный", high: "Высокий", critical: "Критический",
  };

  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${levelColors[block.riskLevel] ?? levelColors.moderate}`}>
            {levelLabels[block.riskLevel] ?? block.riskLevel}
          </span>
          <span className="font-medium text-gray-900 text-sm">{block.title}</span>
        </div>
        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-3 border-t border-gray-50">
          <div className="grid md:grid-cols-2 gap-3 pt-3">
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Что обнаружено</div>
              <div className="text-sm text-gray-700">{block.whatFound}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Почему важно</div>
              <div className="text-sm text-gray-700">{block.whyItMatters}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Правовое основание</div>
              <div className="text-sm text-gray-700">{block.legalBasis}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Финансовые последствия</div>
              <div className="text-sm text-orange-700 font-medium">{block.financialRange}</div>
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Что делать</div>
            <div className="text-sm text-gray-700">{block.whatToDo}</div>
          </div>
        </div>
      )}
    </div>
  );
}
