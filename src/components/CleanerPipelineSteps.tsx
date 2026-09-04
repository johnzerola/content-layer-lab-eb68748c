import { AlertCircle, Check, Loader2 } from "lucide-react";

export type PipelineStepState = "pending" | "active" | "done" | "error";

export interface PipelineStep {
  key: string;
  title: string;
  hint: string;
  state: PipelineStepState;
  detail?: string;
  progress?: number;
}

/**
 * Trilha visual das etapas do motor de limpeza:
 * envio → detecção → máscara → reconstrução → remux/entrega.
 * Componente puramente de apresentação.
 */
export function CleanerPipelineSteps({ steps }: { steps: PipelineStep[] }) {
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <li key={s.key} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                s.state === "done"
                  ? "border-primary bg-primary text-primary-foreground"
                  : s.state === "active"
                    ? "border-primary text-primary"
                    : s.state === "error"
                      ? "border-destructive text-destructive"
                      : "border-border/70 text-muted-foreground"
              }`}
            >
              {s.state === "done" ? (
                <Check className="size-3.5" />
              ) : s.state === "active" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : s.state === "error" ? (
                <AlertCircle className="size-3.5" />
              ) : (
                i + 1
              )}
            </span>
            {i < steps.length - 1 && (
              <span
                className={`mt-1 w-px flex-1 ${s.state === "done" ? "bg-primary/50" : "bg-border/60"}`}
              />
            )}
          </div>
          <div className="min-w-0 pb-2">
            <p
              className={`text-xs font-semibold ${
                s.state === "pending" ? "text-muted-foreground" : ""
              }`}
            >
              {s.title}
              {typeof s.progress === "number" && s.state === "active" && (
                <span className="ml-1 font-mono text-[10px] text-primary">
                  {Math.round(s.progress)}%
                </span>
              )}
            </p>
            <p className="truncate text-[10px] leading-relaxed text-muted-foreground">
              {s.detail || s.hint}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
