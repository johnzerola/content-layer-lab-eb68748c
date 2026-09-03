/**
 * Limpeza local (sem worker GPU).
 *
 * Fallback honesto para quando o motor de IA está offline: em vez de bloquear
 * o fluxo, o navegador reconstrói o fundo por MEDIANA TEMPORAL — amostra vários
 * quadros do vídeo e usa, para cada pixel mascarado, o valor mais frequente ao
 * longo do tempo. Isso remove legendas e marcas d'água estáticas reconstruindo
 * o fundo real (nada de blur ou mosaico, invariante do projeto), só que sem a
 * qualidade do inpainting temporal do ProPainter em cenas com muito movimento.
 */
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { FrameReader, videoDecoderSupported } from "./decode";
import { pickAudioCodec, pickBitrate, pickVideoCodec } from "./encode-presets";
import { decodeSourceAudio } from "./audio-track";
import type { CleanerRegion } from "./cleaner";

export interface LocalCleanOptions {
  file: File;
  masks: CleanerRegion[];
  /** limita a saída aos primeiros N segundos (prévia rápida) */
  seconds?: number | undefined;
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

function activeMasks(masks: CleanerRegion[], time: number) {
  return masks.filter((m) => {
    if (m.enabled === false || m.role !== "remove") return false;
    if (m.from !== undefined && time < m.from - 1e-3) return false;
    if (m.to !== undefined && time > m.to + 1e-3) return false;
    return true;
  });
}

/** Desenha as máscaras ativas em branco sobre fundo transparente. */
function paintMask(
  ctx: OffscreenCanvasRenderingContext2D,
  masks: CleanerRegion[],
  W: number,
  H: number,
) {
  ctx.clearRect(0, 0, W, H);
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
}

/**
 * Constrói a "chapa limpa": mediana por pixel de N quadros distribuídos pelo
 * vídeo. Onde a legenda/marca fica parada e o fundo muda, a mediana devolve o
 * fundo verdadeiro.
 */
async function buildPlate(
  file: File,
  W: number,
  H: number,
  duration: number,
  samples: number,
  onPhase?: (p: string) => void,
): Promise<ImageData | null> {
  const reader = await FrameReader.open(file);
  if (!reader) return null;
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const stacks: Uint8ClampedArray[] = [];
  try {
    for (let i = 0; i < samples; i++) {
      onPhase?.(`analisando fundo ${i + 1}/${samples}`);
      const t = (duration * (i + 0.5)) / samples;
      await reader.seek(t);
      const frame = await reader.read();
      if (!frame) break;
      ctx.drawImage(frame.frame, 0, 0, W, H);
      frame.frame.close();
      stacks.push(ctx.getImageData(0, 0, W, H).data);
    }
  } finally {
    reader.close();
  }
  if (!stacks.length) return null;

  const out = new ImageData(W, H);
  const n = stacks.length;
  const buf = new Uint8ClampedArray(n);
  for (let p = 0; p < W * H * 4; p += 4) {
    for (let c = 0; c < 3; c++) {
      for (let i = 0; i < n; i++) buf[i] = stacks[i]![p + c]!;
      const sorted = Array.prototype.slice.call(buf, 0, n).sort((a: number, b: number) => a - b);
      out.data[p + c] = sorted[n >> 1] as number;
    }
    out.data[p + 3] = 255;
  }
  return out;
}

/** Processa o vídeo inteiro no navegador e devolve o MP4 limpo. */
export async function runLocalClean(opts: LocalCleanOptions): Promise<Blob> {
  if (!localCleanSupported()) throw new Error("Este navegador não suporta o modo local");
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

  const plate = await buildPlate(
    opts.file,
    W,
    H,
    sourceDuration || duration,
    Math.min(16, Math.max(6, Math.round((sourceDuration || 5) / 2))),
    opts.onPhase,
  );
  if (!plate) throw new Error("Não foi possível analisar o fundo do vídeo");

  const plateCanvas = new OffscreenCanvas(W, H);
  plateCanvas.getContext("2d")!.putImageData(plate, 0, 0);

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
  const maskCanvas = new OffscreenCanvas(W, H);
  const maskCtx = maskCanvas.getContext("2d")!;
  const patchCanvas = new OffscreenCanvas(W, H);
  const patchCtx = patchCanvas.getContext("2d")!;

  const frameDur = Math.round(1_000_000 / fps);
  const totalFrames = Math.max(1, Math.round(duration * fps));
  let frameIndex = 0;

  const reader = await FrameReader.open(opts.file);
  if (!reader) throw new Error("Não foi possível decodificar este vídeo no navegador");

  opts.onPhase?.("reconstruindo o fundo");
  let cur = await reader.read();
  try {
    while (frameIndex < totalFrames) {
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
        paintMask(maskCtx, active, W, H);
        patchCtx.globalCompositeOperation = "source-over";
        patchCtx.clearRect(0, 0, W, H);
        patchCtx.drawImage(plateCanvas, 0, 0);
        patchCtx.globalCompositeOperation = "destination-in";
        patchCtx.drawImage(maskCanvas, 0, 0);
        patchCtx.globalCompositeOperation = "source-over";
        ctx.drawImage(patchCanvas, 0, 0);
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
  } finally {
    cur?.frame.close();
    reader.close();
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
