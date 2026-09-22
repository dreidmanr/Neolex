import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Check, ChevronLeft, ChevronRight, FileText, Lock, Scale, Shield, Sparkles, Users, X, Zap } from "lucide-react";
import NeolexHeader from "@/components/NeolexHeader";
import NeolexFooter from "@/components/NeolexFooter";

const risks = [
  ["Права на продукт", "Критично", 92, "#d6234e"],
  ["Хранение данных", "Критично", 86, "#d6234e"],
  ["Персональные данные", "Высокий", 64, "#e77d39"],
  ["Платёжная модель", "Умеренный", 38, "#d5a51b"],
] as const;

export default function Home() {
  const [, navigate] = useLocation();
  const [slide, setSlide] = useState(0);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promo, setPromo] = useState("");
  const [error, setError] = useState("");
  const slides = [
    { kicker: "Флагманский продукт", title: <>Lexy — ваш AI-<br />помощник в<br />правовых рисках</>, text: "Ответьте на 8 вопросов о вашем продукте — получите персонализированный отчёт с зонами риска, вилкой штрафов и приоритетными действиями. Бесплатно и за 5 минут.", cta: "Узнать свои риски бесплатно" },
    { kicker: "Для IT-бизнеса", title: <>Правовая<br /><span className="text-[#367fe9]">устойчивость</span><br />вашего продукта</>, text: "Проверьте документы, данные, права на код и модель работы до того, как риски станут проблемой для бизнеса.", cta: "Пройти бесплатную диагностику" },
    { kicker: "Расширенный уровень", title: <>Глубокий аудит<br /><span className="text-[#367fe9]">задач бизнеса</span></>, text: "14 блоков, документы, дорожная карта 30/60/90 дней и структурированный отчёт для принятия решений.", cta: "Открыть углублённую диагностику" },
  ];
  const current = slides[slide];
  const openAdvanced = () => { setPromoOpen(true); setPromo(""); setError(""); };
  const submitPromo = () => { if (promo.trim() === "123") navigate("/paid"); else setError("Введите действующий промокод"); };
  return <div className="min-h-screen bg-[#030c1a] text-white"><NeolexHeader />
    <main>
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-32 top-16 h-[620px] w-[620px] rounded-full bg-[#176ee8]/10 blur-[100px]" />
        <div className="pointer-events-none absolute -left-40 bottom-0 h-[420px] w-[420px] rounded-full bg-[#0b55b9]/10 blur-[100px]" />
        <div className="mx-auto grid min-h-[720px] max-w-[1400px] items-center gap-12 px-5 py-20 lg:grid-cols-[.95fr_1.05fr] lg:px-10 lg:py-24">
          <div className="relative z-10">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#2b8cff]/25 bg-[#0d2850]/55 px-4 py-2 text-sm text-[#4297ff]"><Zap size={16} />{current.kicker}</div>
            <h1 className="max-w-[650px] text-5xl font-semibold leading-[1.05] tracking-[-.045em] sm:text-6xl lg:text-[68px]">{current.title}</h1>
            <p className="mt-7 max-w-[610px] text-lg leading-8 text-white/55 sm:text-xl">{current.text}</p>
            <div className="mt-9 flex flex-wrap gap-4"><button onClick={() => slide === 2 ? openAdvanced() : navigate("/diagnostic")} className="inline-flex items-center gap-3 rounded-full bg-[#176ee8] px-6 py-3.5 font-semibold shadow-[0_12px_32px_rgba(23,110,232,.3)] transition hover:bg-[#2d85ff]">{current.cta}<ArrowRight size={18} /></button><button onClick={() => navigate("/lexy")} className="rounded-full border border-white/15 px-6 py-3.5 font-semibold text-white/80 transition hover:border-white/35 hover:text-white">Подробнее о Lexy</button></div>
            <div className="mt-12 flex items-center gap-3"><button aria-label="Предыдущий слайд" onClick={() => setSlide((slide + slides.length - 1) % slides.length)} className="rounded-full border border-white/15 p-3 text-white/70 hover:border-white/40"><ChevronLeft size={18} /></button>{slides.map((_, i) => <button key={i} aria-label={"Слайд " + (i + 1)} onClick={() => setSlide(i)} className={slide === i ? "h-2 w-8 rounded-full bg-[#318cff]" : "h-2 w-2 rounded-full bg-white/25"} />)}<button aria-label="Следующий слайд" onClick={() => setSlide((slide + 1) % slides.length)} className="rounded-full border border-white/15 p-3 text-white/70 hover:border-white/40"><ChevronRight size={18} /></button></div>
          </div>
          <div className="relative z-10 rounded-[26px] border border-white/10 bg-[#071426]/90 p-6 shadow-[0_25px_90px_rgba(0,0,0,.35)] sm:p-8">
            <div className="mb-6 flex items-start justify-between border-b border-white/10 pb-5"><div><div className="text-xs text-white/40">Отчёт Lexy · Пример</div><div className="mt-2 text-xl font-medium">Категория риска</div></div><div className="text-right"><span className="rounded-full bg-[#6d1f25]/50 px-4 py-2 text-sm font-semibold text-[#ef3e4e]">Высокий</span><div className="mt-2 text-xs text-white/45">балл 21</div></div></div>
            <div className="space-y-5">{risks.map(([label, level, width, color]) => <div key={label}><div className="mb-2 flex justify-between text-sm"><span className="font-medium text-white/85">{label}</span><span style={{ color }}>{level}</span></div><div className="h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: String(width) + "%", background: color }} /></div></div>)}</div>
            <div className="mt-6 rounded-2xl border border-[#234265] bg-[#0b2039] p-4 text-sm leading-6 text-white/60"><span className="font-semibold text-white/80">Вывод:</span> выявлены существенные правовые риски. Рекомендуется оформить права на код и привести хранение данных в соответствии с 152-ФЗ.</div>
          </div>
        </div>
      </section>
      <section className="bg-[#071426] py-24"><div className="mx-auto max-w-[1400px] px-5 lg:px-10"><div className="mb-14 max-w-2xl"><div className="mb-4 text-sm font-medium text-[#3991ff]">Флагманский продукт</div><h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">Lexy — AI-диагностика правовых рисков</h2><p className="mt-5 text-lg leading-8 text-white/55">Ответьте на 8 вопросов о вашем продукте — получите персонализированный отчёт с зонами риска, потенциальными штрафами и конкретными шагами для защиты бизнеса.</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[[FileText,"9 зон правового риска"],[Shield,"Персональная вилка штрафов"],[Zap,"Приоритетные действия на 7 дней"],[Scale,"Ссылки на статьи законов"]].map(([Icon, label]) => <div key={label as string} className="rounded-2xl border border-white/10 bg-white/[.03] p-6"><Icon className="mb-5 text-[#348fff]" size={24} /><div className="font-medium text-white/85">{label as string}</div></div>)}</div><button onClick={() => navigate("/diagnostic")} className="mt-9 inline-flex items-center gap-2 rounded-full bg-[#176ee8] px-6 py-3.5 font-semibold">Попробовать бесплатно <ArrowRight size={17} /></button></div></section>
      <section className="bg-[#030c1a] py-24"><div className="mx-auto max-w-[1400px] px-5 lg:px-10"><div className="mb-12 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="mb-4 text-sm text-[#3991ff]">Следующий уровень</div><h2 className="text-4xl font-semibold sm:text-5xl">Углублённая диагностика</h2><p className="mt-4 max-w-2xl text-lg leading-8 text-white/55">Если нужна не экспресс-оценка, а полноценная карта юридических рисков продукта — пройдите расширенную анкету Lexy Advanced.</p></div><button onClick={openAdvanced} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#2d86f4] px-5 py-3 font-semibold text-[#65aaff] hover:bg-[#176ee8] hover:text-white">Открыть по промокоду <ArrowRight size={17} /></button></div><div className="grid gap-4 md:grid-cols-3">{[["14 блоков","Документы, данные, IP, договоры, AI и регулируемые сферы"],["30/60/90 дней","Пошаговая дорожная карта устранения рисков"],["Отчёт для решений","Структурированные выводы для владельца бизнеса"]].map(([title, text]) => <div key={title} className="rounded-2xl border border-white/10 bg-[#071426] p-6"><div className="mb-3 text-xl font-semibold">{title}</div><p className="text-sm leading-6 text-white/50">{text}</p></div>)}</div></div></section>
      <section className="bg-[#071426] py-20"><div className="mx-auto grid max-w-[1400px] gap-12 px-5 lg:grid-cols-3 lg:px-10"><div><h2 className="text-3xl font-semibold">Услуги для IT-бизнеса</h2><p className="mt-4 leading-7 text-white/50">Полный цикл юридического сопровождения — от первого договора до выхода на международный рынок.</p></div>{[["Договоры и оферты","Пользовательские соглашения, SaaS-контракты, NDA, лицензии"],["Персональные данные","Политика, уведомление в РКН, аудит 152-ФЗ"],["Интеллектуальная собственность","Регистрация ПО, товарные знаки, IP-assignment"],["AI и нейросети","Правовой режим AI-контента и регулирование"]].map(([title,text]) => <div key={title} className="rounded-2xl border border-white/10 p-6"><div className="mb-3 text-lg font-semibold">{title}</div><p className="text-sm leading-6 text-white/50">{text}</p></div>)}</div></section>
    </main><NeolexFooter />
    {promoOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-5" onClick={() => setPromoOpen(false)}><div className="w-full max-w-md rounded-3xl border border-white/15 bg-[#071426] p-7 shadow-2xl" onClick={e => e.stopPropagation()}><div className="flex items-start justify-between"><div><div className="mb-2 flex items-center gap-2 text-[#4a9aff]"><Lock size={17} /> Тестовый доступ</div><h2 className="text-2xl font-semibold">Углублённая диагностика</h2></div><button onClick={() => setPromoOpen(false)} className="text-white/50 hover:text-white"><X /></button></div><p className="mt-4 text-sm leading-6 text-white/55">Реальные платежи пока отключены. Введите промокод, чтобы открыть расширенную анкету.</p><input autoFocus value={promo} onChange={e => { setPromo(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && submitPromo()} placeholder="Промокод" className="mt-6 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white outline-none focus:border-[#348fff]" />{error && <div className="mt-2 text-sm text-red-400">{error}</div>}<button onClick={submitPromo} className="mt-4 w-full rounded-xl bg-[#176ee8] py-3.5 font-semibold hover:bg-[#2d85ff]">Открыть диагностику</button><div className="mt-4 flex items-center justify-center gap-2 text-xs text-white/35"><Check size={14} /> Без оплаты в текущем контуре</div></div></div>}
  </div>;
}
