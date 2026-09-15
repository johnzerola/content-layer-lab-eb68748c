import { useEffect, useState } from "react";
import { Captions, Scissors, Sparkles, Wand2 } from "lucide-react";

const CLIPS = [
  { name: "corte_01", score: 96 },
  { name: "corte_02", score: 91 },
  { name: "corte_03", score: 88 },
  { name: "corte_04", score: 84 },
];

const LINES = ["a parte que", "ninguém te conta", "sobre viralizar"];

/**
 * Mockup animado do editor: preview 9:16 com legenda karaokê, timeline com
 * cortes detectados pela IA e painel de clipes gerados. Apenas visual.
 */
export function EditorMockup() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setTick((t) => t + 1), 1100);
    return () => clearInterval(id);
  }, []);

  const word = tick % LINES.length;
  const playhead = 8 + ((tick * 7) % 84);

  return (
    <div className="lp-glass lp-ring relative overflow-hidden rounded-3xl p-3 sm:p-4">
      <div className="flex items-center gap-2 px-1 pb-3">
        <span className="size-2.5 rounded-full bg-destructive/70" />
        <span className="size-2.5 rounded-full bg-warning/70" />
        <span className="size-2.5 rounded-full bg-primary/70" />
        <span className="mono-label ml-2 truncate">editor ia · podcast_ep42.mp4</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary">
          <Sparkles className="size-3" /> IA ativa
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)]">
        {/* preview 9:16 */}
        <div className="relative aspect-[9/16] overflow-hidden rounded-2xl border border-border bg-surface-2">
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(200deg, color-mix(in oklab, var(--primary) 26%, transparent), transparent 58%), repeating-linear-gradient(115deg, color-mix(in oklab, var(--foreground) 5%, transparent) 0 6px, transparent 6px 14px)",
            }}
          />
          <div className="absolute inset-x-2 top-2 flex items-center gap-1.5">
            <span className="size-5 rounded-full bg-primary/80" />
            <span className="h-1.5 w-12 rounded-full bg-foreground/30" />
          </div>
          <div className="absolute inset-x-2 bottom-3 space-y-1 text-center">
            {LINES.map((l, i) => (
              <span
                key={l}
                className={`block rounded px-1 font-display text-[11px] font-extrabold uppercase transition-colors duration-300 ${
                  i === word ? "bg-primary text-primary-foreground" : "text-foreground/75"
                }`}
              >
                {l}
              </span>
            ))}
          </div>
        </div>

        {/* painéis */}
        <div className="min-w-0 space-y-3">
          <div className="rounded-2xl border border-border bg-surface/70 p-3">
            <div className="flex items-center gap-2">
              <Scissors className="size-3.5 text-primary" />
              <span className="mono-label">cortes detectados</span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">00:42:18</span>
            </div>
            <div className="relative mt-3 h-12 overflow-hidden rounded-lg bg-surface-2">
              <div className="absolute inset-0 flex items-end gap-[3px] px-1.5 pb-1.5">
                {Array.from({ length: 42 }).map((_, i) => (
                  <span
                    key={i}
                    className="flex-1 rounded-sm bg-foreground/20"
                    style={{ height: `${18 + Math.abs(Math.sin(i * 1.7)) * 70}%` }}
                  />
                ))}
              </div>
              {[12, 38, 66].map((left) => (
                <span
                  key={left}
                  className="absolute inset-y-1 rounded-md border border-primary/45 bg-primary/15"
                  style={{ left: `${left}%`, width: "16%" }}
                />
              ))}
              <span
                className="absolute inset-y-0 w-px bg-primary shadow-[0_0_10px_var(--primary-glow)] transition-[left] duration-700 ease-linear"
                style={{ left: `${playhead}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["remover silêncio", "reenquadrar 9:16", "b-roll", "legenda"].map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface/70 p-3">
            <div className="flex items-center gap-2">
              <Wand2 className="size-3.5 text-primary" />
              <span className="mono-label">clipes gerados</span>
            </div>
            <ul className="mt-2.5 space-y-1.5">
              {CLIPS.map((c, i) => (
                <li
                  key={c.name}
                  className="flex items-center gap-2 rounded-lg border border-border/70 bg-surface px-2.5 py-1.5"
                  style={{ opacity: 1 - i * 0.14 }}
                >
                  <Captions className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono text-[11px] text-foreground/85">{c.name}.mp4</span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-primary">{c.score}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
