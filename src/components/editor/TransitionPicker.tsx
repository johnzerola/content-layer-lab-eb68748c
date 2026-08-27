import { TRANSITIONS, type Transition, type TransitionKind } from "@/lib/preedit";
import { cn } from "@/lib/utils";

const DURATIONS: { value: number; label: string }[] = [
  { value: 0.2, label: "Rápida" },
  { value: 0.4, label: "Média" },
  { value: 0.8, label: "Suave" },
];

interface Props {
  value: Transition;
  onChange: (t: Transition) => void;
  /** rótulo curto acima da galeria */
  label?: string;
  /** aplica esta transição em todos os cortes */
  onApplyAll?: (() => void) | undefined;
}

/** Galeria de transições prontas com duração em um clique. */
export function TransitionPicker({ value, onChange, label, onApplyAll }: Props) {
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
                    "absolute inset-0 bg-primary/40 transition-transform duration-500 group-hover:duration-300",
                    tr.id === "none" && "opacity-40",
                    tr.id === "fade" && "opacity-40 group-hover:opacity-100",
                    tr.id === "zoom" && "scale-75 group-hover:scale-100",
                    tr.id === "slide-up" && "translate-y-3 group-hover:translate-y-0",
                    tr.id === "slide-left" && "-translate-x-3 group-hover:translate-x-0",
                    tr.id === "whip" && "translate-x-4 blur-[2px] group-hover:translate-x-0 group-hover:blur-0",
                  )}
                />
              </span>
              <span className="font-mono text-[10px] leading-none">{tr.label}</span>
            </button>
          );
        })}
      </div>

      {value.kind !== "none" && (
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
      )}
    </div>
  );
}
