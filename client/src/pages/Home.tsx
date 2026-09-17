import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Check, ChevronLeft, ChevronRight, FileText, Lock, Menu, Scale, Send, Shield, Sun, X, Zap } from "lucide-react";

const services = [
  ["Договоры и оферты", "Пользовательские соглашения, SaaS-контракты, NDA, лицензии", "от 20 000 ₽", FileText],
  ["Персональные данные", "Политика, уведомление в РКН, аудит 152-ФЗ", "от 10 000 ₽", Lock],
  ["Интеллектуальная собственность", "Регистрация ПО, товарные знаки, IP-assignment", "от 20 000 ₽", Shield],
  ["IT-аккредитация", "Подготовка и подача в Минцифры, реестр отечественного ПО", "от 100 000 ₽", FileText],
  ["Международное право", "GDPR, трансграничная передача, структурирование", "от 20 000 ₽", Scale],
  ["AI и нейросети", "Правовой режим AI-контента, ответственность, регулирование", "от 20 000 ₽", Zap],
] as const;

const risks = [
  ["Права на продукт", "Критично", "92%", "#e11d48"],
  ["Хранение данных", "Критично", "85%", "#e11d48"],
  ["Персональные данные", "Высокий", "62%", "#f97316"],
  ["Платёжная модель", "Умеренный", "38%", "#eab308"],
] as const;

const heroSlides = [
  { badge: "Флагманский продукт", title: "Lexy — ваш AI-помощник в правовых рисках", description: "Ответьте на 8 вопросов о вашем продукте — получите персонализированный отчёт с зонами риска, вилкой штрафов и приоритетными действиями. Бесплатно и за 5 минут." },
  { badge: "Бесплатная диагностика", title: "Поймите, где ваш продукт уязвим", description: "Быстро проверьте права на продукт, персональные данные, хранение информации и платёжную модель — без регистрации и реальных платежей." },
  { badge: "Углублённый Pilot", title: "Подготовьте бизнес к росту", description: "Расширенная диагностика проверяет 14 блоков, документы, договоры и формирует дорожную карту действий на 30, 60 и 90 дней." },
] as const;

export default function Home() {
  const [, navigate] = useLocation();
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoError, setPromoError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const heroSlide = heroSlides[activeSlide];

  const startFree = () => navigate("/diagnostic");
  const openPaid = () => { setPromoCode(""); setPromoError(""); setShowPromoModal(true); };
  const submitPromo = () => {
    if (promoCode.trim() === "123") navigate("/paid");
    else setPromoError("Неверный промо-код. Попробуйте ещё раз.");
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#030b17] text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#030b17]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[66px] max-w-[1440px] items-center gap-7 px-5 lg:px-16">
          <a href="#home" className="flex shrink-0 items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#1677d2] shadow-[0_8px_24px_rgba(22,119,210,.35)]"><Scale className="size-5" /></span>
            <span><span className="block text-xl font-semibold tracking-tight">Neolex</span><span className="block text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">Legal Tech</span></span>
          </a>
          <nav className="hidden items-center gap-1 text-sm lg:flex">
            {["Главная", "О компании", "Услуги", "Lexy", "Кейсы", "Контент", "Контакты"].map((item, i) => <a key={item} href={i === 0 ? "#home" : `#${item.toLowerCase().replaceAll(" ", "-")}`} className={`rounded-lg px-3 py-2 transition ${i === 0 ? "bg-[#0b213e] font-semibold text-[#4a91e8]" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>{item}</a>)}
          </nav>
          <div className="ml-auto flex items-center gap-3"><button aria-label="Сменить тему" className="hidden p-2 text-slate-400 hover:text-white sm:block"><Sun className="size-4" /></button><button aria-label="Контакты" className="hidden p-2 text-slate-400 hover:text-white sm:block"><Send className="size-4" /></button><button onClick={() => navigate("/paid")} className="hidden rounded-full border border-[#4a91e8]/60 px-4 py-3 text-sm font-bold text-[#8bbcff] transition hover:bg-[#0b213e] md:block">Углублённая диагностика</button><button onClick={startFree} className="hidden rounded-full bg-[#1677d2] px-5 py-3 text-sm font-bold shadow-[0_8px_26px_rgba(22,119,210,.35)] transition hover:bg-[#2189ed] sm:block">Бесплатная диагностика</button><button className="lg:hidden" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Меню"><Menu className="size-6" /></button></div>
        </div>
        {mobileOpen && <nav className="border-t border-white/10 bg-[#06101f] px-5 py-3 lg:hidden">{["Главная", "О компании", "Услуги", "Lexy", "Кейсы", "Контент", "Контакты"].map(item => <a key={item} href={`#${item.toLowerCase().replaceAll(" ", "-")}`} onClick={() => setMobileOpen(false)} className="block border-b border-white/5 py-3 text-sm text-slate-300">{item}</a>)}</nav>}
      </header>

      <main id="home">
        <section className="relative overflow-hidden border-b border-white/5 bg-[#030b17] py-24 lg:py-28">
          <div className="absolute -right-32 top-20 size-[600px] rounded-full bg-[#0b315d]/20 blur-3xl" />
          <div className="relative mx-auto grid max-w-[1440px] items-center gap-14 px-5 lg:grid-cols-[.95fr_1.05fr] lg:px-16">
            <div>
              <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#1677d2]/40 bg-[#0b213e]/70 px-4 py-2 text-sm font-semibold text-[#4a91e8]"><Zap className="size-4" />{heroSlide.badge}</div>
              <h1 className="max-w-2xl text-5xl font-extrabold leading-[.98] tracking-[-.045em] transition-opacity sm:text-6xl lg:text-[70px]"><span className="text-[#4a91e8]">Lexy</span>{activeSlide === 0 ? " — ваш AI-помощник в правовых рисках" : ` — ${heroSlide.title.replace("Lexy", "").trim()}`}</h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-slate-400">{heroSlide.description}</p>
              <div className="mt-9 flex flex-wrap gap-4"><button onClick={activeSlide === 2 ? () => navigate("/paid") : startFree} className="inline-flex items-center gap-3 rounded-full bg-[#1677d2] px-6 py-4 text-base font-bold shadow-[0_10px_34px_rgba(22,119,210,.36)] transition hover:bg-[#2189ed]">{activeSlide === 2 ? "Открыть углублённую диагностику" : "Узнать свои риски бесплатно"} <ArrowRight className="size-5" /></button><button onClick={() => navigate("/paid")} className="inline-flex items-center rounded-full border border-[#4a91e8]/60 px-6 py-4 text-base font-semibold text-[#a9cbf5] transition hover:bg-[#0b213e]">Платная диагностика</button><a href="#lexy" className="inline-flex items-center rounded-full border border-white/15 px-7 py-4 text-base font-semibold text-slate-200 transition hover:border-white/35 hover:bg-white/5">Подробнее о Lexy</a></div>
              <div className="mt-11 flex items-center gap-3"><button onClick={() => setActiveSlide((activeSlide + heroSlides.length - 1) % heroSlides.length)} aria-label="Предыдущий слайд" className="grid size-10 place-items-center rounded-full border border-white/15 text-slate-400 transition hover:border-[#4a91e8] hover:text-white"><ChevronLeft className="size-5" /></button>{heroSlides.map((slide, index) => <button key={slide.badge} onClick={() => setActiveSlide(index)} aria-label={`Слайд ${index + 1}`} className={`h-2 rounded-full transition-all ${index === activeSlide ? "w-8 bg-[#2189ed]" : "w-2 bg-slate-600 hover:bg-slate-400"}`} />)}<button onClick={() => setActiveSlide((activeSlide + 1) % heroSlides.length)} aria-label="Следующий слайд" className="grid size-10 place-items-center rounded-full border border-white/15 text-slate-400 transition hover:border-[#4a91e8] hover:text-white"><ChevronRight className="size-5" /></button></div>
            </div>
            <ReportPreview />
          </div>
        </section>

        <section id="lexy" className="bg-[#f6f8fb] py-24 text-[#0b1b31]"><div className="mx-auto grid max-w-[1240px] gap-14 px-5 lg:grid-cols-2 lg:px-10"><div><div className="mb-5 inline-flex rounded-full bg-[#e5f0ff] px-4 py-2 text-sm font-bold text-[#1677d2]">Флагманский продукт</div><h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Lexy — AI-диагностика правовых рисков</h2><p className="mt-5 text-lg leading-8 text-slate-500">Ответьте на 8 вопросов о вашем продукте — получите персонализированный отчёт с зонами риска, потенциальными штрафами и конкретными шагами для защиты бизнеса. Бесплатно и за 5 минут.</p><ul className="mt-8 grid gap-4 sm:grid-cols-2">{["9 зон правового риска — от ПДн до лицензирования", "Персональная вилка штрафов (мин–макс)", "Приоритетные действия на первые 7 дней", "Ссылки на конкретные статьи законов"].map(item => <li key={item} className="flex gap-3 text-sm font-semibold"><Check className="mt-0.5 size-5 shrink-0 text-[#1677d2]" />{item}</li>)}</ul><div className="mt-9 flex flex-wrap gap-3"><button onClick={startFree} className="rounded-full bg-[#1677d2] px-6 py-3.5 font-bold text-white">Попробовать бесплатно</button><button onClick={() => navigate("/paid")} className="rounded-full border border-[#1677d2] px-6 py-3.5 font-bold text-[#1677d2]">Углублённая диагностика</button><a href="#about" className="rounded-full border border-slate-300 px-6 py-3.5 font-bold text-slate-700">Подробнее о Lexy</a></div></div><div><ReportPreview light /></div></div></section>

        <section id="услуги" className="bg-[#f6f8fb] py-20 text-[#0b1b31]"><div className="mx-auto max-w-[1240px] px-5 lg:px-10"><div className="mb-12 text-center"><h2 className="text-4xl font-extrabold sm:text-5xl">Услуги для IT-бизнеса</h2><p className="mt-4 text-lg text-slate-500">Полный цикл юридического сопровождения — от первого договора до выхода на международный рынок</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{services.map(([title, desc, price, Icon]) => <div key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_12px_35px_rgba(15,35,65,.05)] transition hover:-translate-y-1 hover:shadow-lg"><span className="mb-5 grid size-11 place-items-center rounded-xl bg-[#e8f2ff] text-[#1677d2]"><Icon className="size-5" /></span><h3 className="text-lg font-bold">{title}</h3><p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">{desc}</p><p className="mt-5 font-bold text-[#1677d2]">{price}</p></div>)}</div><div className="mt-10 text-center"><a href="#contacts" className="inline-flex rounded-full border border-slate-300 px-6 py-3 font-bold">Все услуги и цены <ArrowRight className="ml-2 size-4" /></a></div></div></section>

        <section id="о-компании" className="bg-[#06101f] py-24"><div className="mx-auto max-w-[1240px] px-5 lg:px-10"><div className="mb-12 text-center"><h2 className="text-4xl font-extrabold sm:text-5xl">Для кого мы работаем</h2><p className="mt-4 text-lg text-slate-400">Три типа клиентов — одна экспертиза в IT-праве</p></div><div className="grid gap-5 md:grid-cols-3">{[["Стартап без юриста", "Вы запускаете продукт и хотите сделать всё правильно с первого дня. Нужен минимальный правовой каркас: договоры, ПДн, права на код."], ["Бизнес с юристом без IT-опыта", "У вас есть юрист, но он не специализируется на IT. Нужна экспертиза в цифровом праве: 152-ФЗ, SaaS, API, AI."], ["Растущая компания", "Вы масштабируетесь: новые рынки, инвесторы, регуляторы. Нужен абонентский юрист, который понимает IT."]].map(([title, desc]) => <div key={title} className="rounded-2xl border border-white/10 bg-white/[.03] p-7"><h3 className="text-xl font-bold">{title}</h3><p className="mt-4 leading-7 text-slate-400">{desc}</p></div>)}</div></div></section>

        <section id="кейсы" className="bg-[#f6f8fb] py-24 text-[#0b1b31]"><div className="mx-auto max-w-[1240px] px-5 lg:px-10"><div className="mb-12 flex items-end justify-between"><div><p className="text-sm font-bold uppercase tracking-widest text-[#1677d2]">Кейсы</p><h2 className="mt-3 text-4xl font-extrabold sm:text-5xl">Реальные результаты для реальных компаний</h2></div><a href="#contacts" className="hidden rounded-full border border-slate-300 px-5 py-3 font-bold sm:block">Все кейсы</a></div><div className="grid gap-4 md:grid-cols-3">{[["SIGA", "Защита ПО и товарного знака", "Регистрация в Роспатенте за 45 дней"], ["АБЗ-ЭКСПЕРТ", "Комплексный IT-аудит", "Устранены 12 правовых рисков"], ["Стефан Попов", "Структурирование IP для инвестора", "Сделка закрыта на 30% выше оценки"]].map(([name, title, result]) => <div key={name} className="rounded-2xl border border-slate-200 bg-white p-7"><p className="text-sm font-bold text-[#1677d2]">{name}</p><h3 className="mt-10 text-xl font-bold">{title}</h3><p className="mt-3 text-slate-500">{result}</p></div>)}</div></div></section>

        <section id="контакты" className="bg-[#06101f] py-24"><div className="mx-auto grid max-w-[1240px] items-center gap-14 px-5 lg:grid-cols-2 lg:px-10"><div><p className="text-sm font-bold uppercase tracking-widest text-[#4a91e8]">Основатель</p><h2 className="mt-4 text-4xl font-extrabold">Колунова Рада Янушевна</h2><p className="mt-3 text-lg text-slate-400">Основатель Neolex · Практикующий юрист в сфере IT и цифрового права</p><p className="mt-6 leading-7 text-slate-400">Более 7 лет сопровождения IT-компаний и цифровых продуктов. Выпускница МГЮА и РГГУ. Специализация: персональные данные, интеллектуальная собственность, SaaS-договоры, IT-аккредитация, регулируемые сферы.</p><div className="mt-7 flex flex-wrap gap-2">{["152-ФЗ и GDPR", "Права на ПО и IP", "SaaS и платформы", "IT-аккредитация", "AI и нейросети"].map(item => <span key={item} className="rounded-full border border-white/15 px-3 py-2 text-xs text-slate-300">{item}</span>)}</div><p className="mt-7 text-xs text-slate-500">Правовая база проверена на 1 июля 2026</p></div><div className="rounded-3xl border border-white/10 bg-white/[.04] p-8"><p className="text-sm font-bold uppercase tracking-widest text-[#4a91e8]">Готовы защитить свой продукт?</p><h2 className="mt-4 text-4xl font-extrabold leading-tight">Начните с бесплатной диагностики</h2><p className="mt-5 leading-7 text-slate-400">5 минут — и вы узнаете, где находятся главные правовые риски вашего продукта.</p><button onClick={startFree} className="mt-8 inline-flex items-center gap-3 rounded-full bg-[#1677d2] px-6 py-4 font-bold">Бесплатная диагностика <ArrowRight className="size-5" /></button><button onClick={openPaid} className="mt-4 block text-sm font-semibold text-slate-300 hover:text-white">Связаться с юристом</button></div></div></section>
      </main>

      <footer className="border-t border-white/10 bg-[#030b17] px-5 py-8 text-center text-sm text-slate-500">© Neolex · Legal Tech · <a href="#contacts" className="hover:text-white">Политика конфиденциальности</a></footer>

      {showPromoModal && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-5"><div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0b1a2e] p-7 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-[#4a91e8]">Тестовый доступ</p><h2 className="mt-2 text-2xl font-extrabold">Углублённая диагностика</h2></div><button onClick={() => setShowPromoModal(false)} aria-label="Закрыть"><X className="size-5 text-slate-400" /></button></div><p className="mt-4 text-sm leading-6 text-slate-400">В Pilot-контуре доступ открывается по промокоду. Реальные платежи отключены.</p><input value={promoCode} onChange={e => setPromoCode(e.target.value)} placeholder="Промокод" className="mt-6 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white outline-none focus:border-[#1677d2]" />{promoError && <p className="mt-2 text-sm text-rose-300">{promoError}</p>}<button onClick={submitPromo} className="mt-5 w-full rounded-xl bg-[#1677d2] px-4 py-3.5 font-bold">Открыть тестовый доступ</button></div></div>}
    </div>
  );
}

function ReportPreview({ light = false }: { light?: boolean }) {
  return <div className={`rounded-3xl border p-7 shadow-[0_20px_60px_rgba(0,0,0,.25)] ${light ? "border-slate-200 bg-white" : "border-white/10 bg-[#071426]"}`}><div className="flex items-start justify-between border-b border-current/10 pb-5"><div><p className={`text-xs ${light ? "text-slate-400" : "text-slate-500"}`}>Отчёт Lexy · Пример</p><h3 className={`mt-2 text-xl font-bold ${light ? "text-[#12223a]" : "text-white"}`}>Категория риска</h3></div><div className="text-right"><span className="rounded-full bg-rose-500/15 px-3 py-1 text-sm font-bold text-rose-400">Высокий</span><p className="mt-2 text-xs text-slate-500">балл 21</p></div></div><div className="mt-6 space-y-4">{risks.map(([label, level, width, color]) => <div key={label}><div className="mb-2 flex justify-between text-sm font-semibold"><span className={light ? "text-[#23324b]" : "text-slate-200"}>{label}</span><span style={{ color }}>{level}</span></div><div className="h-1.5 overflow-hidden bg-slate-700/60"><div className="h-full rounded-r-full" style={{ width, background: color }} /></div></div>)}</div><div className={`mt-7 rounded-2xl border p-4 text-sm leading-6 ${light ? "border-[#dbe7f5] bg-[#f2f7fc] text-slate-500" : "border-[#173657] bg-[#0c213b] text-slate-400"}`}><span className={light ? "font-bold text-[#23324b]" : "font-bold text-slate-200"}>Вывод:</span> выявлены существенные правовые риски. Рекомендуется оформить права на код и привести хранение данных в соответствие с 152-ФЗ.</div></div>;
}
