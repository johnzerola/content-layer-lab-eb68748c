import type { CaptionCue, CaptionWord } from "./captions";

/** Reordena/normaliza blocos a partir das palavras. */
export function normalizeCues(cues: CaptionCue[]): CaptionCue[] {
  return cues
    .map((c) => {
      const words = [...c.words].sort((a, b) => a.start - b.start);
      return {
        start: words[0]?.start ?? c.start,
        end: words[words.length - 1]?.end ?? c.end,
        words,
      };
    })
    .filter((c) => c.words.length)
    .sort((a, b) => a.start - b.start);
}

/** Desloca todas as legendas em `delta` segundos. */
export function shiftAll(cues: CaptionCue[], delta: number): CaptionCue[] {
  const f = (t: number) => Math.max(0, t + delta);
  return normalizeCues(
    cues.map((c) => ({
      start: f(c.start),
      end: f(c.end),
      words: c.words.map((w) => ({ ...w, start: f(w.start), end: f(w.end) })),
    })),
  );
}

/** Desloca só um bloco. */
export function shiftCue(cues: CaptionCue[], index: number, delta: number): CaptionCue[] {
  return normalizeCues(
    cues.map((c, i) =>
      i === index
        ? {
            ...c,
            words: c.words.map((w) => ({
              ...w,
              start: Math.max(0, w.start + delta),
              end: Math.max(0.05, w.end + delta),
            })),
          }
        : c,
    ),
  );
}

/** Texto plano de um bloco. */
export function cueText(cue: CaptionCue): string {
  return cue.words.map((w) => w.text).join(" ");
}

/**
 * Reescreve o texto de um bloco (correção gramatical) mantendo a sincronia:
 * se o número de palavras não mudar, os tempos originais são preservados;
 * caso contrário o tempo do bloco é redistribuído pelo tamanho das palavras.
 */
export function retextCue(cue: CaptionCue, text: string): CaptionCue {
  const parts = text.split(/\s+/).filter(Boolean);
  if (!parts.length) return cue;
  if (parts.length === cue.words.length) {
    return { ...cue, words: cue.words.map((w, i) => ({ ...w, text: parts[i]! })) };
  }
  const start = cue.start;
  const span = Math.max(0.2, cue.end - cue.start);
  const weights = parts.map((p) => Math.max(2, p.length));
  const total = weights.reduce((a, b) => a + b, 0);
  let t = start;
  const words: CaptionWord[] = parts.map((p, i) => {
    const d = (span * weights[i]!) / total;
    const w = { text: p, start: t, end: t + Math.max(0.08, d - 0.02) };
    t += d;
    return w;
  });
  return { start, end: words[words.length - 1]!.end, words };
}

/** Junta um bloco com o seguinte. */
export function mergeWithNext(cues: CaptionCue[], index: number): CaptionCue[] {
  const a = cues[index];
  const b = cues[index + 1];
  if (!a || !b) return cues;
  const merged: CaptionCue = { start: a.start, end: b.end, words: [...a.words, ...b.words] };
  return normalizeCues([...cues.slice(0, index), merged, ...cues.slice(index + 2)]);
}

/** Divide um bloco antes da palavra `wordIndex`. */
export function splitCueAt(cues: CaptionCue[], index: number, wordIndex: number): CaptionCue[] {
  const c = cues[index];
  if (!c || wordIndex <= 0 || wordIndex >= c.words.length) return cues;
  const a = { ...c, words: c.words.slice(0, wordIndex) };
  const b = { ...c, words: c.words.slice(wordIndex) };
  return normalizeCues([...cues.slice(0, index), a, b, ...cues.slice(index + 1)]);
}

export function removeCue(cues: CaptionCue[], index: number): CaptionCue[] {
  return cues.filter((_, i) => i !== index);
}

/** Localizar e substituir em todas as palavras. */
export function replaceAll(
  cues: CaptionCue[],
  find: string,
  replace: string,
  caseSensitive = false,
): { cues: CaptionCue[]; count: number } {
  if (!find.trim()) return { cues, count: 0 };
  const esc = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(esc, caseSensitive ? "g" : "gi");
  let count = 0;
  const next = cues.map((c) => ({
    ...c,
    words: c.words.map((w) => {
      if (!re.test(w.text)) {
        re.lastIndex = 0;
        return w;
      }
      re.lastIndex = 0;
      count += 1;
      return { ...w, text: w.text.replace(re, replace) };
    }),
  }));
  return { cues: normalizeCues(next), count };
}

/** Correções ortográficas comuns de transcrição em pt-BR. */
const FIXES: [RegExp, string][] = [
  [/\bpra\b/gi, "para"],
  [/\bpro\b/gi, "para o"],
  [/\bta\b/gi, "está"],
  [/\btá\b/gi, "está"],
  [/\bto\b/gi, "estou"],
  [/\btô\b/gi, "estou"],
  [/\bvc\b/gi, "você"],
  [/\bvcs\b/gi, "vocês"],
  [/\bq\b/gi, "que"],
  [/\bpq\b/gi, "porque"],
  [/\bnao\b/gi, "não"],
  [/\bvoce\b/gi, "você"],
  [/\bentao\b/gi, "então"],
  [/\btambem\b/gi, "também"],
  [/\bé\s+é\b/gi, "é"],
];

/** Passa um "corretor rápido" no texto todo. */
export function autoFixText(cues: CaptionCue[]): { cues: CaptionCue[]; count: number } {
  let count = 0;
  const next = cues.map((c) => ({
    ...c,
    words: c.words.map((w) => {
      let t = w.text;
      for (const [re, to] of FIXES) t = t.replace(re, to);
      if (t !== w.text) count += 1;
      return { ...w, text: t };
    }),
  }));
  return { cues: next, count };
}

/** Reagrupa as legendas em blocos de no máximo `perCue` palavras. */
export function regroup(cues: CaptionCue[], perCue: number): CaptionCue[] {
  const words = cues.flatMap((c) => c.words).sort((a, b) => a.start - b.start);
  const out: CaptionCue[] = [];
  for (let i = 0; i < words.length; i += perCue) {
    const chunk = words.slice(i, i + perCue);
    if (!chunk.length) continue;
    out.push({ start: chunk[0]!.start, end: chunk[chunk.length - 1]!.end, words: chunk });
  }
  return out;
}

export const fmtTime = (t: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
};
