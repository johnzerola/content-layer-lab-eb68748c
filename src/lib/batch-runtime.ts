import { externalState, useExternalState } from "./external-state";
import { notifySystem } from "./keepalive";

/** Progresso global do lote — visível em qualquer tela, mesmo saindo do painel. */
export interface BatchProgress {
  running: boolean;
  paused: boolean;
  done: number;
  total: number;
  label: string | null;
  /** progresso (0-1) do vídeo em render agora */
  itemProgress: number;
  /** nome do vídeo em render agora */
  itemLabel: string | null;
  /** quantos falharam até agora */
  errors: number;
  /** performance.now() de quando o lote começou */
  startedAt: number;
}

const EMPTY: BatchProgress = {
  running: false,
  paused: false,
  done: 0,
  total: 0,
  label: null,
  itemProgress: 0,
  itemLabel: null,
  errors: 0,
  startedAt: 0,
};

export const batchProgress = externalState<BatchProgress>(EMPTY);

interface Controls {
  pause: (() => void) | undefined;
  cancel: (() => void) | undefined;
}
const controls: Controls = { pause: undefined, cancel: undefined };

export function registerBatchControls(c: { pause?: () => void; cancel?: () => void }) {
  controls.pause = c.pause;
  controls.cancel = c.cancel;
}


export function pauseBatch() {
  controls.pause?.();
}
export function cancelBatch() {
  controls.cancel?.();
}

export function startBatchProgress(total: number, label?: string) {
  batchProgress.set({
    ...EMPTY,
    running: true,
    total,
    label: label ?? null,
    startedAt: typeof performance !== "undefined" ? performance.now() : Date.now(),
  });
}
export function updateBatchProgress(patch: Partial<BatchProgress>) {
  batchProgress.set((p) => ({ ...p, ...patch }));
}
export function endBatchProgress() {
  batchProgress.set(EMPTY);
}

/** Estatísticas derivadas: velocidade e tempo restante estimado. */
export function batchStats(p: BatchProgress) {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const elapsed = p.startedAt ? Math.max(0.001, (now - p.startedAt) / 1000) : 0;
  const progressed = p.done + Math.min(0.999, p.itemProgress);
  const perMin = elapsed > 3 && progressed > 0 ? (progressed / elapsed) * 60 : 0;
  const remaining = Math.max(0, p.total - progressed);
  const eta = perMin > 0 ? Math.round((remaining / perMin) * 60) : null;
  return { elapsed, perMin, eta };
}

export function formatEta(seconds: number | null) {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return `${m}m${s ? ` ${s}s` : ""}`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Aviso de conclusão mesmo com a aba em segundo plano. */
export function notifyBatchDone(ok: number, fail: number) {
  const body = fail
    ? `${ok} vídeo(s) prontos · ${fail} com erro. Abra a Biblioteca para baixar.`
    : `${ok} vídeo(s) prontos. Abra a Biblioteca para baixar.`;
  notifySystem("Lote concluído — VaiViral", body);
}

export function useBatchProgress() {
  const [p] = useExternalState(batchProgress);
  return p;
}
