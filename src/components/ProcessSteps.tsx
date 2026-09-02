import { Upload, SlidersHorizontal, Cpu, Download, CalendarClock } from "lucide-react";

export interface ProcessStep {
  id: string;
  label: string;
  hint: string;
  icon: typeof Upload;
}

export const DEFAULT_STEPS: ProcessStep[] = [
  { id: "importar", label: "Importar", hint: "arquivos ou links", icon: Upload },
  { id: "ajustar", label: "Ajustar", hint: "template e estilo", icon: SlidersHorizontal },
  { id: "processar", label: "Processar", hint: "lote em fila", icon: Cpu },
  { id: "baixar", label: "Baixar", hint: "ZIP por plataforma", icon: Download },
  { id: "publicar", label: "Publicar", hint: "agenda e perfis", icon: CalendarClock },
];

/**
 * Trilha de passos do processo — puramente informativa (não muda lógica).
 * `current` marca qual passo está ativo; os anteriores aparecem como concluídos.
 */
export function ProcessSteps({
  current = 0,
  steps = DEFAULT_STEPS,
  className = "",
}: {
  current?: number;
  steps?: ProcessStep[];
  className?: string;
}) {
  return (
    <nav
      aria-label="Etapas do processo"
      className={`no-scrollbar -mx-1 flex snap-x items-stretch gap-1.5 overflow-x-auto px-1 ${className}`}
    >
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div
            key={s.id}
            aria-current={active ? "step" : undefined}
            className={`snap-start flex min-w-[130px] flex-1 items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors duration-200 ${
              active
                ? "border-primary/50 bg-primary/10"
                : done
                  ? "border-border bg-surface-2/70"
                  : "border-border/70 bg-surface/40"
            }`}
          >
            <span
              aria-hidden
              className={`grid size-7 shrink-0 place-items-center rounded-lg text-[12px] font-semibold ${
                active
                  ? "bg-primary text-primary-foreground"
                  : done
                    ? "bg-surface-3 text-foreground"
                    : "bg-surface-2 text-[var(--muted-2)]"
              }`}
            >
              <s.icon className="size-3.5" />
            </span>
            <span className="min-w-0">
              <span
                className={`block truncate text-[12.5px] font-medium leading-tight ${
                  active ? "text-foreground" : done ? "text-foreground/90" : "text-muted-foreground"
                }`}
              >
                {i + 1}. {s.label}
              </span>
              <span className="block truncate text-[11px] leading-tight text-[var(--muted-2)]">
                {s.hint}
              </span>
            </span>
          </div>
        );
      })}
    </nav>
  );
}
