/**
 * SEPARAÇÃO DE ÁUDIO EM TRILHAS (voz e música).
 *
 * Roda 100% no navegador com Web Audio, sem servidor e sem enviar o vídeo
 * para lugar nenhum:
 *  1. o áudio é decodificado e reamostrado (32 kHz) para ficar leve;
 *  2. a VOZ é extraída do centro do estéreo (mid) com passa-banda de fala;
 *  3. a MÚSICA é o resíduo (original − voz), então voz + música reconstroem
 *     o áudio original — nada é perdido.
 *
 * O resultado vira dois WAV independentes para o usuário controlar volume,
 * fade, mudo e ducking de cada trilha separadamente.
 */

export interface StemOptions {
  /** frequência mínima da fala (Hz) */
  lowCut: number;
  /** frequência máxima da fala (Hz) */
  highCut: number;
  /** quanto do centro do estéreo é considerado voz (0..1) */
  centerFocus: number;
}

export const DEFAULT_STEMS: StemOptions = { lowCut: 130, highCut: 7200, centerFocus: 1 };

export interface StemResult {
  voice: Blob;
  music: Blob;
  duration: number;
  sampleRate: number;
}

const TARGET_RATE = 32000;

function toMono(buffer: AudioBuffer): Float32Array {
  const n = buffer.length;
  const out = new Float32Array(n);
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < n; i += 1) out[i]! += data[i]! / buffer.numberOfChannels;
  }
  return out;
}

/** Centro do estéreo (mid): onde a voz normalmente está. */
function midChannel(buffer: AudioBuffer, focus: number): Float32Array {
  if (buffer.numberOfChannels < 2) return toMono(buffer);
  const l = buffer.getChannelData(0);
  const r = buffer.getChannelData(1);
  const out = new Float32Array(buffer.length);
  for (let i = 0; i < out.length; i += 1) {
    const mid = (l[i]! + r[i]!) / 2;
    const side = (l[i]! - r[i]!) / 2;
    out[i] = mid - side * focus * 0.5;
  }
  return out;
}

function bufferFrom(ctx: BaseAudioContext, data: Float32Array, rate: number): AudioBuffer {
  const buf = ctx.createBuffer(1, data.length, rate);
  buf.getChannelData(0).set(data);
  return buf;
}

/** WAV PCM 16 bits mono — formato aceito por qualquer player e pela exportação. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([bytes], { type: "audio/wav" });
}

/** Decodifica o áudio de um arquivo de vídeo/áudio já reamostrado. */
async function decode(file: Blob): Promise<AudioBuffer> {
  const bytes = await file.arrayBuffer();
  const Ctor: typeof AudioContext =
    (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();
  try {
    return await ctx.decodeAudioData(bytes.slice(0));
  } finally {
    void ctx.close();
  }
}

/**
 * Separa o áudio do arquivo em duas trilhas: voz e música/ambiente.
 * `onProgress` recebe 0..1 apenas para a barra de status.
 */
export async function separateStems(
  file: Blob,
  options: Partial<StemOptions> = {},
  onProgress?: (p: number) => void,
): Promise<StemResult> {
  const opts = { ...DEFAULT_STEMS, ...options };
  onProgress?.(0.05);
  const decoded = await decode(file);
  onProgress?.(0.35);

  const rate = Math.min(TARGET_RATE, decoded.sampleRate);
  const length = Math.max(1, Math.ceil(decoded.duration * rate));

  // 1) mid (centro) reamostrado
  const midCtx = new OfflineAudioContext(1, length, rate);
  const midSrc = midCtx.createBufferSource();
  midSrc.buffer = bufferFrom(midCtx, midChannel(decoded, opts.centerFocus), decoded.sampleRate);
  const hp = midCtx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = opts.lowCut;
  hp.Q.value = 0.7;
  const lp = midCtx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = opts.highCut;
  lp.Q.value = 0.7;
  const presence = midCtx.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 2400;
  presence.Q.value = 0.9;
  presence.gain.value = 3;
  midSrc.connect(hp).connect(lp).connect(presence).connect(midCtx.destination);
  midSrc.start();
  const voiceBuf = await midCtx.startRendering();
  onProgress?.(0.7);

  // 2) mistura original reamostrada, para calcular o resíduo
  const fullCtx = new OfflineAudioContext(1, length, rate);
  const fullSrc = fullCtx.createBufferSource();
  fullSrc.buffer = bufferFrom(fullCtx, toMono(decoded), decoded.sampleRate);
  fullSrc.connect(fullCtx.destination);
  fullSrc.start();
  const fullBuf = await fullCtx.startRendering();
  onProgress?.(0.85);

  const voice = voiceBuf.getChannelData(0);
  const full = fullBuf.getChannelData(0);
  const music = new Float32Array(full.length);
  for (let i = 0; i < full.length; i += 1) music[i] = full[i]! - (voice[i] ?? 0);

  const result: StemResult = {
    voice: encodeWav(voice, rate),
    music: encodeWav(music, rate),
    duration: decoded.duration,
    sampleRate: rate,
  };
  onProgress?.(1);
  return result;
}

/** Energia média (0..1) — usada só para mostrar o quanto cada trilha "pesa". */
export function levelOf(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i]! * samples[i]!;
  return Math.sqrt(sum / Math.max(1, samples.length));
}
