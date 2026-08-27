/**
 * Preparo da faixa de áudio na thread principal (workers não têm AudioContext).
 *
 * O arquivo é decodificado uma única vez por vídeo (cache de análise) e cada
 * variação apenas remonta os trechos com velocidade/tom/EQ próprios — muito
 * mais rápido do que decodificar o MP4 inteiro a cada exportação.
 */
import { analysisCache, fileKey } from "./analysis-cache";

export interface AudioTrack {
  rendered: AudioBuffer;
  channels: number;
  sampleRate: number;
}

export interface AudioPcm {
  planes: Float32Array[];
  sampleRate: number;
  channels: number;
}

export interface Envelope {
  data: Float32Array;
  rate: number;
}

/** Decodifica o áudio do arquivo (cacheado entre variações). */
export function decodeSourceAudio(file: File): Promise<AudioBuffer | null> {
  return analysisCache(`audio:${fileKey(file)}`, async () => {
    try {
      const buf = await file.arrayBuffer();
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new Ctx();
      const decoded = await ac.decodeAudioData(buf);
      void ac.close();
      return decoded.length ? decoded : null;
    } catch {
      return null;
    }
  });
}

/** Remonta os trechos mantidos com a velocidade/tom/EQ desta variação. */
export async function renderAudioTrack(
  file: File,
  segments: { start: number; end: number }[],
  speed: number,
  pitchCents = 0,
  eqDb = 0,
): Promise<AudioTrack | null> {
  try {
    const decoded = await decodeSourceAudio(file);
    if (!decoded) return null;

    const sampleRate = 48000;
    const channels = Math.min(2, decoded.numberOfChannels);
    const dur = segments.reduce((a, s) => a + Math.max(0, s.end - s.start), 0);
    const outLen = Math.max(1, Math.floor((dur / speed) * sampleRate));
    const off = new OfflineAudioContext(channels, outLen, sampleRate);

    let cursor = 0;
    for (const seg of segments) {
      const len = Math.max(0, seg.end - seg.start);
      if (len <= 0.01) continue;
      const src = off.createBufferSource();
      src.buffer = decoded;
      src.playbackRate.value = speed;
      if (pitchCents) {
        try {
          src.detune.value = pitchCents;
        } catch {
          /* navegador sem detune */
        }
      }
      let node: AudioNode = src;
      if (eqDb) {
        const shelf = off.createBiquadFilter();
        shelf.type = "highshelf";
        shelf.frequency.value = 5200;
        shelf.gain.value = eqDb;
        node.connect(shelf);
        node = shelf;
      }
      node.connect(off.destination);
      src.start(cursor, seg.start, len);
      cursor += len / speed;
    }

    const rendered = await off.startRendering();
    return { rendered, channels, sampleRate };
  } catch {
    return null;
  }
}

/** Envoltória de energia do áudio (0..1), usada pelo movimento rítmico. */
export function audioEnvelope(buf: AudioBuffer, rate = 20): Envelope {
  const ch = buf.getChannelData(0);
  const step = Math.max(1, Math.floor(buf.sampleRate / rate));
  const out = new Float32Array(Math.max(1, Math.ceil(ch.length / step)));
  let peak = 1e-6;
  for (let i = 0, k = 0; i < ch.length; i += step, k++) {
    let sum = 0;
    const end = Math.min(ch.length, i + step);
    for (let j = i; j < end; j++) sum += ch[j]! * ch[j]!;
    const rms = Math.sqrt(sum / Math.max(1, end - i));
    out[k] = rms;
    if (rms > peak) peak = rms;
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.min(1, out[i]! / peak);
  return { data: out, rate };
}

export function envelopeAt(env: Envelope, t: number) {
  const i = Math.min(env.data.length - 1, Math.max(0, Math.round(t * env.rate)));
  return env.data[i] ?? 0;
}

/** Converte a faixa em planos transferíveis para o worker. */
export function toPcm(track: AudioTrack): AudioPcm {
  const planes: Float32Array[] = [];
  for (let c = 0; c < track.channels; c++) {
    planes.push(new Float32Array(track.rendered.getChannelData(c)));
  }
  return { planes, sampleRate: track.sampleRate, channels: track.channels };
}
