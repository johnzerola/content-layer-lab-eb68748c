import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AccountCta } from "@/components/landing/AccountCta";

/** Cabeçalho, luz ambiente e rodapé compartilhados pelas páginas públicas. */
export function LandingShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div
          className="absolute inset-0 opacity-[0.6]"
          style={{
            background:
              "radial-gradient(900px 540px at 78% -12%, color-mix(in oklab, var(--primary) 24%, transparent), transparent 70%), radial-gradient(760px 440px at 4% 6%, color-mix(in oklab, var(--cyan) 12%, transparent), transparent 72%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.13]"
          style={{
            backgroundImage:
              "linear-gradient(to right, color-mix(in oklab, var(--foreground) 10%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--foreground) 10%, transparent) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
            maskImage: "radial-gradient(80% 60% at 50% 0%, black, transparent 85%)",
          }}
        />
      </div>

      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-5 px-5">
          <Link to="/vendas" className="flex min-w-0 items-center gap-2">
            <span className="auth-logo grid size-7 shrink-0 place-items-center rounded-lg text-primary-foreground">
              <span className="font-display text-sm font-bold">V</span>
            </span>
            <span className="font-display text-[15px] font-semibold tracking-tight">VaiViral</span>
          </Link>
          <nav className="ml-auto hidden items-center gap-6 md:flex">
            <Link to="/vendas" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Início
            </Link>
            <Link to="/editor-demo" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Ver o editor
            </Link>
            <Link to="/planos" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Planos
            </Link>
          </nav>
          <AccountCta
            guestLabel="Entrar"
            memberLabel="Abrir meu estúdio"
            className="lp-cta-glow ml-auto inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-px md:ml-0"
          />
        </div>
      </header>

      <main className="relative z-10">{children}</main>

      <footer className="relative z-10 border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <span>© {new Date().getFullYear()} VaiViral</span>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/vendas" className="transition-colors hover:text-foreground">
              Landing
            </Link>
            <Link to="/termos" className="transition-colors hover:text-foreground">
              Termos
            </Link>
            <Link to="/privacidade" className="transition-colors hover:text-foreground">
              Privacidade
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
