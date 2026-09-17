import { useState } from "react";
import { ArrowRight, Check, ChevronLeft, ChevronRight, FileText, Globe2, Lock, Menu, Scale, Send, Shield, Sparkles, X, type LucideIcon } from "lucide-react";
import { Link, useLocation } from "wouter";

const services = [
  ["Договоры и оферты", "Пользовательские соглашения, SaaS-контракты, NDA, лицензии", "от 20 000 ₽", FileText],
  ["Персональные данные", "Политика, уведомление в РКН, аудит 152-ФЗ", "от 10 000 ₽", Lock],
  ["Интеллектуальная собственность", "Регистрация ПО, товарные знаки, IP-assignment", "от 20 000 ₽", Shield],
  ["IT-аккредитация", "Подготовка и подача в Минцифры, реестр отечественного ПО", "от 100 000 ₽", FileText],
  ["Международное право", "GDPR, трансграничная передача, структурирование", "от 20 000 ₽", Globe2],
  ["AI и нейросети", "Правовой режим AI-контента, ответственность, регулирование", "от 20 000 ₽", Sparkles],
] as const;

const risks = [
  ["Права на продукт", "Критично", "92%", "#e11d48"],
  ["Хранение данных", "Критично", "85%", "#e11d48"],
  ["Персональные данные", "Высокий", "62%", "#f97316"],
  ["Платёжная модель", "Умеренный", "38%", "#eab308"],
] as const;

const audiences = [
  ["Стартап без юриста", "Вы запускаете продукт и хотите сделать всё правильно с первого дня. Нужен минимальный правовой каркас: договоры, ПДн, права на код."],
  ["Бизнес с юристом без IT-опыта", "У вас есть юрист, но он не специализируется на IT. Нужна экспертиза в цифровом праве: 152-ФЗ, SaaS, API, AI."],
  ["Растущая компания", "Вы масштабируетесь: новые рынки, инвесторы, регуляторы. Нужен абонентский юрист, который понимает IT."],
] as const;

const cases = [
  ["SIGA", "Защита ПО и товарного знака", "Регистрация в Роспатенте за 45 дней"],
  ["АБЗ-ЭКСПЕРТ", "Комплексный IT-аудит", "Устранены 12 правовых рисков"],
  ["Стефан Попов", "Структурирование IP для инвестора", "Сделка закрыта на 30% выше оценки"],
] as const;

const highlights: readonly [string, string, LucideIcon][] = [
  ["Договоры и оферты", "Разработка и проверка", FileText],
  ["Персональные данные", "152-ФЗ, GDPR", Lock],
  ["Интеллектуальная собственность", "Права на код и бренд", Shield],
  ["Международное право", "Выход на зарубежные рынки", Globe2],
];

export default function Home() {
  const [, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showPromo, setShowPromo] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoError, setPromoError] = useState("");
  const [slide, setSlide] = useState(0);

  const startFree = () => navigate("/diagnostic");
  const openPaid = () => { setPromoCode(""); setPromoError(""); setShowPromo(true); };
  const submitPromo = () => promoCode.trim() === "123" ? navigate("/paid") : setPromoError("Неверный промо-код. Попробуйте ещё раз.");
  const nav = ["Главная", "О компании", "Услуги", "Lexy", "Кейсы", "Контент", "Контакты"];
  const hrefs = ["/", "/about", "/services", "/lexy", "/cases", "/blog", "/contacts"];

  const hero = [
    { eyebrow: "Юридическая компания для цифрового бизнеса", title: "Юридическая безопасность вашего IT-продукта", description: "Neolex — юридическая компания, которая помогает IT-стартапам и цифровым бизнесам строить правовую защиту с первого дня. Договоры, данные, ИС, лицензии — всё в одном месте." },
    { eyebrow: "Флагманский продукт", title: "Lexy — AI-диагностика правовых рисков", description: "Ответьте на 8 вопросов о вашем продукте — получите персонализированный отчёт с зонами риска, потенциальными штрафами и конкретными шагами для защиты бизнеса." },
    { eyebrow: "Углублённая диагностика", title: "Подготовьте продукт к росту", description: "Расширенная платная диагностика проверяет 14 блоков, документы, договоры и формирует дорожную карту действий на 30, 60 и 90 дней." },
  ][slide];

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#030b17] text-white">
      <header className="sticky top-0 z-50 border-b border-white/[.08] bg-[#030b17]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[66px] max-w-[1440px] items-center gap-7 px-5 lg:px-16">
          <Link href="/" className="flex shrink-0 items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#1677d2] shadow-[0_8px_24px_rgba(22,119,210,.35)]"><Scale className="size-5" /></span>
            <span><span className="block text-xl font-semibold tracking-tight">Neolex</span><span className="block text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">Legal Tech</span></span>
          </Link>
          <nav className="hidden items-center gap-1 text-sm lg:flex" aria-label="Главное меню">
            {nav.map((item, i) => <Link key={item} href={hrefs[i]} className={`rounded-lg px-3 py-2 transition ${i === 0 ? "bg-[#0b213e] font-semibold text-[#4a91e8]" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>{item}</Link>)}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <button aria-label="Светлая тема" className="hidden p-2 text-slate-400 hover:text-white sm:block">☼</button>
            <a href="https://t.me/radakolunova" aria-label="Telegram" className="hidden p-2 text-slate-400 hover:text-white sm:block"><Send className="size-4" /></a>
            <button onClick={openPaid} className="hidden rounded-full border border-[#4a91e8]/60 px-4 py-3 text-sm font-bold text-[#8bbcff] transition hover:bg-[#0b213e] md:block">Углублённая диагностика</button>
            <button onClick={startFree} className="rounded-full bg-[#1677d2] px-5 py-3 text-sm font-bold shadow-[0_8px_26px_rgba(22,119,210,.35)] transition hover:bg-[#2189ed]">Бесплатная диагностика</button>
            <button className="lg:hidden" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Меню"><Menu className="size-6" /></button>
          </div>
        </div>
        {mobileOpen && <nav className="border-t border-white/10 bg-[#06101f] px-5 py-3 lg:hidden">{nav.map((item, i) => <Link key={item} href={hrefs[i]} onClick={() => setMobileOpen(false)} className="block border-b border-white/5 py-3 text-sm text-slate-300">{item}</Link>)}<button onClick={openPaid} className="mt-3 w-full rounded-full border border-[#4a91e8]/60 px-4 py-3 text-sm font-bold text-[#8bbcff]">Углублённая диагностика</button></nav>}
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-white/[.08] bg-[#030b17] py-16 lg:py-20">
          <div className="absolute -right-32 top-12 size-[620px] rounded-full bg-[#0b315d]/20 blur-3xl" />
          <div className="relative mx-auto max-w-[1440px] px-5 lg:px-16">
            <div className="grid items-center gap-12 lg:grid-cols-[.92fr_1.08fr]">
              <div>
                <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#1677d2]/40 bg-[#0b213e]/70 px-4 py-2 text-sm font-semibold text-[#4a91e8]"><Sparkles className="size-4" />{hero.eyebrow}</div>
                <h1 className="max-w-2xl text-5xl font-extrabold leading-[1.02] tracking-[-.045em] sm:text-6xl lg:text-[62px]">{slide === 0 ? <>Юридическая безопасность<br /><span className="text-[#3080ff]">вашего IT-продукта</span></> : <><span className="text-[#3080ff]">{slide === 1 ? "Lexy" : "Neolex"}</span> — {slide === 1 ? "AI-диагностика правовых рисков" : "углублённая защита бизнеса"}</>}</h1>
                <p className="mt-6 max-w-xl text-lg leading-7 text-slate-400">{hero.description}</p>
                <div className="mt-8 flex flex-wrap gap-3"><button onClick={slide === 2 ? openPaid : slide === 1 ? startFree : () => navigate("/contacts")} className="inline-flex items-center gap-3 rounded-full bg-[#1677d2] px-6 py-4 text-base font-bold shadow-[0_10px_34px_rgba(22,119,210,.36)] transition hover:bg-[#2189ed)">{slide === 0 ? "Обсудить задачу" : slide === 1 ? "Попробовать бесплатно" : "Открыть углублённую диагностику"} <ArrowRight className="size-5" /></button>{slide === 0 && <button onClick={startFree} className="inline-flex items-center rounded-full border border-[#4a91e8]/60 px-6 py-4 text-base font-semibold text-[#a9cbf5] transition hover:bg-[#0b213e]">Бесплатная диагностика</button>}</div>
              </div>
              <div className="grid gap-3">{highlights.map(([title, desc, Icon], i) => <div key={String(title)} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-[#071426]/75 px-5 py-4 shadow-[0_10px_30px_rgba(0,0,0,.16)]"><span className="grid size-10 place-items-center rounded-xl bg-[#0b315d]/70 text-[#3080ff]"><Icon className="size-5" /></span><span className="min-w-0"><strong className="block text-sm font-semibold text-slate-100">{title}</strong><span className="mt-1 block text-xs text-slate-500">{desc}</span></span>{i === 0 && <span className="ml-auto rounded-full bg-[#3080ff] px-2 py-1 text-[10px] font-semibold">Полный цикл</span>}</div>)}</div>
            </div>
            <div className="mt-10 flex items-center gap-3"><button aria-label="Назад" onClick={() => setSlide((slide + 2) % 3)} className="grid size-10 place-items-center rounded-full border border-white/15 text-slate-400 hover:border-[#3080ff] hover:text-white"><ChevronLeft className="size-5" /></button>{[0, 1, 2].map(i => <button key={i} aria-label={`Слайд ${i + 1}`} onClick={() => setSlide(i)} className={`h-2 rounded-full transition-all ${i === slide ? "w-8 bg-[#3080ff]" : "w-2 bg-slate-600"}`} />)}<button aria-label="Вперёд" onClick={() => setSlide((slide + 1) % 3)} className="grid size-10 place-items-center rounded-full border border-white/15 text-slate-400 hover:border-[#3080ff] hover:text-white"><ChevronRight className="size-5" /></button></div>
            <div className="mt-12 grid max-w-xl grid-cols-4 gap-6 border-t border-white/10 pt-7"><Stat value="7+" label="лет в IT-праве" /><Stat value="80+" label="клиентов" /><Stat value="30+" label="IT-продуктов" /><Stat value="12ч" label="время ответа" /></div>
          </div>
        </section>

        <section id="lexy" className="bg-[#f6f8fb] py-24 text-[#0b1b31]"><div className="mx-auto grid max-w-[1240px] gap-14 px-5 lg:grid-cols-2 lg:px-10"><div><div className="mb-5 inline-flex rounded-full bg-[#e5f0ff] px-4 py-2 text-sm font-bold text-[#1677d2]">Флагманский продукт</div><h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Lexy — AI-диагностика правовых рисков</h2><p className="mt-5 text-lg leading-8 text-slate-500">Ответьте на 8 вопросов о вашем продукте — получите персонализированный отчёт с зонами риска, потенциальными штрафами и конкретными шагами для защиты бизнеса. Бесплатно и за 5 минут.</p><ul className="mt-8 grid gap-4 sm:grid-cols-2">{["9 зон правового риска — от ПДн до лицензирования", "Персональная вилка штрафов (мин–макс)", "Приоритетные действия на первые 7 дней", "Ссылки на конкретные статьи законов"].map(item => <li key={item} className="flex gap-3 text-sm font-semibold"><Check className="mt-0.5 size-5 shrink-0 text-[#1677d2]" />{item}</li>)}</ul><div className="mt-9 flex flex-wrap gap-3"><button onClick={startFree} className="rounded-full bg-[#1677d2] px-6 py-3.5 font-bold text-white">Попробовать бесплатно</button><button onClick={openPaid} className="rounded-full border border-[#1677d2] px-6 py-3.5 font-bold text-[#1677d2]">Углублённая диагностика</button><Link href="/lexy" className="rounded-full border border-slate-300 px-6 py-3.5 font-bold text-slate-700">Подробнее о Lexy</Link></div></div><ReportPreview light /></div></section>

        <section id="services" className="bg-[#f6f8fb] py-20 text-[#0b1b31]"><SectionTitle title="Услуги для IT-бизнеса" subtitle="Полный цикл юридического сопровождения — от первого договора до выхода на международный рынок" /><div className="mx-auto grid max-w-[1240px] gap-4 px-5 sm:grid-cols-2 lg:grid-cols-3 lg:px-10">{services.map(([title, desc, price, Icon]) => <div key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_12px_35px_rgba(15,35,65,.05)] transition hover:-translate-y-1"><span className="mb-5 grid size-11 place-items-center rounded-xl bg-[#e8f2ff] text-[#1677d2]"><Icon className="size-5" /></span><h3 className="text-lg font-bold">{title}</h3><p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">{desc}</p><p className="mt-5 font-bold text-[#1677d2]">{price}</p></div>)}</div><div className="mt-10 text-center"><Link href="/services" className="inline-flex rounded-full border border-slate-300 px-6 py-3 font-bold">Все услуги и цены <ArrowRight className="ml-2 size-4" /></Link></div></section>

        <section id="about" className="bg-[#06101f] py-24"><div className="mx-auto max-w-[1240px] px-5 lg:px-10"><SectionTitle light title="Для кого мы работаем" subtitle="Три типа клиентов — одна экспертиза в IT-праве" /><div className="grid gap-5 md:grid-cols-3">{audiences.map(([title, desc]) => <div key={title} className="rounded-2xl border border-white/10 bg-white/[.03] p-7"><h3 className="text-xl font-bold">{title}</h3><p className="mt-4 leading-7 text-slate-400">{desc}</p></div>)}</div></div></section>

        <section id="cases" className="bg-[#f6f8fb] py-24 text-[#0b1b31]"><div className="mx-auto max-w-[1240px] px-5 lg:px-10"><div className="mb-12 flex items-end justify-between"><div><p className="text-sm font-bold uppercase tracking-widest text-[#1677d2]">Кейсы</p><h2 className="mt-3 text-4xl font-extrabold sm:text-5xl">Реальные результаты для реальных компаний</h2></div><Link href="/cases" className="hidden rounded-full border border-slate-300 px-5 py-3 font-bold sm:block">Все кейсы</Link></div><div className="grid gap-4 md:grid-cols-3">{cases.map(([name, title, result]) => <div key={name} className="rounded-2xl border border-slate-200 bg-white p-7"><p className="text-sm font-bold text-[#1677d2]">{name}</p><h3 className="mt-10 text-xl font-bold">{title}</h3><p className="mt-3 text-slate-500">{result}</p></div>)}</div></div></section>

        <section id="contacts" className="bg-[#06101f] py-24"><div className="mx-auto grid max-w-[1240px] items-center gap-14 px-5 lg:grid-cols-2 lg:px-10"><div><p className="text-sm font-bold uppercase tracking-widest text-[#4a91e8]">Основатель</p><h2 className="mt-4 text-4xl font-extrabold">Колунова Рада Янушевна</h2><p className="mt-3 text-lg text-slate-400">Основатель Neolex · Практикующий юрист в сфере IT и цифрового права</p><p className="mt-6 leading-7 text-slate-400">Более 7 лет сопровождения IT-компаний и цифровых продуктов. Выпускница МГЮА и РГГУ. Специализация: персональные данные, интеллектуальная собственность, SaaS-договоры, IT-аккредитация, регулируемые сферы.</p><div className="mt-7 flex flex-wrap gap-2">{["152-ФЗ и GDPR", "Права на ПО и IP", "SaaS и платформы", "IT-аккредитация", "AI и нейросети"].map(item => <span key={item} className="rounded-full border border-white/15 px-3 py-2 text-xs text-slate-300">{item}</span>)}</div><p className="mt-7 text-xs text-slate-500">Правовая база проверена на 1 июля 2026</p></div><div className="rounded-3xl border border-white/10 bg-white/[.04] p-8"><p className="text-sm font-bold uppercase tracking-widest text-[#4a91e8]">Готовы защитить свой продукт?</p><h2 className="mt-4 text-4xl font-extrabold leading-tight">Начните с бесплатной диагностики</h2><p className="mt-5 leading-7 text-slate-400">Начните с бесплатной диагностики — 5 минут, и вы узнаете, где ваши главные риски.</p><button onClick={startFree} className="mt-8 inline-flex items-center gap-3 rounded-full bg-[#1677d2] px-6 py-4 font-bold">Бесплатная диагностика <ArrowRight className="size-5" /></button><button onClick={openPaid} className="mt-4 block text-sm font-semibold text-slate-300 hover:text-white">Связаться с юристом</button></div></div></section>
      </main>

      <footer className="border-t border-white/10 bg-[#030b17] px-5 py-12 text-sm text-slate-400"><div className="mx-auto grid max-w-[1240px] gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr] lg:px-10"><div><Link href="/" className="flex items-center gap-3 text-white"><span className="grid size-10 place-items-center rounded-xl bg-[#1677d2]"><Scale className="size-5" /></span><span><strong className="block text-xl">Neolex</strong><small className="uppercase tracking-[.18em] text-slate-500">Legal Tech</small></span></Link><p className="mt-5 max-w-xs leading-6">Юридическая компания для цифрового бизнеса.</p></div><FooterColumn title="Компания" links={[["О компании", "/about"], ["Кейсы", "/cases"], ["Контент", "/blog"], ["Контакты", "/contacts"], ["Политика конфиденциальности", "/legal/privacy"]]} /><FooterColumn title="Услуги" links={[["Договоры", "/services#contracts"], ["Персональные данные", "/services#pd"], ["ИС и авторские права", "/services#ip"], ["IT-аккредитация", "/services#accreditation"], ["Претензии и суды", "/services#disputes"]]} /><div><h3 className="font-bold text-white">Контакты</h3><div className="mt-4 space-y-3"><a className="block hover:text-white" href="https://t.me/radalawyer">@radalawyer</a><a className="block hover:text-white" href="tel:+79645252752">+7 964 525-27-52</a><a className="block hover:text-white" href="mailto:radakolunova@yandex.ru">radakolunova@yandex.ru</a></div></div></div><div className="mx-auto mt-10 flex max-w-[1240px] flex-wrap justify-between gap-3 border-t border-white/10 pt-6 text-xs text-slate-500 lg:px-10"><span>© 2026 Neolex. Колунова Рада Янушевна, самозанятая (НПД). Все права защищены.</span><Link href="/legal/privacy" className="hover:text-white">Политика конфиденциальности</Link></div></footer>

      {showPromo && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-5"><div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0b1a2e] p-7 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-[#4a91e8]">Тестовый доступ</p><h2 className="mt-2 text-2xl font-extrabold">Углублённая диагностика</h2></div><button onClick={() => setShowPromo(false)} aria-label="Закрыть"><X className="size-5 text-slate-400" /></button></div><p className="mt-4 text-sm leading-6 text-slate-400">В Pilot-контуре доступ открывается по промокоду. Реальные платежи отключены.</p><input value={promoCode} onChange={e => setPromoCode(e.target.value)} placeholder="Промокод" className="mt-6 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white outline-none focus:border-[#1677d2]" />{promoError && <p className="mt-2 text-sm text-rose-300">{promoError}</p>}<button onClick={submitPromo} className="mt-5 w-full rounded-xl bg-[#1677d2] px-4 py-3.5 font-bold">Открыть тестовый доступ</button></div></div>}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) { return <div><p className="text-3xl font-medium text-white">{value}</p><p className="mt-1 text-xs text-slate-500">{label}</p></div>; }
function SectionTitle({ title, subtitle, light = false }: { title: string; subtitle: string; light?: boolean }) { return <div className="mx-auto mb-12 max-w-[1240px] px-5 text-center lg:px-10"><h2 className={`text-4xl font-extrabold sm:text-5xl ${light ? "text-white" : "text-[#0b1b31]"}`}>{title}</h2><p className={`mt-4 text-lg ${light ? "text-slate-400" : "text-slate-500"}`}>{subtitle}</p></div>; }
function FooterColumn({ title, links }: { title: string; links: readonly (readonly [string, string])[] }) { return <div><h3 className="font-bold text-white">{title}</h3><div className="mt-4 space-y-3">{links.map(([label, href]) => <Link key={label} href={href} className="block hover:text-white">{label}</Link>)}</div></div>; }
function ReportPreview({ light = false }: { light?: boolean }) { return <div className={`rounded-3xl border p-7 shadow-[0_20px_60px_rgba(0,0,0,.25)] ${light ? "border-slate-200 bg-white" : "border-white/10 bg-[#071426]"}`}><div className="flex items-start justify-between border-b border-current/10 pb-5"><div><p className={`text-xs ${light ? "text-slate-400" : "text-slate-500"}`}>Отчёт Lexy</p><h3 className={`mt-2 text-xl font-bold ${light ? "text-[#12223a]" : "text-white"}`}>Категория риска</h3></div><div className="text-right"><span className="rounded-full bg-rose-500/15 px-3 py-1 text-sm font-bold text-rose-400">Высокий</span><p className="mt-2 text-xs text-slate-500">балл 21</p></div></div><div className="mt-6 space-y-4">{risks.map(([label, level, width, color]) => <div key={label}><div className="mb-2 flex justify-between text-sm font-semibold"><span className={light ? "text-[#23324b]" : "text-slate-200"}>{label}</span><span style={{ color }}>{level}</span></div><div className="h-1.5 overflow-hidden bg-slate-700/60"><div className="h-full rounded-r-full" style={{ width, background: color }} /></div></div>)}</div><div className={`mt-7 rounded-2xl border p-4 text-sm leading-6 ${light ? "border-[#dbe7f5] bg-[#f2f7fc] text-slate-500" : "border-[#173657] bg-[#0c213b] text-slate-400"}`}><span className={light ? "font-bold text-[#23324b]" : "font-bold text-slate-200"}>Вывод:</span> выявлены существенные правовые риски. Рекомендуется оформить права на код и привести хранение данных в соответствие с 152-ФЗ.</div></div>; }

export { ReportPreview };
