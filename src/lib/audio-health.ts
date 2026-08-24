/**
 * Diagnóstico de áudio do corte: garante que o player nunca entregue um vídeo
 * mudo sem avisar e alimenta o painel de análise com números reais
 * (pico, volume médio, silêncio, clipping).
 */

export interface AudioHealth {
  /** o arquivo tem faixa de áudio decodificável */
  hasAudio: boolean;
  /** pico absoluto (0–1) */
  peak: number;
  /** volume médio RMS (0–1) */
  rms: number;
  /** volume médio em dBFS (−60 a 0) */
  dbfs: number;
  /** proporção do tempo abaixo do limiar de fala (0–1) */
  silenceRatio: number;
  /** proporção de amostras estouradas (0–1) */
  clipping: number;
  /** nota geral de qualidade sonora (0–1) */
  score: number;
  /** mensagens prontas para a UI */
  issues: string[];
}

const SILENT_PEAK = 0.004;

export function emptyHealth(reason: string): AudioHealth {
  return {
    hasAudio: false,
    peak: 0,
    rms: 0,
    dbfs: -60,
    silenceRatio: 1,
    clipping: 0,
    score: 0,
    issues: [reason],
  };
}

/** Analisa o áudio de um trecho do arquivo (ou do arquivo inteiro). */
export async function analyzeAudio(
  file: Blob,
  range?: { start: number; end: number },
): Promise<AudioHealth> {
  const Ctx =
    typeof window !== "undefined"
      ? (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined;
  if (!Ctx) return emptyHealth("Análise de áudio indisponível neste navegador.");

  let buf: AudioBuffer;
  const ac = new Ctx();
  try {
    buf = await ac.decodeAudioData(await file.arrayBuffer());
  } catch {
    return emptyHealth("Este vídeo não tem faixa de áudio legível (ou o codec não é suportado).");
  } finally {
    void ac.close();
  }

  const ch = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const i0 = Math.max(0, Math.floor((range?.start ?? 0) * sr));
  const i1 = Math.min(ch.length, Math.floor((range?.end ?? buf.duration) * sr));
  if (i1 - i0 < sr * 0.1) return emptyHealth("Trecho curto demais para analisar o áudio.");

  let peak = 0;
  let sumSq = 0;
  let clipped = 0;
  let n = 0;
  const frame = Math.floor(sr * 0.03);
  const frameRms: number[] = [];
  let frameSum = 0;
  let frameN = 0;

  for (let i = i0; i < i1; i++) {
    const v = ch[i] ?? 0;
    const a = Math.abs(v);
    if (a > peak) peak = a;
    if (a > 0.995) clipped++;
    sumSq += v * v;
    frameSum += v * v;
    n++;
    if (++frameN >= frame) {
      frameRms.push(Math.sqrt(frameSum / frameN));
      frameSum = 0;
      frameN = 0;
    }
  }
  if (frameN > 0) frameRms.push(Math.sqrt(frameSum / frameN));

  const rms = Math.sqrt(sumSq / Math.max(1, n));
  const dbfs = rms > 0 ? Math.max(-60, 20 * Math.log10(rms)) : -60;
  const speechThr = Math.max(0.008, rms * 0.35);
  const silenceRatio = frameRms.length
    ? frameRms.filter((r) => r < speechThr).length / frameRms.length
    : 1;
  const clipping = clipped / Math.max(1, n);
  const hasAudio = peak >= SILENT_PEAK;

  const issues: string[] = [];
  if (!hasAudio) issues.push("Sem sinal de áudio: o vídeo está mudo.");
  else {
    if (dbfs < -32) issues.push("Áudio muito baixo — normalize antes de publicar.");
    if (dbfs > -8) issues.push("Áudio muito alto, risco de distorção nas redes.");
    if (clipping > 0.002) issues.push("Picos estourados detectados (clipping).");
    if (silenceRatio > 0.55) issues.push("Mais da metade do corte é silêncio — considere aparar.");
  }

  // nota: nível ideal por volta de −18 dBFS, pouco silêncio, sem clipping
  const level = 1 - Math.min(1, Math.abs(dbfs + 18) / 22);
  const quiet = 1 - Math.min(1, silenceRatio / 0.7);
  const clean = 1 - Math.min(1, clipping / 0.01);
  const score = hasAudio ? Math.max(0, Math.min(1, level * 0.5 + quiet * 0.3 + clean * 0.2)) : 0;

  return { hasAudio, peak, rms, dbfs, silenceRatio, clipping, score, issues };
}

/** Diz se o elemento de vídeo está realmente emitindo som. */
export function isElementAudible(el: HTMLMediaElement) {
  return !el.muted && el.volume > 0.01;
}

/**
 * Destrava o áudio depois do primeiro gesto do usuário — resolve o caso em que
 * o navegador bloqueia o autoplay com som e o player fica mudo em silêncio.
 */
export function unlockAudioOnGesture(apply: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => {
    apply();
    remove();
  };
  const remove = () => {
    window.removeEventListener("pointerdown", handler);
    window.removeEventListener("keydown", handler);
  };
  window.addEventListener("pointerdown", handler, { once: true });
  window.addEventListener("keydown", handler, { once: true });
  return remove;
}
