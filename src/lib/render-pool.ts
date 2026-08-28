/**
 * Pool de Web Workers para exportação.
 *
 * Cada worker desenha em OffscreenCanvas e codifica o MP4 sozinho, então
 * 2 a 4 vídeos são processados ao mesmo tempo sem travar a interface (e sem o
 * navegador estrangular a velocidade quando a aba fica em segundo plano).
 * Análises pesadas (áudio, placa de fundo, imagens do template) são calculadas
 * uma vez por vídeo e reaproveitadas entre as variações.
 */
import type { Template } from "./template";
import type { RenderOptions } from "./render";
import type { WorkerResponse, RenderRequest } from "@/workers/render.worker";
import { analysisCache, fileKey } from "./analysis-cache";
import { audioEnvelope, renderAudioTrack, toPcm, type Envelope } from "./audio-track";
import { keptSegments } from "./preedit";

interface Pending {
  resolve: (buf: ArrayBuffer) => void;
  reject: (err: Error) => void;
  onProgress?: ((p: number) => void) | undefined;
  onPhase?: ((phase: string, prep?: number) => void) | undefined;
  worker: Worker;
  watchdog: ReturnType<typeof setTimeout>;
}

let workers: Worker[] = [];
let rr = 0;
let seq = 0;
const pending = new Map<number, Pending>();
/** quantos jobs cada worker está tocando agora */
const load = new WeakMap<Worker, number>();

export function poolSupported() {
  return (
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof VideoEncoder !== "undefined" &&
    typeof VideoDecoder !== "undefined" &&
    typeof createImageBitmap !== "undefined"
  );
}

/** Um worker a cada dois núcleos, até quatro (deixa CPU para a interface). */
export function poolSize() {
  const cores = typeof navigator !== "undefined" ? (navigator.hardwareConcurrency ?? 4) : 4;
  return Math.max(1, Math.min(4, Math.floor(cores / 2) || 1));
}

const STALL_MS = 90_000;

function abortError() {
  return new DOMException("cancelado", "AbortError");
}

function raceStep<T>(task: Promise<T>, signal: AbortSignal | undefined, timeoutMs: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(() => reject(Object.assign(new Error(`${label} demorou demais`), { name: "RenderStalledError" })), timeoutMs);
    const abort = () => reject(abortError());
    signal?.addEventListener("abort", abort, { once: true });
    task.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    });
  });
}

/** Reinicia o vigia: houve sinal de vida deste job. */
function keepAlive(id: number, job: Pending) {
  clearTimeout(job.watchdog);
  job.watchdog = setTimeout(() => {
    pending.delete(id);
    job.worker.terminate();
    workers = workers.filter((candidate) => candidate !== job.worker);
    job.reject(
      Object.assign(new Error("A renderização parou de responder"), { name: "RenderStalledError" }),
    );
  }, STALL_MS);
}

function handle(e: MessageEvent<WorkerResponse>) {
  const msg = e.data;
  const job = pending.get(msg.id);
  if (!job) return;
  if (msg.type === "alive") {
    keepAlive(msg.id, job);
    return;
  }
  if (msg.type === "phase") {
    keepAlive(msg.id, job);
    job.onPhase?.(msg.phase);
    return;
  }
  if (msg.type === "progress") {
    keepAlive(msg.id, job);
    job.onProgress?.(msg.p);
    return;
  }
  pending.delete(msg.id);
  clearTimeout(job.watchdog);
  load.set(job.worker, Math.max(0, (load.get(job.worker) ?? 1) - 1));
  if (msg.type === "done") job.resolve(msg.buffer);
  else {
    const err = new Error(msg.message);
    err.name = msg.name;
    job.reject(err);
  }
}

function rejectWorkerJobs(worker: Worker, error: Error) {
  for (const [id, job] of pending) {
    if (job.worker !== worker) continue;
    clearTimeout(job.watchdog);
    pending.delete(id);
    job.reject(error);
  }
  worker.terminate();
  workers = workers.filter((candidate) => candidate !== worker);
}

function ensureWorkers() {
  if (workers.length) return workers;
  const n = poolSize();
  for (let i = 0; i < n; i++) {
    const w = new Worker(new URL("../workers/render.worker.ts", import.meta.url), {
      type: "module",
    });
    w.onmessage = handle;
    w.onerror = () => rejectWorkerJobs(w, new Error("Worker de renderização falhou"));
    load.set(w, 0);
    workers.push(w);
  }
  return workers;
}

/** Encerra os workers (ex.: lote cancelado e ocioso). */
export function shutdownPool() {
  for (const job of pending.values()) {
    clearTimeout(job.watchdog);
    job.reject(abortError());
  }
  for (const w of workers) w.terminate();
  workers = [];
  pending.clear();
}

function pickWorker() {
  const list = ensureWorkers();
  let best = list[0]!;
  for (const w of list) {
    if ((load.get(w) ?? 0) < (load.get(best) ?? 0)) best = w;
  }
  // desempate em rodízio para espalhar jobs iguais
  if ((load.get(best) ?? 0) === (load.get(list[rr % list.length]!) ?? 0)) {
    best = list[rr % list.length]!;
  }
  rr++;
  return best;
}

/** Imagens do template decodificadas uma vez por template (reusadas por variação). */
function templateImages(t: Template) {
  const srcs = new Set<string>();
  const push = (s?: string | null) => {
    if (s) srcs.add(s);
  };
  push(t.watermark?.src);
  push(t.avatar?.src);
  for (const l of t.extras ?? []) {
    if ("src" in l && typeof l.src === "string") push(l.src);
  }
  return [...srcs];
}

async function loadBitmaps(srcs: string[]) {
  const out: { src: string; bitmap: ImageBitmap }[] = [];
  for (const src of srcs) {
    try {
      const bmp = await analysisCache(`bitmap:${src}`, async () => {
        const res = await fetch(src);
        const blob = await res.blob();
        return createImageBitmap(blob);
      });
      // cada worker precisa da sua cópia (ImageBitmap é transferível uma vez só)
      out.push({ src, bitmap: await createImageBitmap(bmp) });
    } catch {
      /* imagem indisponível: o desenho segue sem ela */
    }
  }
  return out;
}

/** Duração do vídeo (cacheada por arquivo). */
function sourceDuration(file: File) {
  return analysisCache(`duration:${fileKey(file)}`, async () => {
    if (typeof document === "undefined") return 0;
    const url = URL.createObjectURL(file);
    try {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.src = url;
      const d = await new Promise<number>((res) => {
        v.onloadedmetadata = () => res(v.duration || 0);
        v.onerror = () => res(0);
        setTimeout(() => res(v.duration || 0), 12_000);
      });
      return Number.isFinite(d) ? d : 0;
    } finally {
      URL.revokeObjectURL(url);
    }
  });
}

/**
 * Renderiza num worker do pool. Lança erro quando o caminho rápido não é
 * possível — o chamador então usa a exportação da thread principal.
 */
export async function renderInPool(
  file: File,
  template: Template,
  opts: RenderOptions,
): Promise<Blob> {
  if (!poolSupported()) throw new Error("pool indisponível");
  if (opts.signal?.aborted) throw abortError();
  opts.onPhase?.("lendo informações do vídeo", 0.08);
  const duration = await raceStep(sourceDuration(file), opts.signal, 15_000, "A leitura do vídeo");
  const v = opts.variation;

  // ---- análises reaproveitadas entre variações ----
  const clipStart = Math.max(0, Math.min(opts.clip?.start ?? 0, Math.max(0, duration - 0.5)));
  const clipEnd = Math.min(duration || Infinity, opts.clip?.end ?? duration);
  const clipDur = Math.max(0.5, clipEnd - clipStart);
  const trimStart = clipStart + Math.min(v.trimStart, Math.max(0, clipDur - 0.5));
  const trimEnd = Math.max(trimStart + 0.2, clipStart + clipDur - v.trimEnd);
  const segments = keptSegments(opts.pre, { start: trimStart, end: trimEnd }, duration);

  // o áudio-fonte é decodificado uma única vez por arquivo (cache);
  // aqui só remontamos com a velocidade/tom desta variação
  opts.onPhase?.("preparando áudio", 0.25);
  const track = await raceStep(renderAudioTrack(file, segments, v.speed, v.pitch, v.eq), opts.signal, 60_000, "A preparação do áudio");
  const audio = track ? toPcm(track) : null;
  const envelope: Envelope | null = track ? audioEnvelope(track.rendered) : null;

  opts.onPhase?.("carregando elementos do template", 0.68);
  const images = await raceStep(loadBitmaps(templateImages(template)), opts.signal, 20_000, "O carregamento do template");

  let plate: { bitmap: ImageBitmap; ok: string[] } | null = null;
  if (opts.plate) {
    try {
      plate = {
        bitmap: await createImageBitmap(opts.plate.canvas),
        ok: [...opts.plate.ok],
      };
    } catch {
      plate = null;
    }
  }

  const worker = pickWorker();
  const id = ++seq;
  load.set(worker, (load.get(worker) ?? 0) + 1);

  opts.onPhase?.("iniciando codificador", 0.92);
  const done = new Promise<ArrayBuffer>((resolve, reject) => {
    const watchdog = setTimeout(() => {
      rejectWorkerJobs(worker, Object.assign(new Error("O codificador não iniciou"), { name: "RenderStalledError" }));
    }, STALL_MS);
    pending.set(id, { resolve, reject, onProgress: opts.onProgress, worker, watchdog });
  });

  const onAbort = () => {
    worker.postMessage({ type: "cancel", id });
    const job = pending.get(id);
    if (job) {
      clearTimeout(job.watchdog);
      pending.delete(id);
      load.set(worker, Math.max(0, (load.get(worker) ?? 1) - 1));
      job.reject(abortError());
    }
  };
  opts.signal?.addEventListener("abort", onAbort, { once: true });

  const req: RenderRequest = {
    type: "render",
    id,
    file,
    duration,
    template,
    variation: v,
    offsetX: opts.offsetX,
    offsetY: opts.offsetY,
    headline: opts.headline,
    fps: opts.fps ?? 30,
    // sem bitrate explícito o worker aplica o preset da resolução
    ...(opts.bitrate ? { bitrate: opts.bitrate } : {}),
    tier: opts.tier ?? "balanced",
    clip: opts.clip,
    pre: opts.pre,
    captions: opts.captions,
    plate,
    audio,
    envelope,
    images,
    fonts: template.fonts ?? [],
  };

  const transfer: Transferable[] = [
    ...(audio?.planes.map((p) => p.buffer as ArrayBuffer) ?? []),
    ...images.map((i) => i.bitmap),
    ...(plate ? [plate.bitmap] : []),
  ];
  worker.postMessage(req, transfer);

  try {
    const buffer = await done;
    return new Blob([buffer], { type: "video/mp4" });
  } finally {
    opts.signal?.removeEventListener("abort", onAbort);
  }
}
