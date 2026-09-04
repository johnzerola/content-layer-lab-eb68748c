/**
 * REMOVEDOR DE SILÊNCIO (análise real da onda de áudio)
 *
 * Diferente da detecção por transcrição, aqui lemos o áudio do arquivo e
 * medimos o volume janela a janela (RMS). Isso pega pausas, respiração e
 * trechos mudos mesmo sem transcrição — é o mesmo princípio do auto-editor.
 */

export interface SilenceOptions {
  /** limiar relativo ao volume da fala (0..1); menor = mais tolerante */
  threshold: number;
  /** pausa mínima para ser cortada (s) */
  minSilence: number;
  /** margem mantida antes/depois da fala (s) */
  padding: number;
  /** trecho mínimo de fala mantido (s) */
  minSpeech: number;
}

export const DEFAULT_SILENCE: SilenceOptions = {
  threshold: 0.06,
  minSilence: 0.35,
  padding: 0.08,
  minSpeech: 0.2,
};

export interface Range {
  start: number;
  end: number;
}

export interface SilenceAnalysis {
  duration: number;
  /** amostras de volume (0..1), uma a cada `hop` segundos — serve de forma de onda */
  levels: number[];
  hop: number;
  peak: number;
}

const WINDOW = 0.02; // 20 ms

/** Lê o áudio do arquivo e devolve a curva de volume. */
export async function analyzeAudio(file: File | Blob): Promise<SilenceAnalysis> {
  const Ctx =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ac = new Ctx();
  try {
    const buf = await ac.decodeAudioData(await file.arrayBuffer());
    const data = buf.getChannelData(0);
    const rate = buf.sampleRate;
    const win = Math.max(1, Math.round(WINDOW * rate));
    const levels: number[] = [];
    let peak = 0;
    for (let i = 0; i < data.length; i += win) {
      let sum = 0;
      const end = Math.min(data.length, i + win);
      for (let j = i; j < end; j++) sum += data[j]! * data[j]!;
      const rms = Math.sqrt(sum / Math.max(1, end - i));
      levels.push(rms);
      if (rms > peak) peak = rms;
    }
    return { duration: buf.duration, levels, hop: WINDOW, peak };
  } finally {
    void ac.close();
  }
}

/** Trechos de silêncio detectados na curva de volume. */
export function findSilences(a: SilenceAnalysis, opts: SilenceOptions = DEFAULT_SILENCE): Range[] {
  if (!a.levels.length) return [];
  // referência = volume típico da fala (percentil 85), não o pico absoluto
  const sorted = [...a.levels].sort((x, y) => x - y);
  const speech = sorted[Math.floor(sorted.length * 0.85)] ?? a.peak;
  const floor = sorted[Math.floor(sorted.length * 0.1)] ?? 0;
  const limit = Math.max(floor * 1.6, speech * Math.max(0.01, opts.threshold));

  const out: Range[] = [];
  let start: number | null = null;
  for (let i = 0; i < a.levels.length; i++) {
    const quiet = a.levels[i]! < limit;
    if (quiet && start === null) start = i * a.hop;
    if (!quiet && start !== null) {
      const end = i * a.hop;
      if (end - start >= opts.minSilence) out.push({ start, end });
      start = null;
    }
  }
  if (start !== null) {
    const end = a.levels.length * a.hop;
    if (end - start >= opts.minSilence) out.push({ start, end });
  }

  // aplica a margem de respiro em volta da fala
  return out
    .map((r) => ({ start: r.start + opts.padding, end: r.end - opts.padding }))
    .filter((r) => r.end - r.start >= Math.max(0.05, opts.minSilence * 0.5));
}

/** Converte os silêncios em trechos mantidos (o que sobra do vídeo). */
export function keepRanges(duration: number, silences: Range[], opts: SilenceOptions = DEFAULT_SILENCE): Range[] {
  const keep: Range[] = [];
  let cursor = 0;
  for (const s of silences) {
    if (s.start > cursor) keep.push({ start: cursor, end: Math.min(s.start, duration) });
    cursor = Math.max(cursor, s.end);
  }
  if (cursor < duration) keep.push({ start: cursor, end: duration });
  return keep.filter((r) => r.end - r.start >= opts.minSpeech);
}

export function totalOf(ranges: Range[]): number {
  return ranges.reduce((sum, r) => sum + Math.max(0, r.end - r.start), 0);
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
