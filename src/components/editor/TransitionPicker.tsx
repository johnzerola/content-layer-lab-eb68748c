import { TRANSITIONS, type Transition, type TransitionKind } from "@/lib/preedit";
import { useState } from "react";
import { cn } from "@/lib/utils";

const DURATIONS: { value: number; label: string }[] = [
  { value: 0.2, label: "Rápida" },
  { value: 0.4, label: "Média" },
  { value: 0.8, label: "Suave" },
];

/** Keyframe em loop de cada transição na galeria (ver styles.css). */
const PREVIEW_ANIM: Record<string, string> = {
  none: "none",
  fade: "tp-fade",
  flash: "tp-flash",
  zoom: "tp-zoom",
  "zoom-out": "tp-zoomout",
  punch: "tp-punch",
  "slide-up": "tp-up",
  "slide-down": "tp-down",
  "slide-left": "tp-left",
  "slide-right": "tp-right",
  whip: "tp-whip",
  "whip-vertical": "tp-whipv",
  drift: "tp-drift",
  swing: "tp-swing",
};

const CATEGORIES: { id: string; label: string; kinds: string[] }[] = [
  { id: "todas", label: "Todas", kinds: [] },
  { id: "basico", label: "Básicas", kinds: ["none", "fade", "flash"] },
  { id: "camera", label: "Câmera", kinds: ["zoom", "zoom-out", "punch", "whip", "whip-vertical"] },
  { id: "deslize", label: "Deslize", kinds: ["slide-up", "slide-down", "slide-left", "slide-right"] },
  { id: "criativo", label: "Criativas", kinds: ["drift", "swing"] },
];

interface Props {
  value: Transition;
  onChange: (t: Transition) => void;
  /** rótulo curto acima da galeria */
  label?: string;
  /** aplica esta transição em todos os cortes */
  onApplyAll?: (() => void) | undefined;
  /** reproduz a transição no palco/canvas de prévia */
  onPreview?: (() => void) | undefined;
}

/** Galeria de transições prontas com duração ajustável e prévia. */
export function TransitionPicker({ value, onChange, label, onApplyAll, onPreview }: Props) {
  const [category, setCategory] = useState("todas");
  const cat = CATEGORIES.find((c) => c.id === category);
  const visible = !cat || !cat.kinds.length ? TRANSITIONS : TRANSITIONS.filter((t) => cat.kinds.includes(t.id));
  return (
    <div className="space-y-2">
      {label && <span className="font-mono text-[11px] text-muted-foreground">{label}</span>}
      <div className="flex flex-wrap gap-1">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            aria-pressed={category === c.id}
            className={cn(
              "rounded-full border px-2 py-0.5 font-mono text-[10px] transition",
              category === c.id
                ? "border-primary text-primary"
                : "border-border text-muted-foreground hover:border-primary/50",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {visible.map((tr) => {
          const active = value.kind === tr.id;
          return (
            <button
              key={tr.id}
              type="button"
              onClick={() => onChange({ ...value, kind: tr.id as TransitionKind })}
              aria-pressed={active}
              title={`Transição ${tr.label} — passe o mouse para ver a prévia`}
              className={cn(
                "group flex flex-col items-center gap-1 rounded-lg border px-2 py-2 transition",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50",
              )}
            >
              <span className="relative block h-9 w-full overflow-hidden rounded bg-surface-2">
                <span className="absolute inset-0 bg-gradient-to-br from-foreground/15 to-foreground/5" />
                <span
                  className={cn(
                    "tp-anim absolute inset-0 bg-gradient-to-br from-primary/70 to-primary/25",
                    active && "is-playing",
                  )}
                  style={{ ["--tp-anim" as string]: PREVIEW_ANIM[tr.id] ?? "tp-fade" }}
                />
              </span>
              <span className="font-mono text-[10px] leading-none">{tr.label}</span>
            </button>
          );
        })}
      </div>

      {value.kind !== "none" && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {DURATIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => onChange({ ...value, dur: d.value })}
                className={cn(
                  "rounded-md border px-2 py-1 font-mono text-[10px] transition",
                  Math.abs(value.dur - d.value) < 0.01
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground hover:border-primary/50",
                )}
              >
                {d.label} · {d.value.toFixed(1)}s
              </button>
            ))}
            {onApplyAll && (
              <button
                type="button"
                onClick={onApplyAll}
                className="ml-auto rounded-md border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground transition hover:border-primary/50 hover:text-primary"
              >
                Aplicar em todos
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0.1}
              max={2}
              step={0.05}
              value={value.dur}
              onChange={(e) => onChange({ ...value, dur: Number(e.target.value) })}
              aria-label="Duração da transição em segundos"
              className="min-w-0 flex-1"
            />
            <span className="w-12 shrink-0 font-mono text-[10px] text-muted-foreground">
              {value.dur.toFixed(2)}s
            </span>
            {onPreview && (
              <button
                type="button"
                onClick={onPreview}
                className="rounded-md border border-primary/50 px-2 py-1 font-mono text-[10px] text-primary transition hover:bg-primary/10"
              >
                Prévia
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
