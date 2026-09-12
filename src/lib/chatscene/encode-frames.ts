/**
 * Exportação MP4 a partir de uma sequência de quadros gerada por código.
 *
 * Caminho independente do codificador de vídeos de origem (`encode.ts` e
 * `encode-core.ts` decodificam um arquivo existente; aqui não há origem, os
 * quadros nascem do desenho). Nada do comportamento antigo é alterado.
 */
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { pickBitrate, pickVideoCodec, type QualityTier } from "../encode-presets";

export interface FrameSequenceOptions {
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  tier?: QualityTier;
  /** desenha o quadro `index` no contexto informado */
  draw: (ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, index: number) => void;
  onProgress?: (ratio: number) => void;
  signal?: AbortSignal;
}

export function frameEncoderSupported(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    typeof globalThis.VideoEncoder !== "undefined" &&
    typeof globalThis.VideoFrame !== "undefined" &&
    typeof OffscreenCanvas !== "undefined"
  );
}

/** Codifica a sequência e devolve o MP4 pronto. */
export async function encodeFrameSequence(opts: FrameSequenceOptions): Promise<Blob> {
  if (!frameEncoderSupported()) {
    throw new Error("Este navegador não consegue exportar vídeo. Use o Chrome ou o Edge no computador.");
  }
  const width = Math.round(opts.width / 2) * 2;
  const height = Math.round(opts.height / 2) * 2;
  const fps = Math.max(1, Math.round(opts.fps));
  const tier = opts.tier ?? "hq";

  const bitrate = pickBitrate({ width, height, fps, tier });
  const picked = await pickVideoCodec(width, height, bitrate, fps, tier);
  if (!picked) throw new Error("Nenhum codec de vídeo compatível foi encontrado neste navegador.");

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: picked.mux, width, height, frameRate: fps },
    fastStart: "in-memory",
  });

  let encoderError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encoderError = e instanceof Error ? e : new Error(String(e));
    },
  });
  encoder.configure(picked.cfg);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { alpha: false }) as OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error("Não foi possível preparar a área de desenho da exportação.");

  const frameDur = Math.round(1_000_000 / fps);
  try {
    for (let i = 0; i < opts.totalFrames; i++) {
      if (opts.signal?.aborted) throw new DOMException("Exportação cancelada", "AbortError");
      if (encoderError) throw encoderError;

      opts.draw(ctx, i);
      const frame = new VideoFrame(canvas, { timestamp: i * frameDur, duration: frameDur });
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();

      // dá espaço para o codificador drenar e mantém a interface viva
      if (encoder.encodeQueueSize > 8) {
        while (encoder.encodeQueueSize > 4) {
          await new Promise((r) => setTimeout(r, 4));
          if (encoderError) throw encoderError;
        }
      } else if (i % 10 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
      opts.onProgress?.((i + 1) / opts.totalFrames);
    }

    await encoder.flush();
    if (encoderError) throw encoderError;
    muxer.finalize();
    const target = muxer.target as ArrayBufferTarget;
    return new Blob([target.buffer], { type: "video/mp4" });
  } finally {
    try {
      if (encoder.state !== "closed") encoder.close();
    } catch {
      /* já encerrado */
    }
  }
}
