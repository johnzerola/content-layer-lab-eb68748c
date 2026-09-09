/** Real model separation. Browser extracts audio; Hostear runs Demucs. */
import { prepareAudioSeparation } from "@/lib/audio.functions";
import { runStemJob } from "./stem-service";

export interface StemOptions {
  signal?: AbortSignal;
  onStage?: (stage: string) => void;
}
export interface StemResult {
  voice: Blob;
  music: Blob;
  duration: number;
  sampleRate: number;
}

/** Interleaved PCM16 preserves stereo; no mid-channel/EQ masquerading as AI. */
export function encodeStereoWav(channels: Float32Array[], sampleRate: number): Blob {
  if (
    channels.length < 1 ||
    channels.length > 2 ||
    !channels[0]?.length ||
    channels.some((c) => c.length !== channels[0]!.length)
  )
    throw new Error("Canais de áudio inválidos.");
  const length = channels[0].length;
  const size = length * channels.length * 2;
  const bytes = new ArrayBuffer(44 + size);
  const view = new DataView(bytes);
  const str = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  str(0, "RIFF");
  view.setUint32(4, 36 + size, true);
  str(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels.length * 2, true);
  view.setUint16(32, channels.length * 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, size, true);
  let offset = 44;
  for (let i = 0; i < length; i++)
    for (const channel of channels) {
      const sample = Math.max(-1, Math.min(1, Number.isFinite(channel[i]) ? channel[i]! : 0));
      view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true);
      offset += 2;
    }
  return new Blob([bytes], { type: "audio/wav" });
}

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  return encodeStereoWav([samples], sampleRate);
}

export async function separateStems(
  file: Blob,
  options: StemOptions = {},
  onProgress?: (p: number) => void,
): Promise<StemResult> {
  options.signal?.throwIfAborted();
  const ticket = await prepareAudioSeparation();
  options.signal?.throwIfAborted();
  if (file.size > 256 * 1024 * 1024)
    throw new Error("Use um vídeo de até 256 MB para separar áudio.");
  options.onStage?.("Extraindo o áudio do vídeo…");
  onProgress?.(0.05);
  const context = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error(
      "Não consegui decodificar o áudio. Use um vídeo MP4 com áudio AAC ou um arquivo WAV.",
    );
  } finally {
    await context.close();
  }
  options.signal?.throwIfAborted();
  if (
    !Number.isFinite(decoded.duration) ||
    decoded.duration <= 0 ||
    decoded.duration > ticket.maxDuration
  )
    throw new Error(`Separe um trecho de até ${ticket.maxDuration} segundos por vez.`);
  const channels = Math.min(2, decoded.numberOfChannels);
  const ctx = new OfflineAudioContext(channels, Math.ceil(decoded.duration * 44100), 44100);
  const source = ctx.createBufferSource();
  source.buffer = decoded;
  source.connect(ctx.destination);
  source.start();
  const resampled = await ctx.startRendering();
  const wav = encodeStereoWav(
    Array.from({ length: channels }, (_, i) => resampled.getChannelData(i)),
    44100,
  );
  options.signal?.throwIfAborted();
  onProgress?.(0.2);
  const result = await runStemJob(ticket, wav, options);
  options.onStage?.("Limpando vazamento musical da voz…");
  const cleanedVoice = await cleanVoiceBlob(result.voice, result.music, 44100);
  onProgress?.(1);
  return { ...result, voice: cleanedVoice, sampleRate: 44100 };
}

export function levelOf(samples: Float32Array): number {
  return Math.sqrt(
    samples.reduce((sum, value) => sum + value * value, 0) / Math.max(1, samples.length),
  );
}

/** Reduz vazamento musical residual na saída vocals do Demucs. O stem musical
 * permanece intocado; calculamos a projeção do stem de voz sobre a música e
 * removemos apenas essa parcela correlacionada, com limite conservador. */
export function suppressMusicBleed(
  voice: Float32Array[],
  music: Float32Array[],
  maxGain = 0.65,
): Float32Array[] {
  const channels = Math.min(voice.length, music.length);
  return Array.from({ length: channels }, (_, channel) => {
    const source = voice[channel]!;
    const bed = music[channel]!;
    const n = Math.min(source.length, bed.length);
    let cross = 0;
    let bedEnergy = 0;
    for (let i = 0; i < n; i++) {
      cross += source[i]! * bed[i]!;
      bedEnergy += bed[i]! * bed[i]!;
    }
    const gain = Math.max(0, Math.min(maxGain, bedEnergy > 1e-8 ? cross / bedEnergy : 0));
    const clean = new Float32Array(source);
    for (let i = 0; i < n; i++) clean[i] = Math.max(-1, Math.min(1, source[i]! - gain * bed[i]!));
    return clean;
  });
}

async function cleanVoiceBlob(voice: Blob, music: Blob, sampleRate: number): Promise<Blob> {
  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return voice;
  const context = new AudioCtx();
  try {
    const [voiceBuffer, musicBuffer] = await Promise.all([
      context.decodeAudioData(await voice.arrayBuffer()),
      context.decodeAudioData(await music.arrayBuffer()),
    ]);
    const channels = Math.min(2, voiceBuffer.numberOfChannels, musicBuffer.numberOfChannels);
    const cleaned = suppressMusicBleed(
      Array.from({ length: channels }, (_, i) => voiceBuffer.getChannelData(i)),
      Array.from({ length: channels }, (_, i) => musicBuffer.getChannelData(i)),
    );
    return encodeStereoWav(cleaned, sampleRate);
  } catch {
    return voice;
  } finally {
    await context.close();
  }
}
