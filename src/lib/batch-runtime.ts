import { externalState, useExternalState } from "./external-state";

/** Progresso global do lote — visível em qualquer tela, mesmo saindo do painel. */
export interface BatchProgress {
  running: boolean;
  paused: boolean;
  done: number;
  total: number;
  label: string | null;
}

const EMPTY: BatchProgress = { running: false, paused: false, done: 0, total: 0, label: null };

export const batchProgress = externalState<BatchProgress>(EMPTY);

interface Controls {
  pause?: () => void;
  cancel?: () => void;
}
const controls: Controls = {};

export function registerBatchControls(c: Controls) {
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
  batchProgress.set({ running: true, paused: false, done: 0, total, label: label ?? null });
}
export function updateBatchProgress(patch: Partial<BatchProgress>) {
  batchProgress.set((p) => ({ ...p, ...patch }));
}
export function endBatchProgress() {
  batchProgress.set(EMPTY);
}

export function useBatchProgress() {
  const [p] = useExternalState(batchProgress);
  return p;
}
