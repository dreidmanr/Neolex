import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Bot } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  suggestions?: string[];
};

// Initial quick questions shown before any conversation
const INITIAL_QUESTIONS = [
  "Что такое диагностика?",
  "Сколько времени занимает?",
  "Что будет в результате?",
  "Чем отличается платная?",
];

// Contextual follow-up questions mapped to keywords in Lexy's answer
const SUGGESTION_RULES: { keywords: string[]; suggestions: string[] }[] = [
  {
    keywords: ["диагностик", "анкет", "вопрос"],
    suggestions: [
      "Сколько вопросов в анкете?",
      "Можно ли сохранить прогресс?",
      "Что происходит после анкеты?",
    ],
  },
  {
    keywords: ["риск", "категори", "уровень"],
    suggestions: [
      "Что означает высокий риск?",
      "Как снизить риски?",
      "Что делать при критическом риске?",
    ],
  },
  {
    keywords: ["документ", "договор", "политик", "соглашени"],
    suggestions: [
      "Какие документы нужны для SaaS?",
      "Как составить политику конфиденциальности?",
      "Что такое пользовательское соглашение?",
    ],
  },
  {
    keywords: ["персональн", "данн", "152-ФЗ", "GDPR"],
    suggestions: [
      "Что такое 152-ФЗ?",
      "Нужно ли уведомлять Роскомнадзор?",
      "Как правильно собирать согласия?",
    ],
  },
  {
    keywords: ["платн", "тариф", "стоимост", "цен"],
    suggestions: [
      "Что входит в платную диагностику?",
      "Как оплатить?",
      "Когда будет готов отчёт?",
    ],
  },
  {
    keywords: ["отчёт", "результат", "PDF", "скачать"],
    suggestions: [
      "Можно ли поделиться отчётом?",
      "Как долго хранится отчёт?",
      "Что делать с рекомендациями?",
    ],
  },
  {
    keywords: ["интеллектуальн", "авторск", "права", "патент"],
    suggestions: [
      "Как защитить программный код?",
      "Что такое свидетельство на ПО?",
      "Нужен ли патент для IT-продукта?",
    ],
  },
  {
    keywords: ["оферт", "публичн", "акцепт"],
    suggestions: [
      "Чем оферта отличается от договора?",
      "Когда нужна публичная оферта?",
      "Как правильно оформить акцепт?",
    ],
  },
];

const DEFAULT_SUGGESTIONS = [
  "Расскажи подробнее",
  "Как начать диагностику?",
  "Какие риски самые частые?",
];

function getSuggestions(answerText: string): string[] {
  const lower = answerText.toLowerCase();
  for (const rule of SUGGESTION_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return rule.suggestions;
    }
  }
  return DEFAULT_SUGGESTIONS;
}

export default function LexyWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Привет! Я Lexy — ваш помощник по правовой диагностике IT-продуктов. Чем могу помочь?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const askLexy = trpc.diagnostic.askLexy.useMutation();

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { id: Date.now().toString(), role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const res = await askLexy.mutateAsync({ question: text });
      const suggestions = getSuggestions(res.answer);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "_a",
          role: "assistant",
          text: res.answer,
          suggestions,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "_err",
          role: "assistant",
          text: "Извините, произошла ошибка. Попробуйте ещё раз.",
          suggestions: DEFAULT_SUGGESTIONS,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // The last assistant message (to show its suggestions below it)
  const lastAssistantIdx = messages.reduce(
    (last, msg, idx) => (msg.role === "assistant" ? idx : last),
    -1
  );

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 active:scale-95 transition-transform flex items-center justify-center"
        aria-label="Открыть чат с Lexy"
      >
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>

      {/* Chat window */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 bg-background border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in-up">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-primary text-primary-foreground">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-sm">Lexy</div>
              <div className="text-xs text-white/70">Ваш правовой помощник</div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-72">
            {messages.map((msg, idx) => (
              <div key={msg.id}>
                <div
                  className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-muted text-foreground rounded-tl-sm"
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>

                {/* Suggested follow-up questions after each assistant message */}
                {msg.role === "assistant" &&
                  idx === lastAssistantIdx &&
                  !loading &&
                  msg.suggestions && (
                    <div className="mt-2 ml-9 flex flex-wrap gap-1.5">
                      {msg.suggestions.map((q) => (
                        <button
                          key={q}
                          onClick={() => sendMessage(q)}
                          className="text-xs px-2.5 py-1 rounded-full border border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
              </div>
            ))}

            {/* Initial quick questions (before first user message) */}
            {messages.length === 1 && !loading && (
              <div className="flex flex-wrap gap-1.5">
                {INITIAL_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="text-xs px-2.5 py-1 rounded-full border border-border bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {loading && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="bg-muted px-3 py-2 rounded-xl rounded-tl-sm">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border p-3 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
              placeholder="Напишите вопрос..."
              className="flex-1 text-sm bg-muted rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 transition-opacity hover:opacity-90 active:scale-95"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
