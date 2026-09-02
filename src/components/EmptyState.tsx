import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";

export interface EmptyStep {
  icon: LucideIcon;
  title: string;
  text: string;
}

/**
 * Estado vazio ilustrado que ensina o fluxo em passos, no lugar de uma frase solta.
 */
export function EmptyState({
  title,
  subtitle,
  steps,
  action,
  icon: Icon = Sparkles,
}: {
  title: string;
  subtitle: string;
  steps: EmptyStep[];
  action?: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="rise-in relative overflow-hidden rounded-2xl border border-dashed border-border/70 bg-surface/40 p-6 text-center sm:p-8">
      {/* ilustração de fundo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-56 w-56 rounded-full bg-primary/25 blur-3xl sm:h-72 sm:w-72"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 right-0 h-48 w-48 rounded-full bg-[var(--accent,theme(colors.primary))]/15 blur-3xl"
      />

      <div className="relative">
        <span
          aria-hidden
          className="pop-in mx-auto mb-4 grid size-14 place-items-center rounded-2xl border border-primary/30 bg-primary/12 text-primary shadow-[0_0_0_6px_color-mix(in_srgb,var(--primary)_8%,transparent)]"
        >
          <Icon className="size-6" />
        </span>
        <h3 className="font-display text-lg font-bold tracking-tight text-foreground">{title}</h3>
        <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
          {subtitle}
        </p>

        <ol className="mx-auto mt-6 grid max-w-3xl gap-3 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li
              key={s.title}
              className="interactive rise-in rounded-xl border border-border bg-surface-2/60 p-4 text-left"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center gap-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-primary/40 bg-primary/12 text-primary">
                  <s.icon className="size-4" />
                </span>
                <span className="mono-label">passo {i + 1}</span>
              </div>
              <p className="mt-2 text-sm font-medium text-foreground">{s.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>

        {action && <div className="mt-6 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}
