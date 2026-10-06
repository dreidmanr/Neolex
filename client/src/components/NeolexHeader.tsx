import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Menu, Moon, Send, Sun, X } from "lucide-react";

export default function NeolexHeader({ dark = true }: { dark?: boolean }) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(dark);
  const nav = [
    ["О компании", "/about"],
    ["Услуги", "/services"],
    ["Lexy", "/lexy"],
    ["Кейсы", "/cases"],
    ["Контент", "/content"],
    ["Контакты", "/contacts"],
  ] as const;
  const cls = darkMode ? "text-white/70 hover:text-white" : "text-slate-600 hover:text-slate-950";
  return (
    <header className={`relative z-50 border-b ${darkMode ? "border-white/10 bg-[#030c1a]/95 text-white" : "border-slate-200 bg-white/95 text-slate-950"} backdrop-blur-xl`}>
      <div className="mx-auto flex h-[66px] max-w-[1400px] items-center gap-8 px-5 lg:px-10">
        <Link href="/" className="flex shrink-0 items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#2d9cff] to-[#1763dc] text-lg font-bold text-white shadow-[0_8px_25px_rgba(24,125,245,.35)]">♎</span>
          <span className="leading-none"><strong className="block text-[21px] font-semibold tracking-tight">Neolex</strong><small className="mt-1 block text-[10px] tracking-[.18em] text-white/45">LEGAL TECH</small></span>
        </Link>
        <nav className="hidden flex-1 items-center justify-center gap-7 lg:flex">
          <Link href="/" className={`rounded-lg bg-[#0b2c61]/70 px-4 py-2 text-sm font-medium text-[#4b9dff]`}>Главная</Link>
          {nav.map(([label, href]) => <Link key={href} href={href} className={`text-sm font-medium transition-colors ${cls}`}>{label}</Link>)}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <button aria-label="Переключить тему" onClick={() => setDarkMode(v => !v)} className={`hidden rounded-full p-2 transition ${cls} sm:block`}>{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
          <a href="https://t.me/neolex" aria-label="Telegram" className={`hidden p-2 transition ${cls} sm:block`}><Send size={18} /></a>
          <button onClick={() => navigate("/diagnostic")} className="hidden items-center gap-2 rounded-full bg-[#176ee8] px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_26px_rgba(23,110,232,.35)] transition hover:bg-[#2b84ff] sm:flex">Бесплатная диагностика <ArrowRight size={16} /></button>
          <button aria-label="Открыть меню" onClick={() => setOpen(v => !v)} className="rounded-lg p-2 lg:hidden">{open ? <X /> : <Menu />}</button>
        </div>
      </div>
      {open && <div className="border-t border-white/10 bg-[#030c1a] px-5 py-5 lg:hidden"><div className="grid gap-2">{nav.map(([label, href]) => <Link key={href} href={href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-white/80 hover:bg-white/10">{label}</Link>)}<button onClick={() => navigate("/paid")} className="mt-2 rounded-lg bg-[#176ee8] px-3 py-3 text-left font-semibold text-white">Углублённая диагностика по промокоду</button></div></div>}
    </header>
  );
}
