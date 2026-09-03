/**
 * Limpeza local (sem worker GPU) — modelo próprio de fundo.
 *
 * Em vez de uma única "chapa" mediana para o vídeo inteiro, o modo local agora
 * constrói um MODELO DE FUNDO ADAPTATIVO: o vídeo é processado em blocos e,
 * para cada bloco, o fundo é estimado a partir de uma janela de referência de
 * quadros vizinhos (mediana temporal robusta), calculada apenas dentro do
 * recorte que contém as máscaras. Isso mantém o custo proporcional à área da
 * legenda/marca — e não ao vídeo inteiro — o que torna viável limpar vídeos de
 * vários minutos no navegador.
 *
 * Invariante do projeto: nada de blur ou mosaico no conteúdo. O que entra no
 * lugar da marca é fundo real reconstruído; só a costura da borda recebe uma
 * transição suave de alpha para não deixar recorte visível.
 */
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { FrameReader, videoDecoderSupported } from "./decode";
import { pickAudioCodec, pickBitrate, pickVideoCodec } from "./encode-presets";
import { decodeSourceAudio } from "./audio-track";
import type { CleanerRegion } from "./cleaner";

/** Controles avançados do inpainting local. */
export interface LocalCleanAdvanced {
  /** força da substituição (0.5 = mistura com o original, 1 = fundo puro) */
  strength: number;
  /** janela de referência em segundos usada para estimar o fundo */
  referenceSeconds: number;
  /** quantos quadros de contexto entram na mediana de cada bloco */
  contextFrames: number;
  /** margem extra ao redor das máscaras (fração do menor lado) */
  cropPadding: number;
  /** de quantos em quantos segundos o modelo de fundo é recalculado */
  segmentSeconds: number;
  /** suavização da costura da borda, em px */
  feather: number;
}

export const DEFAULT_LOCAL_ADVANCED: LocalCleanAdvanced = {
  strength: 1,
  referenceSeconds: 4,
  contextFrames: 9,
  cropPadding: 0.05,
  segmentSeconds: 6,
  feather: 3,
};

export const LOCAL_ADVANCED_LIMITS: Record<
  keyof LocalCleanAdvanced,
  { min: number; max: number; step: number; label: string; hint: string }
> = {
  strength: {
    min: 0.5,
    max: 1,
    step: 0.05,
    label: "Força",
    hint: "1 usa só o fundo reconstruído; abaixo disso mistura com o quadro original.",
  },
  referenceSeconds: {
    min: 1,
    max: 20,
    step: 1,
    label: "Tempo de referência (s)",
    hint: "Janela de quadros vizinhos consultada para descobrir o que existe atrás da marca.",
  },
  contextFrames: {
    min: 3,
    max: 25,
    step: 2,
    label: "Frames de contexto",
    hint: "Mais quadros = fundo mais limpo, porém mais lento.",
  },
  cropPadding: {
    min: 0,
    max: 0.3,
    step: 0.01,
    label: "Tamanho do recorte",
    hint: "Margem ao redor da máscara analisada; aumente se sobrar rastro na borda.",
  },
  segmentSeconds: {
    min: 1,
    max: 20,
    step: 1,
    label: "Bloco de recálculo (s)",
    hint: "De quanto em quanto tempo o fundo é reestimado. Menor = acompanha cenas que mudam rápido.",
  },
  feather: {
    min: 0,
    max: 12,
    step: 1,
    label: "Suavizar borda (px)",
    hint: "Transição da costura entre o fundo reconstruído e o quadro.",
  },
};

export interface LocalCleanOptions {
  file: File;
  masks: CleanerRegion[];
  /** limita a saída aos primeiros N segundos (prévia rápida) */
  seconds?: number | undefined;
  advanced?: Partial<LocalCleanAdvanced> | undefined;
  onProgress?: ((p: number) => void) | undefined;
  onPhase?: ((phase: string) => void) | undefined;
  isCancelled?: (() => boolean) | undefined;
}

export function localCleanSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof VideoEncoder !== "undefined" &&
    typeof VideoFrame !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    videoDecoderSupported()
  );
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function resolveAdvanced(partial?: Partial<LocalCleanAdvanced>): LocalCleanAdvanced {
  const merged = { ...DEFAULT_LOCAL_ADVANCED, ...(partial ?? {}) };
  const out = { ...merged };
  for (const key of Object.keys(LOCAL_ADVANCED_LIMITS) as (keyof LocalCleanAdvanced)[]) {
    const l = LOCAL_ADVANCED_LIMITS[key];
    out[key] = clamp(Number(merged[key]) || l.min, l.min, l.max);
  }
  out.contextFrames = Math.max(3, Math.round(out.contextFrames));
  return out;
}

function removableMasks(masks: CleanerRegion[]) {
  return masks.filter((m) => m.enabled !== false && m.role === "remove");
}

function activeMasks(masks: CleanerRegion[], time: number) {
  return removableMasks(masks).filter((m) => {
    if (m.from !== undefined && time < m.from - 1e-3) return false;
    if (m.to !== undefined && time > m.to + 1e-3) return false;
    return true;
  });
}

interface Roi {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Retângulo (em px) que cobre todas as máscaras removíveis, com margem. */
function computeRoi(masks: CleanerRegion[], W: number, H: number, padding: number): Roi | null {
  const list = removableMasks(masks);
  if (!list.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const push = (x: number, y: number) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  for (const m of list) {
    if (m.kind === "rect") {
      push((m.x ?? 0) * W, (m.y ?? 0) * H);
      push(((m.x ?? 0) + (m.w ?? 0)) * W, ((m.y ?? 0) + (m.h ?? 0)) * H);
    } else if (m.points?.length) {
      const r = m.kind === "brush" ? (m.size ?? 0.015) * Math.min(W, H) : 0;
      for (const p of m.points) {
        push(p.x * W - r, p.y * H - r);
        push(p.x * W + r, p.y * H + r);
      }
    }
  }
  if (!Number.isFinite(x0)) return null;
  const pad = padding * Math.min(W, H) + 24;
  const x = Math.max(0, Math.floor(x0 - pad));
  const y = Math.max(0, Math.floor(y0 - pad));
  const w = Math.min(W - x, Math.ceil(x1 - x0 + pad * 2));
  const h = Math.min(H - y, Math.ceil(y1 - y0 + pad * 2));
  if (w <= 1 || h <= 1) return null;
  return { x, y, w, h };
}

/** Desenha as máscaras ativas em branco sobre fundo transparente (coords do ROI). */
function paintMask(
  ctx: OffscreenCanvasRenderingContext2D,
  masks: CleanerRegion[],
  W: number,
  H: number,
  roi: Roi,
  feather: number,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, roi.w, roi.h);
  ctx.filter = feather > 0 ? `blur(${feather}px)` : "none";
  ctx.translate(-roi.x, -roi.y);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  for (const m of masks) {
    const grow = (m.grow ?? 0.006) * Math.min(W, H) + 8;
    if (m.kind === "rect") {
      const x = (m.x ?? 0) * W - grow;
      const y = (m.y ?? 0) * H - grow;
      ctx.fillRect(x, y, (m.w ?? 0) * W + grow * 2, (m.h ?? 0) * H + grow * 2);
    } else if (m.kind === "poly" && m.points?.length) {
      ctx.beginPath();
      m.points.forEach((p, i) =>
        i === 0 ? ctx.moveTo(p.x * W, p.y * H) : ctx.lineTo(p.x * W, p.y * H),
      );
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = grow * 2;
      ctx.lineJoin = "round";
      ctx.stroke();
    } else if (m.kind === "brush" && m.points?.length) {
      const r = (m.size ?? 0.015) * Math.min(W, H) + grow;
      for (const p of m.points) {
        ctx.beginPath();
        ctx.arc(p.x * W, p.y * H, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = "none";
}

/** Mediana por pixel das amostras do ROI: o fundo que estava atrás da marca. */
function medianPlate(samples: Uint8ClampedArray[], w: number, h: number): ImageData {
  const out = new ImageData(w, h);
  const n = samples.length;
  const buf = new Float64Array(n);
  const mid = n >> 1;
  for (let p = 0; p < w * h * 4; p += 4) {
    for (let c = 0; c < 3; c++) {
      for (let i = 0; i < n; i++) buf[i] = samples[i]![p + c]!;
      // insertion sort: n é pequeno (3..25) e evita alocação por pixel
      for (let i = 1; i < n; i++) {
        const v = buf[i]!;
        let j = i - 1;
        while (j >= 0 && buf[j]! > v) {
          buf[j + 1] = buf[j]!;
          j--;
        }
        buf[j + 1] = v;
      }
      out.data[p + c] = n % 2 ? buf[mid]! : Math.round((buf[mid - 1]! + buf[mid]!) / 2);
    }
    out.data[p + 3] = 255;
  }
  return out;
}

/**
 * Amostra quadros de referência ao redor de [from, to] e devolve o modelo de
 * fundo daquele bloco, já recortado no ROI.
 */
async function buildSegmentPlate(
  reader: FrameReader,
  roi: Roi,
  W: number,
  H: number,
  from: number,
  to: number,
  adv: LocalCleanAdvanced,
  totalDuration: number,
): Promise<ImageData | null> {
  const start = Math.max(0, from - adv.referenceSeconds);
  const end = Math.min(totalDuration || to + adv.referenceSeconds, to + adv.referenceSeconds);
  const span = Math.max(0.2, end - start);
  const step = span / adv.contextFrames;

  const canvas = new OffscreenCanvas(roi.w, roi.h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const samples: Uint8ClampedArray[] = [];
  await reader.seek(start);
  let nextAt = start;
  let frame = await reader.read();
  while (frame && samples.length < adv.contextFrames) {
    if (frame.time + frame.duration < nextAt - 1e-3) {
      frame.frame.close();
      frame = await reader.read();
      continue;
    }
    if (frame.time > end + step) break;
    ctx.drawImage(frame.frame, roi.x, roi.y, roi.w, roi.h, 0, 0, roi.w, roi.h);
    samples.push(ctx.getImageData(0, 0, roi.w, roi.h).data);
    nextAt += step;
    frame.frame.close();
    frame = await reader.read();
  }
  frame?.frame.close();
  if (samples.length < 2) {
    if (!samples.length) return null;
    const single = new ImageData(roi.w, roi.h);
    single.data.set(samples[0]!);
    return single;
  }

  return medianPlate(samples, roi.w, roi.h);
}

/** Processa o vídeo inteiro no navegador e devolve o MP4 limpo. */
export async function runLocalClean(opts: LocalCleanOptions): Promise<Blob> {
  if (!localCleanSupported()) throw new Error("Este navegador não suporta o modo local");
  const adv = resolveAdvanced(opts.advanced);
  const abort = () => opts.isCancelled?.() === true;
  const cancelled = () => new DOMException("cancelado", "AbortError");

  opts.onPhase?.("abrindo o vídeo");
  const probe = await FrameReader.open(opts.file);
  if (!probe) throw new Error("Não foi possível decodificar este vídeo no navegador");
  const first = await probe.read();
  const W = first?.frame.displayWidth ?? 1080;
  const H = first?.frame.displayHeight ?? 1920;
  const sourceDuration = probe.duration || 0;
  first?.frame.close();
  probe.close();

  const duration = Math.max(
    0.5,
    Math.min(sourceDuration || 5, opts.seconds ?? (sourceDuration || 5)),
  );
  const fps = 30;
  const roi = computeRoi(opts.masks, W, H, adv.cropPadding);
  if (!roi) throw new Error("Marque ao menos uma área para remover");

  opts.onPhase?.("preparando codificador");
  const bitrate = pickBitrate({ width: W, height: H, fps, tier: "balanced" });
  const picked = await pickVideoCodec(W, H, bitrate, fps, "balanced");
  if (!picked) throw new Error("Codificação de vídeo não suportada neste navegador");

  const audioBuffer = await decodeSourceAudio(opts.file).catch(() => null);
  const channels = audioBuffer ? Math.min(2, audioBuffer.numberOfChannels) : 0;
  const audioCodec = audioBuffer ? await pickAudioCodec(channels, audioBuffer.sampleRate) : null;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: picked.mux, width: W, height: H, frameRate: fps },
    ...(audioBuffer && audioCodec
      ? {
          audio: {
            codec: audioCodec,
            numberOfChannels: channels,
            sampleRate: audioBuffer.sampleRate,
          },
        }
      : {}),
    fastStart: "in-memory",
  });

  let encoderError: DOMException | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encoderError = e;
    },
  });
  encoder.configure(picked.cfg);

  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext("2d", { alpha: false })!;
  const maskCanvas = new OffscreenCanvas(roi.w, roi.h);
  const maskCtx = maskCanvas.getContext("2d")!;
  const patchCanvas = new OffscreenCanvas(roi.w, roi.h);
  const patchCtx = patchCanvas.getContext("2d")!;
  const plateCanvas = new OffscreenCanvas(roi.w, roi.h);
  const plateCtx = plateCanvas.getContext("2d")!;

  const frameDur = Math.round(1_000_000 / fps);
  const totalFrames = Math.max(1, Math.round(duration * fps));
  const segments = Math.max(1, Math.ceil(duration / adv.segmentSeconds));

  const analyser = await FrameReader.open(opts.file);
  const reader = await FrameReader.open(opts.file);
  if (!analyser || !reader) throw new Error("Não foi possível decodificar este vídeo no navegador");

  let frameIndex = 0;
  let cur: Awaited<ReturnType<FrameReader["read"]>> = null;

  try {
    for (let seg = 0; seg < segments; seg++) {
      if (abort()) throw cancelled();
      const segFrom = seg * adv.segmentSeconds;
      const segTo = Math.min(duration, segFrom + adv.segmentSeconds);
      opts.onPhase?.(`modelando o fundo ${seg + 1}/${segments}`);
      const plate = await buildSegmentPlate(
        analyser,
        roi,
        W,
        H,
        segFrom,
        segTo,
        adv,
        sourceDuration,
      );
      if (!plate) throw new Error("Não foi possível analisar o fundo do vídeo");
      plateCtx.putImageData(plate, 0, 0);

      opts.onPhase?.(`reconstruindo ${seg + 1}/${segments}`);
      await reader.seek(segFrom);
      cur?.frame.close();
      cur = await reader.read();

      const segEndFrame = Math.min(totalFrames, Math.round(segTo * fps));
      while (frameIndex < segEndFrame) {
        if (abort()) throw cancelled();
        if (encoderError) throw encoderError;
        const target = frameIndex / fps;
        while (cur && cur.time + cur.duration <= target - 1e-4) {
          const next = await reader.read();
          if (!next) break;
          cur.frame.close();
          cur = next;
        }
        if (!cur) break;

        ctx.drawImage(cur.frame, 0, 0, W, H);
        const active = activeMasks(opts.masks, target);
        if (active.length) {
          paintMask(maskCtx, active, W, H, roi, adv.feather);
          patchCtx.globalCompositeOperation = "source-over";
          patchCtx.clearRect(0, 0, roi.w, roi.h);
          patchCtx.drawImage(plateCanvas, 0, 0);
          patchCtx.globalCompositeOperation = "destination-in";
          patchCtx.drawImage(maskCanvas, 0, 0);
          patchCtx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = adv.strength;
          ctx.drawImage(patchCanvas, roi.x, roi.y);
          ctx.globalAlpha = 1;
        }

        const frame = new VideoFrame(canvas, {
          timestamp: frameIndex * frameDur,
          duration: frameDur,
        });
        encoder.encode(frame, { keyFrame: frameIndex % (fps * 2) === 0 });
        frame.close();
        frameIndex++;
        if (frameIndex % 3 === 0) opts.onProgress?.(Math.min(0.97, frameIndex / totalFrames));
        while (encoder.encodeQueueSize > 6) {
          if (encoderError) throw encoderError;
          if (abort()) throw cancelled();
          await sleep(2);
        }
      }
      if (!cur && frameIndex < totalFrames) break;
    }
  } finally {
    cur?.frame.close();
    reader.close();
    analyser.close();
  }

  if (!frameIndex) throw new Error("Nenhum quadro pôde ser lido deste vídeo");
  opts.onPhase?.("finalizando");
  await encoder.flush();
  encoder.close();

  if (audioBuffer && audioCodec && typeof AudioEncoder !== "undefined") {
    const aenc = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: () => {},
    });
    const cfg: AudioEncoderConfig = {
      codec: audioCodec === "aac" ? "mp4a.40.2" : "opus",
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: channels,
      bitrate: 128_000,
    };
    const sup = await AudioEncoder.isConfigSupported(cfg).catch(() => null);
    if (sup?.supported) {
      aenc.configure(cfg);
      const limit = Math.min(audioBuffer.length, Math.floor(duration * audioBuffer.sampleRate));
      const planes: Float32Array[] = [];
      for (let c = 0; c < channels; c++) planes.push(audioBuffer.getChannelData(c));
      const chunkSize = 4800;
      for (let off = 0; off < limit; off += chunkSize) {
        const len = Math.min(chunkSize, limit - off);
        const data = new Float32Array(len * channels);
        for (let c = 0; c < channels; c++) data.set(planes[c]!.subarray(off, off + len), c * len);
        const ad = new AudioData({
          format: "f32-planar",
          sampleRate: audioBuffer.sampleRate,
          numberOfFrames: len,
          numberOfChannels: channels,
          timestamp: Math.round((off / audioBuffer.sampleRate) * 1_000_000),
          data,
        });
        aenc.encode(ad);
        ad.close();
      }
      await aenc.flush();
      aenc.close();
    }
  }

  muxer.finalize();
  opts.onProgress?.(1);
  return new Blob([muxer.target.buffer as ArrayBuffer], { type: "video/mp4" });
}
