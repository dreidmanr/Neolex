import { useLocation } from "wouter";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import NeolexHeader from "@/components/NeolexHeader";
import NeolexFooter from "@/components/NeolexFooter";

const content = {
  "/about": { eyebrow: "О компании", title: "Юридическая экспертиза для цифрового бизнеса", text: "Neolex помогает IT-компаниям и владельцам цифровых продуктов принимать решения с пониманием правовых последствий.", cards: ["Специализация на IT и цифровом праве", "Понятные выводы без юридической перегрузки", "Сопровождение от запуска до масштабирования"] },
  "/services": { eyebrow: "Услуги", title: "Полный цикл юридического сопровождения", text: "От договоров и персональных данных до интеллектуальной собственности, AI и международного структурирования.", cards: ["Договоры и оферты", "Персональные данные и 152-ФЗ", "Интеллектуальная собственность", "AI и нейросети", "IT-аккредитация", "Международное право"] },
  "/lexy": { eyebrow: "Флагманский продукт", title: "Lexy — диагностика правовых рисков", text: "Начните с бесплатной экспресс-оценки или откройте расширенную диагностику по промокоду.", cards: ["Бесплатно — 8 вопросов и результат за 5–7 минут", "Углублённо — 14 блоков, документы и дорожная карта", "Понятный отчёт с приоритетными действиями"] },
  "/cases": { eyebrow: "Кейсы", title: "Результаты для цифрового бизнеса", text: "Помогаем защищать продукты, сделки и планы масштабирования.", cards: ["Защита ПО и товарного знака", "Комплексный IT-аудит", "Структурирование IP для инвестора"] },
  "/content": { eyebrow: "Контент", title: "Право без сложных формулировок", text: "Разбираем изменения законодательства и практические вопросы владельцев IT-продуктов.", cards: ["Персональные данные", "Права на код и контент", "SaaS, оферты и AI"] },
  "/contacts": { eyebrow: "Контакты", title: "Обсудим задачу вашего продукта", text: "Опишите продукт и вопрос — мы подскажем, с чего начать правовую работу.", cards: ["Бесплатная экспресс-диагностика Lexy", "Углублённая диагностика по промокоду", "Юридическое сопровождение бизнеса"] },
} as const;

export default function SiteSection() {
  const [location, navigate] = useLocation();
  const page = content[location as keyof typeof content] ?? content["/about"];
  return <div className="min-h-screen bg-[#030c1a] text-white"><NeolexHeader /><main><section className="border-b border-white/10 bg-[#071426] px-5 py-24 lg:px-10"><div className="mx-auto max-w-[1400px]"><div className="mb-5 text-sm text-[#3991ff]">{page.eyebrow}</div><h1 className="max-w-3xl text-5xl font-semibold leading-tight tracking-tight sm:text-6xl">{page.title}</h1><p className="mt-6 max-w-2xl text-xl leading-8 text-white/55">{page.text}</p><div className="mt-9 flex flex-wrap gap-4"><button onClick={() => navigate("/diagnostic")} className="inline-flex items-center gap-2 rounded-full bg-[#176ee8] px-6 py-3.5 font-semibold">Бесплатная диагностика <ArrowRight size={17} /></button><button onClick={() => navigate("/paid")} className="rounded-full border border-white/15 px-6 py-3.5 font-semibold text-white/80">Углублённая диагностика</button></div></div></section><section className="bg-[#030c1a] px-5 py-20 lg:px-10"><div className="mx-auto grid max-w-[1400px] gap-4 sm:grid-cols-2 lg:grid-cols-3">{page.cards.map(card => <div key={card} className="rounded-2xl border border-white/10 bg-[#071426] p-7"><CheckCircle2 className="mb-5 text-[#3991ff]" size={23} /><h2 className="text-lg font-semibold leading-7">{card}</h2><p className="mt-3 text-sm leading-6 text-white/45">Практический подход, понятные решения и фокус на защите бизнеса.</p></div>)}</div></section></main><NeolexFooter /></div>;
}
