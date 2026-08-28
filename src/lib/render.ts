import { CANVAS_H, CANVAS_W, type Template } from "./template";
import { drawFrame } from "./draw";
import { encodeMp4, webCodecsSupported } from "./encode";
import { poolSupported, renderInPool } from "./render-pool";
import { motionAt, type Variation } from "./variation";
import { pickBitrate, type QualityTier } from "./encode-presets";

const clamp1 = (n: number) => Math.max(-1, Math.min(1, n));

import type { CaptionCue } from "./captions";
import type { PreEdit } from "./preedit";

export interface RenderOptions {
  variation: Variation;
  offsetX: number;
  offsetY: number;
  headline?: string | undefined;
  fps?: number | undefined;
  bitrate?: number | undefined;
  /** qualidade alvo quando o bitrate não é informado (preset por resolução) */
  tier?: QualityTier | undefined;
  turbo?: number | undefined;
  clip?: { start: number; end: number } | undefined;
  /** pré-edição do vídeo fonte (recorte, giro, cor) */
  pre?: PreEdit | null | undefined;
  captions?: CaptionCue[] | undefined;
  /** placa de fundo (mediana temporal) para reconstruir áreas limpas */
  plate?: { canvas: HTMLCanvasElement; ok: Set<string> } | null | undefined;
  onProgress?: ((p: number) => void) | undefined;
  onPhase?: ((phase: string, prepProgress?: number) => void) | undefined;
  /** telemetria de velocidade/caminho de leitura (só no caminho WebCodecs) */
  onStats?:
    | ((s: {
        path: "worker" | "turbo" | "reprodução" | "busca precisa" | "gravação em tempo real";
        fps: number;
      }) => void)
    | undefined;

  signal?: AbortSignal | undefined;
  jobId?: string | undefined;
}

function pickMime() {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "video/webm";
}

/** true quando o navegador só consegue gerar WebM (rejeitado por Instagram/TikTok). */
export function outputIsWebm() {
  if (webCodecsSupported()) return false;
  return !pickMime().startsWith("video/mp4");
}

/** Fallback em tempo real (navegadores sem WebCodecs). */
async function recordVideo(
  file: File,
  template: Template,
  opts: RenderOptions,
): Promise<{ blob: Blob; ext: string }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  const v = opts.variation;
  video.src = url;
  video.playsInline = true;
  video.playbackRate = v.speed;

  await new Promise<void>((res, rej) => {
    video.onloadedmetadata = () => res();
    video.onerror = () => rej(new Error("Não foi possível ler o vídeo"));
  });

  const canvas = document.createElement("canvas");
  canvas.width = template.canvasW ?? CANVAS_W;
  canvas.height = template.canvasH ?? CANVAS_H;
  const ctx = canvas.getContext("2d")!;

  const fps = opts.fps ?? 30;
  const stream = canvas.captureStream(fps);
  try {
    const media = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
    media?.getAudioTracks().forEach((t) => stream.addTrack(t));
  } catch {
    /* sem áudio */
  }

  const mimeType = pickMime();
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond:
      opts.bitrate ??
      pickBitrate({
        width: canvas.width,
        height: canvas.height,
        fps: opts.fps ?? 30,
        tier: opts.tier ?? "balanced",
      }),
  });
  // este caminho grava em tempo real: nunca passa de 1x, então avisamos a UI
  opts.onStats?.({ path: "gravação em tempo real", fps });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const tpl: Template = opts.headline
    ? { ...template, headline: { ...template.headline, text: opts.headline } }
    : template;

  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  const clipStart = Math.max(0, Math.min(opts.clip?.start ?? 0, Math.max(0, video.duration - 0.5)));
  const clipEnd = Math.min(video.duration, opts.clip?.end ?? video.duration);
  const endAt = Math.max(clipStart + 0.2, clipEnd - v.trimEnd);
  let raf = 0;
  const outDur = Math.max(0.5, (endAt - (clipStart + v.trimStart)) / (v.speed || 1));
  const hasMotion = v.motion && v.motion.preset !== "none";
  const loop = () => {
    const outTime = Math.max(0, (video.currentTime - (clipStart + v.trimStart)) / (v.speed || 1));
    const mo = hasMotion ? motionAt(v, outTime, outDur, 0.5) : null;
    drawFrame(ctx, tpl, { el: video, width: video.videoWidth, height: video.videoHeight }, {
      mirror: v.mirror,
      offsetX: clamp1(opts.offsetX + (mo?.panX ?? 0)),
      offsetY: clamp1(opts.offsetY + (mo?.panY ?? 0)),
      brightness: mo?.brightness ?? v.brightness,
      saturation: mo?.saturation ?? v.saturation,
      zoom: mo?.zoom ?? v.zoom,
      noise: v.noise,
      rotate: mo?.rotate ?? v.rotate,
      border: v.border,
      borderColor: v.borderColor,
      time: video.currentTime,
      quality: "hq" as const,
      ...(opts.pre ? { pre: opts.pre, clip: { start: clipStart, end: endAt } } : {}),
      ...(opts.captions?.length ? { captions: opts.captions } : {}),
      ...(opts.plate ? { plate: opts.plate } : {}),
    });
    if (video.duration) opts.onProgress?.(Math.min(1, video.currentTime / endAt));
    if (video.currentTime >= endAt) video.pause();
    raf = requestAnimationFrame(loop);
  };


  video.currentTime = clipStart + v.trimStart;
  recorder.start(1000);
  await video.play();
  loop();

  // limite de segurança: mesmo que o vídeo nunca avance, a gravação termina
  const maxWait = Math.max(30_000, outDur * 2000 + 30_000);
  const startedAt = performance.now();
  await new Promise<void>((res) => {
    const check = setInterval(() => {
      const timedOut = performance.now() - startedAt > maxWait;
      if (video.ended || video.paused || video.currentTime >= endAt || timedOut) {
        clearInterval(check);
        res();
      }
    }, 120);
  });


  cancelAnimationFrame(raf);
  recorder.stop();
  const blob = await done;
  URL.revokeObjectURL(url);
  opts.onProgress?.(1);
  return { blob, ext: mimeType.startsWith("video/mp4") ? "mp4" : "webm" };
}

/** tempo máximo sem qualquer sinal de vida antes de considerar o render travado */
const RENDER_STALL_MS = 120_000;

export async function renderVideo(
  file: File,
  template: Template,
  opts: RenderOptions,
): Promise<{ blob: Blob; ext: string }> {
  // Vigia global: qualquer caminho de render (pool, WebCodecs ou gravação em
  // tela) precisa dar sinal de vida. Sem sinal, o job é abortado e devolve erro
  // em vez de ficar "preparando" para sempre.
  const inner = new AbortController();
  let last = performance.now();
  const alive = () => {
    last = performance.now();
  };
  const onOuterAbort = () => inner.abort();
  opts.signal?.addEventListener("abort", onOuterAbort, { once: true });
  if (opts.signal?.aborted) inner.abort();

  let stalled = false;
  const watchdog = setInterval(() => {
    if (performance.now() - last < RENDER_STALL_MS) return;
    stalled = true;
    inner.abort();
  }, 5_000);

  const guarded: RenderOptions = {
    ...opts,
    signal: inner.signal,
    onProgress: (p) => {
      alive();
      opts.onProgress?.(p);
    },
    onPhase: (phase, prep) => {
      alive();
      opts.onPhase?.(phase, prep);
    },
    onStats: (s) => {
      alive();
      opts.onStats?.(s);
    },
  };

  const stallError = () =>
    Object.assign(
      new Error("O render travou e foi interrompido. Tente novamente em modo seguro."),
      { name: "RenderStalledError" },
    );

  try {
    const result = await runRender(file, template, guarded);
    if (opts.jobId) {
      const { finishJob } = await import("./jobs");
      void finishJob(opts.jobId, "pronto", { blob: result.blob, fileName: file.name });
    }
    return result;
  } catch (err) {
    if (stalled) throw stallError();
    throw err;
  } finally {
    clearInterval(watchdog);
    opts.signal?.removeEventListener("abort", onOuterAbort);
  }
}

async function runRender(
  file: File,
  template: Template,
  opts: RenderOptions,
): Promise<{ blob: Blob; ext: string }> {
  opts.onPhase?.("iniciando processamento", 0.02);
  // 1ª opção: pool de workers (OffscreenCanvas) — vários vídeos em paralelo
  // sem travar a interface. Cai para os caminhos antigos se algo não rolar.
  if (poolSupported()) {
    try {
      opts.onStats?.({ path: "worker", fps: 0 });
      const blob = await renderInPool(file, template, opts);
      return { blob, ext: "mp4" };
    } catch (err) {
      if ((err as Error)?.name === "AbortError") throw err;
      console.warn("Pool de workers falhou, usando exportação na tela:", err);
    }
  }

  if (opts.signal?.aborted) throw new DOMException("cancelado", "AbortError");

  if (webCodecsSupported()) {

    try {
      const blob = await encodeMp4({
        file,
        template,
        variation: opts.variation,
        offsetX: opts.offsetX,
        offsetY: opts.offsetY,
        headline: opts.headline,
        fps: opts.fps ?? 30,
        ...(opts.bitrate ? { bitrate: opts.bitrate } : {}),
        tier: opts.tier ?? "balanced",
        turbo: opts.turbo ?? 4,
        clip: opts.clip,
        pre: opts.pre,
        captions: opts.captions,
        plate: opts.plate,
        onProgress: opts.onProgress,
        onStats: opts.onStats,

        signal: opts.signal,
        jobId: opts.jobId,
      });
      return { blob, ext: "mp4" };
    } catch (err) {
      if ((err as Error)?.name === "AbortError" || (err as Error)?.name === "RenderStalledError") throw err;
      console.warn("WebCodecs falhou, usando fallback:", err);
    }
  }

  if (opts.signal?.aborted) throw new DOMException("cancelado", "AbortError");
  return recordVideo(file, template, opts);
}


export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function grabPoster(
  file: File,
  at = 0.5,
): Promise<{ url: string; w: number; h: number; duration: number }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  await new Promise<void>((res, rej) => {
    video.onloadedmetadata = () => res();
    video.onerror = () => rej(new Error("erro"));
  });
  video.currentTime = Math.min(at, Math.max(0, video.duration - 0.1));
  await new Promise<void>((res) => {
    video.onseeked = () => res();
  });
  const c = document.createElement("canvas");
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  c.getContext("2d")!.drawImage(video, 0, 0);
  const out = {
    url: c.toDataURL("image/jpeg", 0.7),
    w: video.videoWidth,
    h: video.videoHeight,
    duration: video.duration,
  };
  URL.revokeObjectURL(url);
  return out;
}

export { CANVAS_H, CANVAS_W };
