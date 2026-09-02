import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Layers,
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
} from "lucide-react";

import { TooltipProvider } from "@/components/ui/base";
import { PlanGate } from "@/components/PlanGate";
import { GlobalActionBar } from "@/components/GlobalActionBar";
import { useAccess } from "@/lib/subscription";
import { planFromId } from "@/lib/plan";

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
    headline: "Um template, centenas de vídeos prontos",
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
    headline: "Ache os melhores momentos sozinho",
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
    headline: "Apague textos e marcas d'água",
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
    headline: "Remoção Profissional com ProPainter",
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
    headline: "Cortes Automáticos de Lives",
    description:
      "Monitore transmissões do X, Kick e TikTok e gere cortes automáticos baseados em IA sem precisar de templates.",
    chips: ["monitoramento HLS", "score viral IA", "exportação rápida"],
    icon: Sparkle,
    badge: Sparkle,
  },
];

/** rotas fixas fora do estúdio — quando ativas, as ferramentas não ficam destacadas */
const ROUTE_PATHS = [
  "/live",
  "/biblioteca",
  "/agenda",
  "/perfis",
  "/integracoes",
  "/armazenamento",
  "/metricas",
  "/admin",
  "/fotos",
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
  ...rest
}: {
  open: boolean;
  active?: boolean | undefined;
  label: string;
  hint?: string | undefined;
  icon: typeof Layers;
  badge?: ReactNode | undefined;
} & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      title={label}
      aria-current={active ? "page" : undefined}
      className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 ${
        active
          ? "bg-surface-2 text-foreground"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      } ${open ? "" : "justify-center px-0"}`}
      {...rest}
    >
      <span className="relative flex shrink-0 items-center">
        {active && (
          <span
            aria-hidden
            className="absolute -left-2.5 h-4 w-[2px] rounded-full bg-primary"
            style={{ display: open ? "block" : "none" }}
          />
        )}
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
    </button>
  );
}

export function AppShell({ mode, onMode, count, counts, onLibrary, onCloud, children }: Props) {
  const [open, setOpen] = useState(true);
  const [user, setUser] = useState<any>(null);
  const { signedIn, sub, isAdmin } = useAccess();
  const plan = planFromId(sub?.plan);
  const pathname = useRouterState({ select: (r) => r.location.pathname });
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

  const routeLink = (to: string, label: string, Icon: typeof Layers) => (
    <Link
      key={to}
      to={to as any}
      title={label}
      aria-current={pathname.startsWith(to) ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors duration-150 ${
        pathname.startsWith(to)
          ? "bg-surface-2 text-foreground"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      } ${open ? "" : "justify-center px-0"}`}
    >
      <Icon
        className={`size-[17px] shrink-0 ${pathname.startsWith(to) ? "text-primary" : ""}`}
      />
      {open && <span className="truncate">{label}</span>}
    </Link>
  );

  return (
    <TooltipProvider delayDuration={200}>
    <div className={`theme-${mode} flex min-h-dvh w-full aurora-bg`}>
      <aside
        className={`sticky top-0 hidden h-dvh shrink-0 flex-col overflow-y-auto border-r border-border bg-[var(--background-2)] transition-[width] duration-[220ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] md:flex ${
          open ? "w-[244px]" : "w-[68px]"
        }`}
      >
        <div className={`flex items-center gap-2.5 px-4 py-4 ${open ? "" : "justify-center px-0"}`}>
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary font-display text-[13px] font-semibold text-primary-foreground">
            {current.mark}
          </div>
          {open && (
            <div className="min-w-0">
              <p className="truncate font-display text-[15px] font-semibold tracking-tight text-foreground">
                {current.brand}
              </p>
              <p className="truncate text-[11px] text-[var(--muted-2)]">{current.tagline}</p>
            </div>
          )}
        </div>

        <nav className="flex flex-col gap-0.5 px-3">
          {open && <p className="mono-label px-2.5 pb-1.5 pt-2">Criar</p>}
          {MODES.filter((m) => m.id !== "external").map((m) => (
            <NavItem
              key={m.id}
              open={open}
              active={m.id === mode && !onFixedRoute}
              label={m.brand}
              hint={open ? m.hint : undefined}
              icon={m.icon}
              onClick={() => onMode(m.id)}
              badge={
                (counts?.[m.id] ?? 0) > 0 ? (
                  <span className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {counts?.[m.id]}
                  </span>
                ) : undefined
              }
            />
          ))}
          {routeLink("/fotos", "FotoViral", Images)}
        </nav>

        <div className="mt-4 flex flex-col gap-0.5 px-3">
          {open && <p className="mono-label px-2.5 pb-1.5">Produção</p>}
          <NavItem open={open} label="Templates" icon={Library} onClick={onLibrary} />
          {routeLink("/biblioteca", "Resultados", History)}
          {routeLink("/armazenamento", "Armazenamento", HardDrive)}
          <NavItem open={open} label="Nuvem" icon={Cloud} onClick={onCloud} />
        </div>

        <div className="mt-4 flex flex-col gap-0.5 px-3">
          {open && <p className="mono-label px-2.5 pb-1.5">Distribuição</p>}
          {routeLink("/agenda", "Agenda", CalendarClock)}
          {routeLink("/perfis", "Perfis", Users)}
          {routeLink("/live", "Monitora Live", Radio)}
          {routeLink("/metricas", "Métricas", BarChart3)}
        </div>

        <div className="mt-4 flex flex-col gap-0.5 px-3">
          {open && <p className="mono-label px-2.5 pb-1.5">Workspace</p>}
          {routeLink("/integracoes", "Integrações", Settings2)}
          {isAdmin && routeLink("/admin", "Admin", Shield)}
        </div>

        <div className="mt-auto p-3">
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Recolher menu" : "Expandir menu"}
            aria-expanded={open}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground ${
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

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-[20] border-b border-border bg-[color-mix(in_srgb,var(--background)_88%,transparent)] backdrop-blur-md">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-primary md:hidden">
                <current.icon className="size-4" />
              </span>
              <GlobalActionBar className="max-w-md" />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="flex rounded-lg border border-border bg-surface p-0.5 md:hidden">
                {MODES.filter((m) => m.id !== "external").map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onMode(m.id)}
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
                  <span className="text-foreground">{plan.name}</span>
                  <span className="text-[var(--muted-2)]">·</span>
                  {plan.credits === null ? "ilimitado" : `${sub.credits} créditos`}
                </Link>
              )}
              <span className="hidden items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12px] text-muted-foreground sm:inline-flex">
                <span className="size-1.5 rounded-full bg-success" aria-hidden />
                {count} vídeo{count === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </header>

        <div className="app-main mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 sm:px-6">
          {mode === "external" || onFixedRoute ? null : (
            <section
              key={current.id}
              className="rise-in mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4"
            >
              <div className="min-w-0">
                <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
                  {current.headline}
                </h2>
                <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                  {current.description}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {current.chips.slice(0, 3).map((c) => (
                  <span
                    key={c}
                    className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-[var(--muted-2)]"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </section>
          )}

          {isAdmin ? children : <PlanGate>{children}</PlanGate>}
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}
