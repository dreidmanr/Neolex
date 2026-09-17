import { Scale } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";

type PilotShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  admin?: boolean;
};

export default function PilotShell({
  eyebrow,
  title,
  description,
  children,
  admin = false,
}: PilotShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-white/10 bg-[#06101f] text-white shadow-[0_8px_30px_rgba(3,12,28,.18)]">
        <div className="container flex min-h-[72px] flex-wrap items-center justify-between gap-x-5 gap-y-2 py-2">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-3 rounded-lg px-1 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-[#4a91e8]"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#1677d2] text-white shadow-lg shadow-blue-950/30">
              <Scale className="size-5" aria-hidden="true" />
            </span>
            <span><span className="block font-display text-xl font-800 leading-none tracking-tight">Neolex</span><span className="mt-1 block text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">Legal Tech</span></span>
          </Link>
          <nav aria-label="Навигация Pilot" className="hidden items-center gap-2 md:flex">
            <Link
              href="/pilot"
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-[#55a6ff] outline-none transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-[#4a91e8]"
            >
              Pilot
            </Link>
            <Link
              href="/cabinet"
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-slate-300 outline-none transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-[#4a91e8]"
            >
              Кабинет
            </Link>
            {admin && (
              <Link
              href="/admin/pilot-diagnostics"
                className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-slate-300 outline-none transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-[#4a91e8]"
              >
                Диагностика
              </Link>
            )}
          </nav>
          <Link href="/pilot" className="inline-flex min-h-10 items-center rounded-full bg-[#1677d2] px-4 text-sm font-bold text-white transition hover:bg-[#1d8cff] focus-visible:ring-2 focus-visible:ring-[#4a91e8]">Открыть Lexy</Link>
        </div>
      </header>

      <main className="container py-8 sm:py-12">
        <div className="mb-8 max-w-3xl border-l-2 border-primary pl-4 sm:mb-10">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">
            {eyebrow}
          </p>
          <h1 className="font-display text-3xl font-800 tracking-tight sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        {children}
      </main>
    </div>
  );
}
