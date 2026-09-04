import { externalState, useExternalState } from "./external-state";
import { notifySystem } from "./keepalive";

/** Progresso global do lote — visível em qualquer tela, mesmo saindo do painel. */
export interface BatchProgress {
  running: boolean;
  paused: boolean;
  done: number;
  total: number;
  label: string | null;
  /** progresso (0-1) do vídeo em render agora (inclui preparo e finalização) */
  itemProgress: number;
  /** nome do vídeo em render agora */
  itemLabel: string | null;
  /** fase atual em linguagem simples (ex.: "lendo áudio") */
  phase: string | null;
  /** quadros por segundo medidos no item atual (0 = ainda medindo) */
  itemFps: number;
  /** caminho de exportação em uso (worker, turbo, gravação em tempo real…) */
  path: string | null;
  /** performance.now() de quando a codificação do item começou */
  renderStartedAt: number;
  /** quantos falharam até agora */
  errors: number;
  /** performance.now() de quando o lote começou */
  startedAt: number;
  /** performance.now() de quando o item atual começou */
  itemStartedAt: number;
  /** durações (ms) dos itens já concluídos — base honesta para o ETA */
  itemDurations: number[];
}

/** Pesos das fases de cada vídeo: preparo, render e finalização. */
export const PHASE_WEIGHTS = { prep: 0.15, render: 0.8, finish: 0.05 } as const;

/** Converte o progresso do render (0-1) para a escala do item inteiro. */
export function renderScale(p: number) {
  return PHASE_WEIGHTS.prep + Math.max(0, Math.min(1, p)) * PHASE_WEIGHTS.render;
}
/** Converte o progresso do preparo (0-1) para a escala do item inteiro. */
export function prepScale(p: number) {
  return Math.max(0, Math.min(1, p)) * PHASE_WEIGHTS.prep;
}

const EMPTY: BatchProgress = {
  running: false,
  paused: false,
  done: 0,
  total: 0,
  label: null,
  itemProgress: 0,
  itemLabel: null,
  phase: null,
  itemFps: 0,
  path: null,
  renderStartedAt: 0,
  errors: 0,
  startedAt: 0,
  itemStartedAt: 0,
  itemDurations: [],
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

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export function startBatchProgress(total: number, label?: string) {
  batchProgress.set({
    ...EMPTY,
    itemDurations: [],
    running: true,
    total,
    label: label ?? null,
    startedAt: now(),
  });
}
export function updateBatchProgress(patch: Partial<BatchProgress>) {
  batchProgress.set((p) => ({ ...p, ...patch }));
}

/** Marca o início do trabalho de um vídeo (reinicia fase, fps e cronômetro). */
export function startBatchItem(label: string, phase = "preparando") {
  batchProgress.set((p) => ({
    ...p,
    itemLabel: label,
    itemProgress: 0,
    itemFps: 0,
    path: null,
    renderStartedAt: 0,
    phase,
    itemStartedAt: now(),
  }));
}

/** Atualiza somente a fase textual do item atual. */
/** Marca o caminho de exportação escolhido (worker/turbo/gravação). */
export function setBatchPath(path: string) {
  batchProgress.set((p) => (p.path === path ? p : { ...p, path }));
}

/** Marca o instante em que a codificação começou (base do ETA). */
export function markRenderStart() {
  batchProgress.set((p) => (p.renderStartedAt ? p : { ...p, renderStartedAt: now() }));
}

export function setBatchPhase(phase: string, itemProgress?: number) {
  batchProgress.set((p) => ({
    ...p,
    phase,
    ...(typeof itemProgress === "number" ? { itemProgress } : {}),
  }));
}

/** Item concluído: guarda a duração real para o ETA das próximas iterações. */
export function finishBatchItem(done: number) {
  batchProgress.set((p) => {
    const spent = p.itemStartedAt ? now() - p.itemStartedAt : 0;
    return {
      ...p,
      done,
      itemProgress: 0,
      itemLabel: null,
      phase: null,
      itemFps: 0,
      path: null,
      renderStartedAt: 0,
      itemStartedAt: 0,
      itemDurations: spent > 500 ? [...p.itemDurations, spent].slice(-20) : p.itemDurations,
    };
  });
}

export function endBatchProgress() {
  batchProgress.set(EMPTY);
}

/**
 * Estatísticas derivadas. O ETA vem da duração real dos vídeos já concluídos;
 * enquanto não houver amostra suficiente, devolvemos `measuring` para a
 * interface dizer "calculando…" em vez de exibir um número inventado.
 */
export function batchStats(p: BatchProgress) {
  const t = now();
  const elapsed = p.startedAt ? Math.max(0.001, (t - p.startedAt) / 1000) : 0;
  const progressed = p.done + Math.min(0.999, p.itemProgress);
  const remaining = Math.max(0, p.total - progressed);

  // média das durações reais (peso maior nas mais recentes)
  let perItemSec = 0;
  if (p.itemDurations.length) {
    let weight = 0;
    let acc = 0;
    p.itemDurations.forEach((d, i) => {
      const w = i + 1;
      acc += d * w;
      weight += w;
    });
    perItemSec = acc / weight / 1000;
  } else if (p.renderStartedAt && p.itemProgress > PHASE_WEIGHTS.prep + 0.05) {
    // só extrapola depois que a codificação de fato começou: usar o tempo de
    // preparo (abrir worker, áudio, template) inflava o ETA em vários minutos
    const renderPart = (p.itemProgress - PHASE_WEIGHTS.prep) / PHASE_WEIGHTS.render;
    const renderSec = (t - p.renderStartedAt) / 1000 / Math.max(0.02, renderPart);
    const prepSec = Math.max(0, (p.renderStartedAt - p.itemStartedAt) / 1000);
    perItemSec = prepSec + renderSec;
  }

  const measuring = perItemSec <= 0;
  const eta = measuring ? null : Math.round(remaining * perItemSec);
  const perMin = perItemSec > 0 ? 60 / perItemSec : 0;
  return { elapsed, perMin, eta, perItemSec, measuring };
}

/** Velocidade legível: vídeos/min quando rápido, min/vídeo quando lento. */
export function formatSpeed(perItemSec: number) {
  if (!perItemSec || !Number.isFinite(perItemSec)) return "medindo…";
  if (perItemSec <= 60) return `${(60 / perItemSec).toFixed(1)} vídeos/min`;
  const min = perItemSec / 60;
  return `${min < 10 ? min.toFixed(1) : Math.round(min)} min/vídeo`;
}

export function formatEta(seconds: number | null) {
  if (seconds == null || !Number.isFinite(seconds)) return "calculando…";
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
