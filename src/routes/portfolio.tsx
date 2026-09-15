/** Portfólio: vitrine dos vídeos e projetos reais da conta, em layout editorial. */
import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Clapperboard, FolderKanban, Play, Timer } from "lucide-react";

import { RouteShell } from "@/components/RouteShell";
import { RequireAuth } from "@/components/RequireAuth";
import { CountUp } from "@/components/portfolio/CountUp";
import { listExports, listProjects, type ExportRow } from "@/lib/cloud";
import { listInstances } from "@/lib/video-template/service";

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfólio de vídeos verticais — VaiViral" },
      {
        name: "description",
        content:
          "Sua vitrine: todos os vídeos verticais exportados e projetos criados no VaiViral, com números reais de produção.",
      },
      { property: "og:title", content: "Portfólio de vídeos verticais — VaiViral" },
      {
        property: "og:description",
        content: "Vitrine dos seus cortes, templates e projetos publicados, com estatísticas reais de produção.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RouteShell>
      <RequireAuth title="Portfólio" description="Entre na sua conta para ver seu portfólio de vídeos.">
        <PortfolioPage />
      </RequireAuth>
    </RouteShell>
  ),
});

const MODE_LABEL: Record<string, string> = {
  lote: "Lote",
  clip: "Corte IA",
  external: "Importado",
  chatscene: "ChatScene",
  editor: "Editor",
  fotos: "FotoViral",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function PortfolioPage() {
  const exportsQ = useQuery({ queryKey: ["portfolio", "exports"], queryFn: () => listExports(60) });
  const projectsQ = useQuery({ queryKey: ["portfolio", "projects"], queryFn: () => listProjects(undefined, 50) });
  const instancesQ = useQuery({ queryKey: ["portfolio", "instances"], queryFn: () => listInstances() });

  const items: ExportRow[] = exportsQ.data ?? [];

  const stats = useMemo(() => {
    const totalVideos = items.length;
    const gb = items.reduce((acc, e) => acc + (e.bytes ?? 0), 0) / 1024 ** 3;
    const platforms = new Set(items.map((e) => e.platform).filter(Boolean) as string[]);
    return {
      totalVideos,
      gb,
      platforms: platforms.size,
      projects: (projectsQ.data?.length ?? 0) + (instancesQ.data?.length ?? 0),
    };
  }, [items, projectsQ.data, instancesQ.data]);

  const loading = exportsQ.isLoading || projectsQ.isLoading || instancesQ.isLoading;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6">
      {/* ── Vitrine ─────────────────────────────────────────── */}
      <section className="lp-glass lp-ring relative overflow-hidden rounded-3xl p-6 sm:p-10">
        <span aria-hidden className="auth-grid" />
        <span aria-hidden className="auth-beam auth-beam-a" />
        <span aria-hidden className="auth-beam auth-beam-b" />
        <span aria-hidden className="lp-orb absolute -right-16 -top-20 size-56 opacity-60" />

        <p className="mono-label relative text-primary">Portfólio</p>
        <h1 className="relative mt-3 max-w-2xl text-[clamp(2rem,1rem+4vw,3.6rem)] font-extrabold leading-[0.95] tracking-[-0.03em]">
          <span className="text-gradient">Tudo o que você já produziu</span>, em um só lugar.
        </h1>
        <p className="relative mt-4 max-w-xl text-sm text-muted-foreground">
          Vídeos verticais exportados, templates aplicados e projetos salvos — números reais da sua conta.
        </p>

        <div className="relative mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: Play, value: stats.totalVideos, suffix: "", decimals: 0, label: "vídeos exportados" },
            { icon: FolderKanban, value: stats.projects, suffix: "", decimals: 0, label: "projetos criados" },
            { icon: Clapperboard, value: stats.platforms, suffix: "", decimals: 0, label: "plataformas usadas" },
            { icon: Timer, value: stats.gb, suffix: " GB", decimals: 1, label: "de vídeo gerado" },
          ].map((s, i) => (
            <div key={s.label} className="lp-glass lp-hover rounded-2xl p-4">
              <s.icon className="size-4 text-primary" />
              <p className="lp-stat mt-2 font-display text-2xl font-extrabold tracking-tight">
                <CountUp value={s.value} suffix={s.suffix} decimals={s.decimals} delay={400 + i * 180} />
              </p>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Galeria ─────────────────────────────────────────── */}
      <section className="mt-10">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-lg font-bold tracking-tight">Trabalhos recentes</h2>
          <Link to="/biblioteca" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            Ver resultados <ArrowUpRight className="size-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton aspect-[9/16] rounded-xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="mt-4 rounded-xl border border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Você ainda não exportou nenhum vídeo. Gere seu primeiro corte e ele aparece aqui.
            </p>
            <Link
              to="/cortes"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Gerar cortes <ArrowUpRight className="size-4" />
            </Link>
          </div>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((e, i) => (
              <li
                key={e.id}
                className="rise-in lp-hover group relative overflow-hidden rounded-2xl border border-border bg-surface-2"
                style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}
              >
                <div className="relative aspect-[9/16] overflow-hidden">
                  {e.thumb_url ? (
                    <img
                      src={e.thumb_url}
                      alt={e.caption || e.file_name}
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                    />
                  ) : (
                    <div className="grid size-full place-items-center bg-[var(--surface-2)] text-muted-foreground">
                      <Play className="size-6" />
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                    <p className="line-clamp-2 text-[12px] font-medium text-white">{e.caption || e.file_name}</p>
                  </div>
                  <span className="absolute left-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 font-mono text-[10px] uppercase text-white backdrop-blur">
                    {MODE_LABEL[e.mode] ?? e.mode}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-2 text-[11px] text-muted-foreground">
                  <span className="truncate">{e.platform ?? "—"}</span>
                  <span className="shrink-0">{fmtDate(e.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Projetos ────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="text-lg font-bold tracking-tight">Projetos salvos</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {(projectsQ.data ?? []).slice(0, 8).map((p) => (
            <li key={p.id} className="lp-glass lp-hover flex items-center justify-between gap-3 rounded-2xl p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{p.name}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {MODE_LABEL[p.mode] ?? p.mode} · {fmtDate(p.updated_at)}
                </p>
              </div>
              <Link to="/projetos" className="shrink-0 text-muted-foreground hover:text-foreground" aria-label={`Abrir ${p.name}`}>
                <ArrowUpRight className="size-4" />
              </Link>
            </li>
          ))}
          {(projectsQ.data ?? []).length === 0 && (
            <li className="rounded-xl border border-border p-6 text-sm text-muted-foreground">
              Nenhum projeto salvo ainda.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
