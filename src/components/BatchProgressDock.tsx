import { Link } from "@tanstack/react-router";
import { AlertTriangle, Loader2, Pause, Play, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  batchStats,
  cancelBatch,
  formatEta,
  formatSpeed,
  pauseBatch,
  useBatchProgress,
} from "@/lib/batch-runtime";


/** Indicador global do lote: continua visível em qualquer tela enquanto processa. */
export function BatchProgressDock() {
  const p = useBatchProgress();
  const [, tick] = useState(0);

  // ETA e velocidade precisam recalcular mesmo sem novos eventos do lote
  useEffect(() => {
    if (!p.running) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [p.running]);

  // avisa antes de fechar a aba com lote em andamento
  useEffect(() => {
    if (!p.running) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [p.running]);

  if (!p.running) return null;

  const progressed = p.done + Math.min(0.999, p.itemProgress);
  const pct = p.total ? Math.round((progressed / p.total) * 100) : 0;
  const { perMin, eta } = batchStats(p);

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,460px)] -translate-x-1/2 rounded-xl border border-border bg-surface-2/95 p-3 shadow-lg backdrop-blur">
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
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-muted-foreground">
        <span>restam ~{p.paused ? "—" : formatEta(eta)}</span>
        <span>{perMin > 0 ? `${perMin.toFixed(1)} vídeos/min` : "medindo…"}</span>
        {p.itemLabel && <span className="truncate max-w-[45%]">{p.itemLabel}</span>}
        {p.errors > 0 && (
          <span className="flex items-center gap-1 text-destructive">
            <AlertTriangle className="size-3" /> {p.errors} com erro
          </span>
        )}
        <span className="ml-auto">pode minimizar — continua rodando</span>
      </div>
    </div>
  );
}
