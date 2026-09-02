import { TRANSITIONS, type Transition, type TransitionKind } from "@/lib/preedit";
import { cn } from "@/lib/utils";

const DURATIONS: { value: number; label: string }[] = [
  { value: 0.2, label: "Rápida" },
  { value: 0.4, label: "Média" },
  { value: 0.8, label: "Suave" },
];

/** Classe de prévia (hover) de cada transição na galeria. */
const PREVIEW_CLASS: Record<string, string> = {
  none: "opacity-40",
  fade: "opacity-30 group-hover:opacity-100",
  zoom: "scale-75 group-hover:scale-100",
  "zoom-out": "scale-125 group-hover:scale-100",
  "slide-up": "translate-y-3 group-hover:translate-y-0",
  "slide-down": "-translate-y-3 group-hover:translate-y-0",
  "slide-left": "-translate-x-3 group-hover:translate-x-0",
  "slide-right": "translate-x-3 group-hover:translate-x-0",
  whip: "translate-x-4 blur-[2px] group-hover:translate-x-0 group-hover:blur-0",
  "whip-vertical": "translate-y-4 blur-[2px] group-hover:translate-y-0 group-hover:blur-0",
  punch: "scale-90 group-hover:scale-110",
  drift: "translate-x-2 translate-y-1 opacity-60 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100",
  swing: "-rotate-6 group-hover:rotate-0",
  flash: "opacity-10 group-hover:opacity-100",
};

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
  return (
    <div className="space-y-2">
      {label && <span className="font-mono text-[11px] text-muted-foreground">{label}</span>}
      <div className="grid grid-cols-3 gap-1.5">
        {TRANSITIONS.map((tr) => {
          const active = value.kind === tr.id;
          return (
            <button
              key={tr.id}
              type="button"
              onClick={() => onChange({ ...value, kind: tr.id as TransitionKind })}
              aria-pressed={active}
              className={cn(
                "group flex flex-col items-center gap-1 rounded-lg border px-2 py-2 transition",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50",
              )}
            >
              <span className="relative h-6 w-full overflow-hidden rounded bg-surface-2">
                <span
                  className={cn(
                    "absolute inset-0 bg-primary/40 transition-all duration-500 group-hover:duration-300",
                    PREVIEW_CLASS[tr.id] ?? "opacity-60",
                  )}
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
