import { Link } from "@tanstack/react-router";
import { Loader2, Pause, Play, X } from "lucide-react";
import { cancelBatch, pauseBatch, useBatchProgress } from "@/lib/batch-runtime";

/** Indicador global do lote: continua visível em qualquer tela enquanto processa. */
export function BatchProgressDock() {
  const p = useBatchProgress();
  if (!p.running) return null;

  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 rounded-xl border border-border bg-surface-2/95 p-3 shadow-lg backdrop-blur">
      <div className="flex items-center gap-2">
        {p.paused ? (
          <Pause className="size-4 text-primary" />
        ) : (
          <Loader2 className="size-4 animate-spin text-primary" />
        )}
        <span className="font-mono text-[11px]">
          {p.label ?? "Processando"} · {p.done}/{p.total} ({pct}%)
          {p.paused ? " · pausado" : ""}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => pauseBatch()}
            className="rounded-md border border-border p-1 hover:border-primary hover:text-primary"
            aria-label={p.paused ? "retomar lote" : "pausar lote"}
          >
            {p.paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          </button>
          <button
            onClick={() => cancelBatch()}
            className="rounded-md border border-border p-1 hover:border-destructive hover:text-destructive"
            aria-label="cancelar lote"
          >
            <X className="size-3.5" />
          </button>
          <Link
            to="/"
            className="rounded-md border border-border px-2 py-1 font-mono text-[10px] hover:border-primary hover:text-primary"
          >
            ver lote
          </Link>
        </div>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-border">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
