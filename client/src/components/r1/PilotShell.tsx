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
      <header className="border-b border-border bg-card">
        <div className="container flex min-h-16 flex-wrap items-center justify-between gap-x-5 gap-y-2 py-2">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-1 font-display text-lg font-800 tracking-tight outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Scale className="size-4" aria-hidden="true" />
            </span>
            Lexy
          </Link>
          <nav aria-label="Навигация Pilot" className="flex items-center gap-1">
            <Link
              href="/pilot"
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              Pilot
            </Link>
            <Link
              href="/cabinet"
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              Кабинет
            </Link>
            {admin && (
              <Link
                href="/admin/pilot-diagnostics"
                className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                Диагностика
              </Link>
            )}
          </nav>
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
