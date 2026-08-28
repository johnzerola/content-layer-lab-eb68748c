/**
 * Núcleo de exportação sem DOM — roda dentro de um Web Worker.
 *
 * Diferente de `encode.ts` (que depende de `<video>`), aqui os quadros saem
 * direto do arquivo via `VideoDecoder`, o desenho acontece num `OffscreenCanvas`
 * e o áudio chega pronto (PCM) da thread principal. Assim vários vídeos podem
 * ser renderizados em paralelo sem travar a interface.
 */
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { drawFrame } from "./draw";
import { CANVAS_H, CANVAS_W, type Template } from "./template";
import { motionAt, type Variation } from "./variation";
import type { CaptionCue } from "./captions";
import { keptSegments, segmentsDuration, srcTimeAt, type PreEdit } from "./preedit";
import { cleanMp4Metadata } from "./mp4meta";
import { FrameReader, videoDecoderSupported, type DecodedFrame } from "./decode";
import { envelopeAt, type AudioPcm, type Envelope } from "./audio-track";
import {
  pickAudioCodec,
  pickBitrate,
  pickVideoCodec,
  type QualityTier,
} from "./encode-presets";

export interface CoreEncodeOptions {
  file: File;
  duration: number;
  template: Template;
  variation: Variation;
  offsetX: number;
  offsetY: number;
  headline?: string | undefined;
  fps?: number | undefined;
  bitrate?: number | undefined;
  /** qualidade alvo quando o bitrate não é informado */
  tier?: QualityTier | undefined;
  clip?: { start: number; end: number } | undefined;
  pre?: PreEdit | null | undefined;
  captions?: CaptionCue[] | undefined;
  plate?: { canvas: CanvasImageSource; ok: Set<string> } | null | undefined;
  audio?: AudioPcm | null | undefined;
  envelope?: Envelope | null | undefined;
  onProgress?: ((p: number) => void) | undefined;
  isCancelled?: (() => boolean) | undefined;
}

const clampOffset = (n: number) => Math.max(-1, Math.min(1, n));

// escolha de codec/bitrate vive em ./encode-presets (compartilhado com encode.ts)


export function coreEncodeSupported() {
  return (
    typeof OffscreenCanvas !== "undefined" &&
    typeof VideoEncoder !== "undefined" &&
    typeof VideoFrame !== "undefined" &&
    videoDecoderSupported()
  );
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const cancelled = () => new DOMException("cancelado", "AbortError");

/** Renderiza o MP4 completo e devolve os bytes (transferíveis). */
export async function coreEncodeMp4(opts: CoreEncodeOptions): Promise<ArrayBuffer> {
  const fps = opts.fps ?? 30;
  const t = opts.template;
  const W = t.canvasW ?? CANVAS_W;
  const H = t.canvasH ?? CANVAS_H;
  const tier = opts.tier ?? "balanced";
  const bitrate = opts.bitrate ?? pickBitrate({ width: W, height: H, fps, tier });
  const v = opts.variation;
  const abort = () => opts.isCancelled?.() === true;

  const picked = await pickVideoCodec(W, H, bitrate, fps, tier);
  if (!picked) throw new Error("Codificação de vídeo não suportada neste navegador");

  const reader = await FrameReader.open(opts.file);
  if (!reader) throw new Error("Não foi possível decodificar este vídeo diretamente");

  const duration = opts.duration || reader.duration || 0;
  const clipStart = Math.max(0, Math.min(opts.clip?.start ?? 0, Math.max(0, duration - 0.5)));
  const clipEnd = Math.min(duration || Infinity, opts.clip?.end ?? duration);
  const clipDur = Math.max(0.5, clipEnd - clipStart);
  const trimStart = clipStart + Math.min(v.trimStart, Math.max(0, clipDur - 0.5));
  const trimEnd = Math.max(trimStart + 0.2, clipStart + clipDur - v.trimEnd);
  const segments = keptSegments(opts.pre, { start: trimStart, end: trimEnd }, duration);
  const effDur = Math.max(0.2, segmentsDuration(segments));
  const outDur = effDur / v.speed;
  const totalFrames = Math.max(1, Math.round(outDur * fps));

  const audio = opts.audio && opts.audio.planes.length ? opts.audio : null;
  const audioCodec = audio ? await pickAudioCodec(audio.channels, audio.sampleRate) : null;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: picked.mux, width: W, height: H, frameRate: fps },
    ...(audio && audioCodec
      ? { audio: { codec: audioCodec, numberOfChannels: audio.channels, sampleRate: audio.sampleRate } }
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
  const ctx = canvas.getContext("2d", {
    alpha: false,
  }) as unknown as CanvasRenderingContext2D;

  const tpl: Template = opts.headline
    ? { ...t, headline: { ...t.headline, text: opts.headline } }
    : t;

  const drawOpts = {
    mirror: v.mirror,
    offsetX: opts.offsetX,
    offsetY: opts.offsetY,
    brightness: v.brightness,
    saturation: v.saturation,
    zoom: v.zoom,
    noise: v.noise,
    rotate: v.rotate,
    border: v.border,
    borderColor: v.borderColor,
    ...(opts.pre ? { pre: opts.pre, clip: { start: trimStart, end: trimStart + effDur } } : {}),
    ...(opts.captions?.length ? { captions: opts.captions } : {}),
    ...(opts.plate
      ? { plate: opts.plate as unknown as { canvas: HTMLCanvasElement; ok: Set<string> } }
      : {}),
  };

  const hasMotion = v.motion && v.motion.preset !== "none";
  const frameDur = Math.round(1_000_000 / fps);
  let frameIndex = 0;

  // Verificação anti-quadro-preto: se o vídeo da fonte tem imagem mas o quadro
  // montado sai praticamente preto, o desenho falhou (decodificação sem pixels
  // úteis). Melhor abortar e deixar o caminho com <video> assumir.
  const probe = new OffscreenCanvas(32, 32);
  const pctx = probe.getContext("2d", { willReadFrequently: true }) as
    | OffscreenCanvasRenderingContext2D
    | null;
  const litRatio = (img: CanvasImageSource) => {
    if (!pctx) return 1;
    pctx.clearRect(0, 0, 32, 32);
    try {
      pctx.drawImage(img, 0, 0, 32, 32);
    } catch {
      return 1;
    }
    const d = pctx.getImageData(0, 0, 32, 32).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i]! > 12 || d[i + 1]! > 12 || d[i + 2]! > 12) lit++;
    }
    return lit / (32 * 32);
  };
  let checked = false;

  const emit = async (src: { el: CanvasImageSource; width: number; height: number }) => {
    const outTime = frameIndex / fps;
    const srcTime = srcTimeAt(segments, outTime * v.speed);
    const mo = hasMotion
      ? motionAt(v, outTime, outDur, opts.envelope ? envelopeAt(opts.envelope, outTime) : 0)
      : null;
    drawFrame(ctx, tpl, src, {
      ...drawOpts,
      ...(mo
        ? {
            zoom: mo.zoom,
            brightness: mo.brightness,
            saturation: mo.saturation,
            rotate: mo.rotate,
            offsetX: clampOffset(opts.offsetX + mo.panX),
            offsetY: clampOffset(opts.offsetY + mo.panY),
          }
        : {}),
      time: srcTime,
      quality: "hq" as const,
    });

    if (!checked && frameIndex >= 2) {
      checked = true;
      const srcLit = litRatio(src.el);
      const outLit = litRatio(canvas);
      if (srcLit > 0.2 && outLit < 0.05) {
        throw new Error("Quadros saíram pretos na renderização em segundo plano");
      }
    }



    const frame = new VideoFrame(canvas, {
      timestamp: frameIndex * frameDur,
      duration: frameDur,
    });
    encoder.encode(frame, { keyFrame: frameIndex % (fps * 2) === 0 });
    frame.close();
    frameIndex++;

    let waitStarted = Date.now();
    let recovered = false;
    while (encoder.encodeQueueSize > 6) {
      if (encoderError) throw encoderError;
      if (abort()) throw cancelled();
      if (Date.now() - waitStarted > 20_000) {
        if (recovered) throw new Error("O codificador de vídeo parou de responder");
        recovered = true;
        await encoder.flush().catch(() => {});
        waitStarted = Date.now();
        continue;
      }
      await sleep(2);
    }
  };

  let cur: DecodedFrame | null = null;
  try {
    await reader.seek(srcTimeAt(segments, 0));
    cur = await reader.read();
    while (cur && frameIndex < totalFrames) {
      if (abort()) throw cancelled();
      const target = srcTimeAt(segments, (frameIndex / fps) * v.speed);
      if (target < cur.time - 0.25 || target > cur.time + 2) {
        await reader.seek(target);
        cur.frame.close();
        cur = await reader.read();
        continue;
      }
      while (cur && cur.time + cur.duration <= target - 1e-4) {
        const nxt = await reader.read();
        if (!nxt) break;
        cur.frame.close();
        cur = nxt;
      }
      if (!cur) break;
      await emit({
        el: cur.frame,
        width: cur.frame.displayWidth,
        height: cur.frame.displayHeight,
      });
      // o primeiro quadro já reporta progresso: a UI para de parecer travada
      // em "iniciando codificador"
      if (frameIndex <= 2 || frameIndex % 3 === 0)
        opts.onProgress?.(Math.min(0.97, Math.max(0.001, frameIndex / totalFrames)));
    }

    // último quadro repetido quando a fonte acaba antes do previsto
    if (cur && frameIndex < totalFrames) {
      const last = cur;
      while (frameIndex < totalFrames) {
        if (abort()) throw cancelled();
        await emit({
          el: last.frame,
          width: last.frame.displayWidth,
          height: last.frame.displayHeight,
        });
      }
    }
  } finally {
    cur?.frame.close();
    reader.close();
  }

  if (frameIndex === 0) throw new Error("Nenhum quadro pôde ser lido deste vídeo");

  await encoder.flush();
  encoder.close();

  if (audio && audioCodec) {
    const AudioEnc = globalThis.AudioEncoder;
    if (AudioEnc) {
      const aenc = new AudioEnc({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: () => {},
      });
      const aConfig: AudioEncoderConfig = {
        codec: audioCodec === "aac" ? "mp4a.40.2" : "opus",
        sampleRate: audio.sampleRate,
        numberOfChannels: audio.channels,
        bitrate: 128_000,
      };
      const sup = await AudioEnc.isConfigSupported(aConfig).catch(() => null);
      if (sup?.supported) {
        aenc.configure(aConfig);
        const chunkSize = 4800;
        const total = audio.planes[0]?.length ?? 0;
        for (let off = 0; off < total; off += chunkSize) {
          const len = Math.min(chunkSize, total - off);
          const data = new Float32Array(len * audio.channels);
          for (let c = 0; c < audio.channels; c++) {
            data.set(audio.planes[c]!.subarray(off, off + len), c * len);
          }
          const ad = new AudioData({
            format: "f32-planar",
            sampleRate: audio.sampleRate,
            numberOfFrames: len,
            numberOfChannels: audio.channels,
            timestamp: Math.round((off / audio.sampleRate) * 1_000_000),
            data,
          });
          aenc.encode(ad);
          ad.close();
        }
        await aenc.flush();
        aenc.close();
      }
    }
  }

  muxer.finalize();
  opts.onProgress?.(1);
  const raw = muxer.target.buffer as ArrayBuffer;
  return t.antiDup?.cleanMetadata === false ? raw : cleanMp4Metadata(raw);
}
