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
  /** trilha de áudio já montada (falas + música); opcional */
  audio?: AudioBuffer | null;
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

  const audio = opts.audio ?? null;
  const audioSupported =
    !!audio && typeof globalThis.AudioEncoder !== "undefined" && typeof globalThis.AudioData !== "undefined";

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: picked.mux, width, height, frameRate: fps },
    ...(audioSupported && audio
      ? {
          audio: {
            codec: "aac" as const,
            numberOfChannels: Math.min(2, audio.numberOfChannels),
            sampleRate: audio.sampleRate,
          },
        }
      : {}),
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
    if (audioSupported && audio) {
      await encodeAudioTrack(audio, muxer);
    }
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


/**
 * Codifica a trilha de áudio em AAC e coloca no mesmo arquivo. Se o navegador
 * não suportar, o vídeo sai sem som em vez de falhar a exportação inteira.
 */
async function encodeAudioTrack(buffer: AudioBuffer, muxer: Muxer<ArrayBufferTarget>): Promise<void> {
  const channels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const config: AudioEncoderConfig = {
    codec: "mp4a.40.2",
    numberOfChannels: channels,
    sampleRate,
    bitrate: 128_000,
  };
  const support = await globalThis.AudioEncoder.isConfigSupported(config).catch(() => null);
  if (!support?.supported) return;

  let failed: Error | null = null;
  const encoder = new globalThis.AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => {
      failed = e instanceof Error ? e : new Error(String(e));
    },
  });
  encoder.configure(config);

  // entrelaça os canais em blocos de ~0,1 s
  const block = Math.round(sampleRate / 10);
  const source: Float32Array[] = [];
  for (let c = 0; c < channels; c += 1) source.push(buffer.getChannelData(c));

  for (let offset = 0; offset < buffer.length; offset += block) {
    if (failed) throw failed;
    const frames = Math.min(block, buffer.length - offset);
    const interleaved = new Float32Array(frames * channels);
    for (let i = 0; i < frames; i += 1) {
      for (let c = 0; c < channels; c += 1) interleaved[i * channels + c] = source[c]![offset + i]!;
    }
    const data = new globalThis.AudioData({
      format: "f32",
      sampleRate,
      numberOfFrames: frames,
      numberOfChannels: channels,
      timestamp: Math.round((offset / sampleRate) * 1_000_000),
      data: interleaved,
    });
    encoder.encode(data);
    data.close();
    if (encoder.encodeQueueSize > 8) {
      while (encoder.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 4));
    }
  }
  await encoder.flush();
  if (failed) throw failed;
  try {
    if (encoder.state !== "closed") encoder.close();
  } catch {
    /* já encerrado */
  }
}
