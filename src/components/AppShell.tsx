import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Layers,
  Palette,
  KeyRound,
  FolderKanban,
  Scissors,
  Eraser,
  Library,
  Cloud,
  CalendarClock,
  History,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkle,
  Wand2,
  Droplets,
  HardDrive,
  Radio,
  Settings2,
  BarChart3,
  Shield,
  Images,
  Users,
  Menu,
  X,
} from "lucide-react";

import { TooltipProvider } from "@/components/ui/base";
import { PlanGate } from "@/components/PlanGate";
import { GlobalActionBar } from "@/components/GlobalActionBar";
import { ProcessSteps } from "@/components/ProcessSteps";
import { useAccess } from "@/lib/subscription";
import { planFromId } from "@/lib/plan";
import { markPendingShellMode, type ShellMode } from "@/lib/handoff";

export type AppMode = "lote" | "clip" | "limpar" | "limpar-ia" | "external";

type ModeDef = {
  id: AppMode;
  /** nome curto no menu */
  label: string;
  hint: string;
  /** marca própria da ferramenta */
  brand: string;
  mark: string;
  tagline: string;
  headline: string;
  /** palavra de destaque em serifa itálica, ao fim do título */
  accent: string;
  description: string;
  chips: string[];
  icon: typeof Layers;
  badge: typeof Sparkle;
};

const MODES: ModeDef[] = [
  {
    id: "lote",
    label: "Lote com template",
    hint: "branding em massa",
    brand: "ViralBatch",
    mark: "VB",
    tagline: "branding em massa",
    headline: "Um template, centenas de vídeos",
    accent: "prontos",
    description:
      "Monte o layout uma vez — avatar, nome, headline, CTA e marca d'água — e aplique em todo o lote com variações antiduplicidade.",
    chips: ["editor de template", "variações 3–5x", "branding automático", "ZIP por plataforma"],
    icon: Layers,
    badge: Sparkle,
  },
  {
    id: "clip",
    label: "Só cortes",
    hint: "clipagem sem template",
    brand: "CorteIA",
    mark: "CI",
    tagline: "clipagem inteligente",
    headline: "Ache os melhores momentos",
    accent: "sozinho",
    description:
      "A IA lê energia de fala e movimento, pontua cada trecho e devolve os cortes prontos — sem template, sem branding, só o vídeo limpo no formato vertical.",
    chips: ["score viral", "duração min/máx", "reordenar cortes", "export direto"],
    icon: Scissors,
    badge: Wand2,
  },
  {
    id: "limpar",
    label: "Limpar vídeo",
    hint: "remover texto e marca",
    brand: "LimpaVídeo",
    mark: "LV",
    tagline: "restauração de quadro",
    headline: "Apague textos e",
    accent: "marcas d'água",
    description:
      "Detecção automática das áreas fixas + reconstrução por inpainting (Telea) para tirar texto e logo sem borrão, mantendo o enquadramento original.",
    chips: ["detecção automática", "inpainting HQ", "antes / depois", "sem zoom"],
    icon: Eraser,
    badge: Droplets,
  },
  {
    id: "limpar-ia",
    label: "AI Video Cleaner",
    hint: "remoção profissional com GPU",
    brand: "CleanerIA",
    mark: "CI",
    tagline: "inpainting profissional",
    headline: "Remoção profissional com",
    accent: "ProPainter",
    description:
      "Módulo de alta fidelidade para reconstrução temporal profunda. Ideal para vídeos complexos onde a restauração local não é suficiente.",
    chips: ["ProPainter engine", "processamento configurável", "temporal tracking", "4K support"],
    icon: Sparkle,
    badge: Wand2,
  },
  {
    id: "external",
    label: "VaiViral",
    hint: "dashboard",
    brand: "VaiViral",
    mark: "VV",
    tagline: "clipagem em tempo real",
    headline: "Cortes automáticos de",
    accent: "lives",
    description:
      "Monitore transmissões do X, Kick e TikTok e gere cortes automáticos baseados em IA sem precisar de templates.",
    chips: ["monitoramento HLS", "score viral IA", "exportação rápida"],
    icon: Sparkle,
    badge: Sparkle,
  },
];

/** rotas fixas fora do estúdio — quando ativas, as ferramentas não ficam destacadas */
const ROUTE_PATHS = [
  "/templates",
  "/estilos",
  "/editor",
  "/projects",
  "/projetos",
  "/estudio",
  "/cortes",
  "/live",
  "/biblioteca",
  "/agenda",
  "/perfis",
  "/contas",
  "/conta",
  "/integracoes",
  "/armazenamento",
  "/metricas",
  "/admin",
  "/fotos",
  "/limpar-ia",
] as const;

interface Props {
  mode: AppMode;
  onMode: (m: AppMode) => void;
  count: number;
  /** total de vídeos na fila de cada ferramenta (filas independentes) */
  counts?: Partial<Record<AppMode, number>>;
  onLibrary: () => void;
  onCloud: () => void;
  children: ReactNode;
}

function NavItem({
  open,
  active,
  label,
  hint,
  icon: Icon,
  badge,
  routeTo,
  ...rest
}: {
  open: boolean;
  active?: boolean | undefined;
  label: string;
  hint?: string | undefined;
  icon: typeof Layers;
  badge?: ReactNode | undefined;
  routeTo?: "/" | undefined;
} & React.ComponentProps<"button">) {
  const className = `group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 ${
        active
          ? "bg-surface-2 text-foreground"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      } ${open ? "" : "justify-center px-0"}`;
  const content = (
    <>
      <span className="relative flex shrink-0 items-center">
        <span
          aria-hidden
          className={`aurora-rail aurora-slider absolute -left-2.5 w-[2px] rounded-full ${
            active ? "h-4 opacity-100" : "h-1 opacity-0"
          }`}
          style={{ display: open ? "block" : "none" }}
        />
        <Icon className={`size-[17px] ${active ? "text-primary" : ""}`} />
      </span>
      {open && (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium leading-tight">{label}</span>
          {hint && (
            <span className="block truncate text-[11px] leading-tight text-[var(--muted-2)]">
              {hint}
            </span>
          )}
        </span>
      )}
      {open && badge}
    </>
  );

  if (routeTo) {
    return (
      <Link
        to={routeTo}
        title={label}
        aria-current={active ? "page" : undefined}
        className={className}
        preload="intent"
        onClick={(event) => rest.onClick?.(event as unknown as React.MouseEvent<HTMLButtonElement>)}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      title={label}
      aria-current={active ? "page" : undefined}
      className={className}
      {...rest}
    >
      {content}
    </button>
  );
}

export function AppShell({ mode, onMode, count, counts, onLibrary, onCloud, children }: Props) {
  const [open, setOpen] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const [user, setUser] = useState<any>(null);
  const { signedIn, sub, isAdmin } = useAccess();
  const plan = planFromId(sub?.plan);
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigating = useRouterState({ select: (r) => r.status === "pending" });
  const navigate = useNavigate();
  const onFixedRoute = ROUTE_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    import("@/lib/cloud").then(({ currentUser, onAuth }) => {
      void currentUser().then(setUser);
      return onAuth(setUser);
    });
  }, []);

  const current = MODES.find((m) => m.id === mode)!;

  // mantém portais (modais, toasts) na mesma identidade de cor
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-lote", "theme-clip", "theme-limpar", "theme-limpar-ia");
    root.classList.add(`theme-${mode}`);
  }, [mode]);

  useEffect(() => {
    if (!mobileNav) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNav(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileNav]);

  const openTool = (nextMode: AppMode) => {
    if (nextMode === "external") return;
    if (onFixedRoute) {
      markPendingShellMode(nextMode);
      void navigate({ to: "/" });
      return;
    }
    onMode(nextMode);
  };

  const routeLink = (
    to: string,
    label: string,
    Icon: typeof Layers,
    expanded = open,
    close?: () => void,
  ) => (
    <Link
      key={to}
      to={to as any}
      title={label}
      onClick={close}
      preload="intent"
      aria-current={pathname.startsWith(to) ? "page" : undefined}
      className={`flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors duration-150 ${
        pathname.startsWith(to)
          ? "bg-surface-2 text-foreground"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      } ${expanded ? "" : "justify-center px-0"}`}
    >
      <Icon
        className={`size-[17px] shrink-0 ${pathname.startsWith(to) ? "text-primary" : ""}`}
      />
      {expanded && <span className="truncate">{label}</span>}
    </Link>
  );

  /** Navegação agrupada por fluxo — reaproveitada na sidebar e no menu mobile. */
  const navSections = (expanded: boolean, close?: () => void) => (
    <>
      <nav className="flex flex-col gap-0.5 px-3" aria-label="Criar">
        {expanded && <p className="mono-label px-2.5 pb-1.5 pt-2">1 · Criar</p>}
        {/* "clip" saiu daqui: Corte IA e Cortes viraram uma única área em /cortes */}
        {MODES.filter((m) => m.id !== "external" && m.id !== "clip").map((m) => (
          <NavItem
            key={m.id}
            open={expanded}
            active={m.id === mode && !onFixedRoute}
            label={m.brand}
            hint={expanded ? m.hint : undefined}
            icon={m.icon}
            routeTo={onFixedRoute ? "/" : undefined}
            onClick={() => {
              if (onFixedRoute) markPendingShellMode(m.id as ShellMode);
              else openTool(m.id);
              close?.();
            }}
            badge={
              (counts?.[m.id] ?? 0) > 0 ? (
                <span className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {counts?.[m.id]}
                </span>
              ) : undefined
            }
          />
        ))}
        {routeLink("/cortes", "Corte IA & Cortes", Scissors, expanded, close)}
        {routeLink("/estudio", "Estúdio de gravação", Radio, expanded, close)}
        {routeLink("/fotos", "FotoViral", Images, expanded, close)}
      </nav>

      <div className="mt-4 flex flex-col gap-0.5 px-3">
        {expanded && <p className="mono-label px-2.5 pb-1.5">2 · Produção</p>}
        <NavItem
          open={expanded}
          label="Templates"
          icon={Library}
          onClick={() => {
            onLibrary();
            close?.();
          }}
        />
        {routeLink("/templates", "Templates de vídeo", Layers, expanded, close)}
        {routeLink("/estilos", "Estilos reutilizáveis", Palette, expanded, close)}

        {routeLink("/editor", "Editor profissional", Wand2, expanded, close)}
        {routeLink("/projetos", "Projetos", FolderKanban, expanded, close)}
        {routeLink("/biblioteca", "Resultados", History, expanded, close)}
        {routeLink("/armazenamento", "Armazenamento", HardDrive, expanded, close)}
        <NavItem
          open={expanded}
          label="Nuvem"
          icon={Cloud}
          onClick={() => {
            onCloud();
            close?.();
          }}
        />
      </div>

      <div className="mt-4 flex flex-col gap-0.5 px-3">
        {expanded && <p className="mono-label px-2.5 pb-1.5">3 · Distribuição</p>}
        {routeLink("/agenda", "Agenda", CalendarClock, expanded, close)}
        {routeLink("/contas", "Contas e credenciais", KeyRound, expanded, close)}
        {routeLink("/perfis", "Perfis", Users, expanded, close)}
        {routeLink("/live", "Monitora Live", Radio, expanded, close)}
        {routeLink("/metricas", "Métricas", BarChart3, expanded, close)}
      </div>

      <div className="mt-4 flex flex-col gap-0.5 px-3">
        {expanded && <p className="mono-label px-2.5 pb-1.5">Workspace</p>}
        {routeLink("/integracoes", "Integrações", Settings2, expanded, close)}
        {isAdmin && routeLink("/admin", "Admin", Shield, expanded, close)}
      </div>
    </>
  );

  const brandBlock = (expanded: boolean) => (
    <div className={expanded ? "px-3 pb-1 pt-3" : "px-0 py-3"}>
      <div
        className={`flex items-center gap-2.5 rounded-xl transition-colors ${
          expanded
            ? "border border-border bg-surface px-3 py-2.5"
            : "justify-center px-0 py-0"
        }`}
      >
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary font-display text-[13px] font-semibold text-primary-foreground">
          {current.mark}
        </div>
        {expanded && (
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[14px] font-semibold tracking-tight text-foreground">
              {current.brand}
            </p>
            <p className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
              {current.tagline}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  /** cartão da conta no rodapé da sidebar */
  const userCard = (expanded: boolean) => {
    const email = (user?.email as string | undefined) ?? "";
    const initial = (email.charAt(0) || "?").toUpperCase();
    if (!signedIn) return null;
    return (
      <Link
        to="/conta"
        title={email || "Conta"}
        className={`flex items-center gap-2.5 rounded-xl border border-border bg-surface transition-colors hover:border-[var(--border-hover)] ${
          expanded ? "px-2.5 py-2" : "justify-center px-0 py-2"
        }`}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-3 font-mono text-[11px] text-foreground">
          {initial}
        </span>
        {expanded && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-medium text-foreground">
              {email || "Minha conta"}
            </span>
            <span className="block truncate font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted-2)]">
              {plan.credits === null ? "ilimitado" : `${sub?.credits ?? 0} créditos`}
            </span>
          </span>
        )}
      </Link>
    );
  };

  return (
    <TooltipProvider delayDuration={350}>
    <div className={`theme-${mode} flex min-h-dvh w-full aurora-bg`}>
      <aside
        className={`sticky top-0 hidden h-dvh shrink-0 flex-col overflow-y-auto border-r border-border bg-[var(--background-2)] transition-[width] duration-[220ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] md:flex ${
          open ? "w-[244px]" : "w-[68px]"
        }`}
      >
        {brandBlock(open)}
        {navSections(open)}

        <div className="mt-auto flex flex-col gap-2 p-3">
          {userCard(open)}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Recolher menu" : "Expandir menu"}
            aria-expanded={open}
            className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground ${
              open ? "" : "justify-center px-0"
            }`}
          >
            {open ? (
              <PanelLeftClose className="size-[17px]" />
            ) : (
              <PanelLeftOpen className="size-[17px]" />
            )}
            {open && "Recolher"}
          </button>
        </div>
      </aside>

      {/* menu mobile / tablet */}
      {mobileNav && (
        <div
          className="fixed inset-0 z-[60] md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <button
            aria-label="Fechar menu"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileNav(false)}
          />
          <div className="drawer-in absolute inset-y-0 left-0 flex w-[86vw] max-w-[300px] flex-col overflow-y-auto border-r border-border bg-[var(--background-2)] pb-6">
            <div className="flex items-center justify-between pr-3">
              {brandBlock(true)}
              <button
                type="button"
                aria-label="Fechar menu"
                onClick={() => setMobileNav(false)}
                className="grid size-11 place-items-center rounded-lg text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>
            {navSections(true, () => setMobileNav(false))}
            <div className="mt-auto px-3 pt-4">{userCard(true)}</div>
          </div>
        </div>
      )}


      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-[20] border-b border-border bg-[color-mix(in_srgb,var(--background)_88%,transparent)] backdrop-blur-md">
          {navigating && (
            <div
              className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-primary/15"
              role="progressbar"
              aria-label="Carregando página"
            >
              <span className="block h-full w-1/3 animate-pulse bg-primary" />
            </div>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-label="Abrir menu"
                onClick={() => setMobileNav(true)}
                className="grid size-11 shrink-0 place-items-center rounded-lg bg-surface-2 text-primary transition hover:bg-surface-3 md:hidden"
              >
                <Menu className="size-5" />
              </button>

              <nav
                aria-label="Trilha"
                className="hidden min-w-0 shrink items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-2)] lg:flex"
              >
                <span className="text-foreground">VaiViral</span>
                <span className="text-border">/</span>
                <span className="truncate">
                  {onFixedRoute
                    ? (pathname.split("/")[1] ?? "").replace(/-/g, " ") || "estúdio"
                    : current.brand}
                </span>
              </nav>

              <GlobalActionBar className="max-w-md" />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="hidden rounded-lg border border-border bg-surface p-0.5 sm:flex md:hidden">
                {/* "clip" saiu daqui: Corte IA e Cortes viraram uma única área em /cortes */}
        {MODES.filter((m) => m.id !== "external" && m.id !== "clip").map((m) => (
                  <button
                    key={m.id}
                    onClick={() => openTool(m.id)}
                    aria-label={m.brand}
                    className={`grid size-9 place-items-center rounded-md transition ${
                      m.id === mode ? "bg-surface-3 text-primary" : "text-muted-foreground"
                    }`}
                  >
                    <m.icon className="size-4" />
                  </button>
                ))}
              </div>
              {signedIn && sub && (
                <Link
                  to="/checkout"
                  search={{ plano: plan.id }}
                  title="Plano e créditos"
                  className="hidden items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12px] text-muted-foreground transition hover:border-[var(--border-hover)] hover:text-foreground sm:inline-flex"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-foreground">
                    {plan.name}
                  </span>
                  <span className="text-border">/</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em]">
                    {plan.credits === null ? "ilimitado" : `${sub.credits} créditos`}
                  </span>
                </Link>
              )}
              <span className="hidden items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12px] text-muted-foreground sm:inline-flex">
                <span className="size-1.5 rounded-full bg-success" aria-hidden />
                <span className="font-mono text-[10px] uppercase tracking-[0.1em]">
                  {count} vídeo{count === 1 ? "" : "s"}
                </span>
              </span>
            </div>
          </div>
        </header>

        <div className="app-main mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 sm:px-6">
          {mode === "external" || onFixedRoute ? null : (
            <section
              key={current.id}
              className="rise-in mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5"
            >
              <div className="min-w-0">
                <p className="eyebrow">
                  <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                  {current.brand}
                  <span className="text-border">/</span>
                  {current.tagline}
                </p>
                <h2 className="title-editorial mt-2">
                  {current.headline} <span className="title-em">{current.accent}</span>
                </h2>
                <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                  {current.description}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {current.chips.slice(0, 3).map((c) => (
                  <span
                    key={c}
                    className="rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted-2)]"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </section>
          )}

          {mode === "external" || onFixedRoute ? null : (
            <ProcessSteps current={count > 0 ? 1 : 0} className="rise-in mb-5" />
          )}


          {/* 23 · só o conteúdo principal transita; o shell fica imóvel */}
          <div key={pathname} className="page-in">
            {isAdmin ? children : <PlanGate>{children}</PlanGate>}
          </div>
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}
