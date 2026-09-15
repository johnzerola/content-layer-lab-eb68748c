import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Captions,
  Check,
  Download,
  Layers,
  Pause,
  Play,
  Scissors,
  Sparkles,
  Volume2,
} from "lucide-react";

import { LandingShell } from "@/components/landing/LandingShell";
import { Reveal } from "@/components/landing/Reveal";

export const Route = createFileRoute("/editor-demo")({
  component: EditorDemoPage,
  head: () => ({
    meta: [
      { title: "Editor de vídeo com IA — demonstração | VaiViral" },
      {
        name: "description",
        content:
          "Veja o editor do VaiViral funcionando: timeline com cortes detectados pela IA, legendas sincronizadas, preview 9:16 e exportação em MP4.",
      },
      { property: "og:title", content: "Editor de vídeo com IA — demonstração | VaiViral" },
      {
        property: "og:description",
        content: "Timeline, cortes automáticos, legendas e exportação vertical em uma tela só.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type Cut = { id: string; name: string; start: number; end: number; score: number; hook: string };

const DURATION = 180; // segundos do vídeo de exemplo

const CUTS: Cut[] = [
  { id: "c1", name: "corte_01", start: 8, end: 46, score: 96, hook: "a parte que ninguém te conta" },
  { id: "c2", name: "corte_02", start: 52, end: 88, score: 91, hook: "o erro que custa seguidores" },
  { id: "c3", name: "corte_03", start: 96, end: 132, score: 88, hook: "faça isso nos 3 primeiros segundos" },
  { id: "c4", name: "corte_04", start: 140, end: 174, score: 84, hook: "o algoritmo não é o vilão" },
];

const WAVE = Array.from({ length: 96 }, (_, i) =>
  Math.round(16 + Math.abs(Math.sin(i * 0.7) * 0.6 + Math.sin(i * 0.23) * 0.4) * 78),
);

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function EditorDemoPage() {
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(10);
  const [activeId, setActiveId] = useState(CUTS[0]!.id);
  const [captions, setCaptions] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const raf = useRef<number | null>(null);

  const active = useMemo(() => CUTS.find((c) => c.id === activeId) ?? CUTS[0]!, [activeId]);

  // playhead
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTime((t) => (t + dt * 4 > DURATION ? 0 : t + dt * 4));
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing]);

  // exportação simulada
  useEffect(() => {
    if (!exporting) return;
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(id);
          setExporting(false);
          setDone(true);
          return 100;
        }
        return p + 4;
      });
    }, 90);
    return () => clearInterval(id);
  }, [exporting]);

  const words = active.hook.split(" ");
  const wordIndex = Math.floor(time * 2) % words.length;

  return (
    <LandingShell>
      {/* hero */}
      <section className="mx-auto max-w-6xl px-5 pb-8 pt-14 md:pt-20">
        <Reveal className="text-center">
          <span className="lp-glass mono-label inline-flex items-center gap-2 rounded-full px-3 py-1.5">
            <span className="auth-live size-1.5 rounded-full bg-primary" />
            demonstração interativa
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl font-display text-[clamp(2.2rem,4.6vw,3.6rem)] font-extrabold leading-[1.02] tracking-[-0.035em]">
            O editor por dentro:{" "}
            <span className="bg-[image:var(--gradient-primary)] bg-clip-text text-transparent">
              timeline, cortes e exportação
            </span>
            .
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            Toque na timeline, troque de corte, ligue as legendas e exporte. É a mesma tela que você usa com os
            seus vídeos.
          </p>
        </Reveal>
      </section>

      {/* editor */}
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <Reveal>
          <div className="lp-glass lp-ring overflow-hidden rounded-3xl p-3 sm:p-5">
            {/* barra superior */}
            <div className="flex flex-wrap items-center gap-2 px-1 pb-4">
              <span className="size-2.5 rounded-full bg-destructive/70" />
              <span className="size-2.5 rounded-full bg-warn/70" />
              <span className="size-2.5 rounded-full bg-primary/70" />
              <span className="mono-label ml-2 truncate">editor · podcast_ep42.mp4</span>
              <span className="ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary">
                <Sparkles className="size-3" /> IA ativa
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
              {/* preview 9:16 */}
              <div className="lp-scene">
                <div className="lp-rotate">
                  <div className="relative mx-auto aspect-[9/16] w-44 overflow-hidden rounded-2xl border border-border bg-surface-2 lg:w-full">
                    <div
                      className="absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(200deg, color-mix(in oklab, var(--primary) 26%, transparent), transparent 58%), repeating-linear-gradient(115deg, color-mix(in oklab, var(--foreground) 5%, transparent) 0 6px, transparent 6px 14px)",
                      }}
                    />
                    <div className="absolute inset-x-3 top-3 flex items-center gap-2">
                      <span className="size-6 rounded-full bg-primary/80" />
                      <span className="h-1.5 w-14 rounded-full bg-foreground/30" />
                    </div>
                    {captions ? (
                      <div className="absolute inset-x-3 bottom-4 flex flex-wrap justify-center gap-1">
                        {words.map((w, i) => (
                          <span
                            key={`${w}-${i}`}
                            className={`rounded px-1 font-display text-[12px] font-extrabold uppercase transition-colors duration-200 ${
                              i === wordIndex ? "bg-primary text-primary-foreground" : "text-foreground/80"
                            }`}
                          >
                            {w}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <span className="absolute bottom-1.5 right-2 font-mono text-[10px] text-foreground/60">
                      1080×1920
                    </span>
                  </div>
                </div>
              </div>

              {/* painel direito */}
              <div className="min-w-0 space-y-4">
                {/* transporte */}
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface/70 p-3">
                  <button
                    onClick={() => setPlaying((p) => !p)}
                    aria-label={playing ? "Pausar" : "Reproduzir"}
                    className="lp-cta-glow grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"
                  >
                    {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                  </button>
                  <span className="font-mono text-xs text-muted-foreground">
                    {fmt(time)} / {fmt(DURATION)}
                  </span>
                  <button
                    onClick={() => setCaptions((c) => !c)}
                    aria-pressed={captions}
                    className={`ml-auto inline-flex min-h-9 items-center gap-2 rounded-xl border px-3 text-xs font-medium transition-colors ${
                      captions
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Captions className="size-3.5" /> Legendas
                  </button>
                  <span className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs text-muted-foreground">
                    <Volume2 className="size-3.5" /> Áudio normalizado
                  </span>
                </div>

                {/* timeline */}
                <div className="rounded-2xl border border-border bg-surface/70 p-3">
                  <div className="flex items-center gap-2">
                    <Scissors className="size-3.5 text-primary" />
                    <span className="mono-label">timeline · cortes detectados</span>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">{CUTS.length} clipes</span>
                  </div>

                  <div
                    role="slider"
                    tabIndex={0}
                    aria-label="Posição na timeline"
                    aria-valuemin={0}
                    aria-valuemax={DURATION}
                    aria-valuenow={Math.round(time)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowRight") setTime((t) => Math.min(DURATION, t + 5));
                      if (e.key === "ArrowLeft") setTime((t) => Math.max(0, t - 5));
                    }}
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      const p = (e.clientX - r.left) / r.width;
                      setTime(Math.max(0, Math.min(DURATION, p * DURATION)));
                    }}
                    className="relative mt-3 h-20 cursor-pointer overflow-hidden rounded-xl bg-surface-2 outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <div className="absolute inset-0 flex items-end gap-[2px] px-2 pb-2">
                      {WAVE.map((h, i) => (
                        <span key={i} className="flex-1 rounded-sm bg-foreground/20" style={{ height: `${h}%` }} />
                      ))}
                    </div>
                    {CUTS.map((c) => (
                      <button
                        key={c.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveId(c.id);
                          setTime(c.start);
                        }}
                        aria-label={`Selecionar ${c.name}`}
                        className={`absolute inset-y-2 rounded-lg border transition-colors ${
                          c.id === activeId
                            ? "border-primary bg-primary/25"
                            : "border-primary/35 bg-primary/10 hover:bg-primary/20"
                        }`}
                        style={{
                          left: `${(c.start / DURATION) * 100}%`,
                          width: `${((c.end - c.start) / DURATION) * 100}%`,
                        }}
                      >
                        <span className="pointer-events-none absolute left-1.5 top-1 font-mono text-[9px] text-primary">
                          {c.score}
                        </span>
                      </button>
                    ))}
                    <span
                      className="pointer-events-none absolute inset-y-0 w-px bg-primary shadow-[0_0_10px_var(--primary-glow)]"
                      style={{ left: `${(time / DURATION) * 100}%` }}
                    />
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {["remover silêncio", "reenquadrar 9:16", "b-roll", "legenda karaokê", "branding"].map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                {/* clipes + exportação */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-surface/70 p-3">
                    <div className="flex items-center gap-2">
                      <Layers className="size-3.5 text-primary" />
                      <span className="mono-label">clipes gerados</span>
                    </div>
                    <ul className="mt-2.5 space-y-1.5">
                      {CUTS.map((c) => (
                        <li key={c.id}>
                          <button
                            onClick={() => {
                              setActiveId(c.id);
                              setTime(c.start);
                            }}
                            aria-pressed={c.id === activeId}
                            className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                              c.id === activeId
                                ? "border-primary/45 bg-primary/10"
                                : "border-border/70 bg-surface hover:border-primary/30"
                            }`}
                          >
                            <span className="truncate font-mono text-[11px] text-foreground/85">{c.name}.mp4</span>
                            <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                              {fmt(c.end - c.start)}
                            </span>
                            <span className="shrink-0 font-mono text-[10px] text-primary">{c.score}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex flex-col rounded-2xl border border-border bg-surface/70 p-3">
                    <div className="flex items-center gap-2">
                      <Download className="size-3.5 text-primary" />
                      <span className="mono-label">exportar</span>
                    </div>
                    <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                      {active.name}.mp4 · 1080×1920 · H.264 · legendas {captions ? "queimadas" : "desativadas"}
                    </p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-[image:var(--gradient-primary)] transition-[width] duration-150"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <button
                      onClick={() => {
                        setDone(false);
                        setProgress(0);
                        setExporting(true);
                      }}
                      disabled={exporting}
                      className="lp-cta-glow mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-px disabled:opacity-70"
                    >
                      {exporting ? `Exportando ${progress}%` : done ? "Exportar de novo" : "Exportar clipe"}
                    </button>
                    {done ? (
                      <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-primary">
                        <Check className="size-3.5" /> Pronto — na sua conta o arquivo é baixado aqui.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-5 pb-24">
        <Reveal>
          <div className="lp-glass lp-ring relative overflow-hidden rounded-3xl px-6 py-14 text-center md:px-16 md:py-20">
            <span aria-hidden className="lp-orb absolute -left-16 -top-16 size-56 opacity-60" />
            <span aria-hidden className="lp-orb absolute -bottom-20 -right-10 size-48 opacity-50" />
            <div className="relative">
              <span className="lp-float lp-chip3d lp-spin3d mx-auto !size-16 !rounded-2xl">
                <Scissors />
              </span>
              <h2 className="mx-auto mt-6 max-w-2xl font-display text-3xl font-extrabold tracking-[-0.03em] md:text-[2.6rem] md:leading-[1.06]">
                Agora faça isso com o seu vídeo.
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-[15px]">
                Entre na sua conta, envie o arquivo ou o link e receba os cortes prontos com legenda e enquadramento.
              </p>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Link
                  to="/checkout"
                  search={{ plano: "creator" }}
                  className="lp-cta-glow inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-7 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
                >
                  Entrar e começar <ArrowRight className="size-4" />
                </Link>
                <Link
                  to="/planos"
                  className="lp-glass lp-hover inline-flex h-12 items-center rounded-xl px-6 text-sm font-medium"
                >
                  Ver planos e preços
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </LandingShell>
  );
}
