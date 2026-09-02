/**
 * Modelo e lógica pura da TRANSCRIÇÃO do editor profissional.
 * Nada aqui toca no Supabase nem no DOM — é testável isoladamente.
 */

export interface TranscriptWord {
  id: string;
  word: string;
  start: number;
  end: number;
  confidence?: number;
  speaker?: string | null;
  /** palavra removida pelo usuário (edição não destrutiva) */
  removed?: boolean;
}

export interface TranscriptScene {
  id: string;
  label: string;
  start: number;
  end: number;
}

export interface TranscriptDoc {
  id: string | null;
  videoId: string;
  language: string;
  duration: number;
  words: TranscriptWord[];
  scenes: TranscriptScene[];
  speakers: string[];
}

export interface TimeRange {
  start: number;
  end: number;
}

let seq = 0;
export function wid(): string {
  seq += 1;
  return `w${Date.now().toString(36)}${seq.toString(36)}`;
}

export function emptyTranscript(videoId: string, language = "pt-BR"): TranscriptDoc {
  return { id: null, videoId, language, duration: 0, words: [], scenes: [], speakers: [] };
}

/** Constrói a transcrição a partir de cues com palavras cronometradas. */
export function transcriptFromCues(
  videoId: string,
  cues: { start: number; end: number; words: { start: number; end: number; text: string }[] }[],
  language = "pt-BR",
): TranscriptDoc {
  const words: TranscriptWord[] = [];
  for (const cue of cues) {
    for (const w of cue.words) {
      const text = w.text.trim();
      if (!text) continue;
      words.push({ id: wid(), word: text, start: w.start, end: w.end, confidence: 1 });
    }
  }
  const duration = words.length ? Math.max(...words.map((w) => w.end)) : 0;
  return { id: null, videoId, language, duration, words, scenes: autoScenes(words), speakers: [] };
}

/** Texto legível (ignora palavras removidas). */
export function transcriptText(doc: TranscriptDoc): string {
  return doc.words
    .filter((w) => !w.removed)
    .map((w) => w.word)
    .join(" ");
}

/** Palavra ativa em um instante. */
export function wordAt(doc: TranscriptDoc, time: number): TranscriptWord | null {
  return doc.words.find((w) => !w.removed && time >= w.start && time < w.end) ?? null;
}

/** Substitui o texto de uma palavra preservando o timing. */
export function editWord(doc: TranscriptDoc, id: string, next: string): TranscriptDoc {
  const text = next.trim();
  return {
    ...doc,
    words: doc.words.map((w) => (w.id === id ? { ...w, word: text || w.word } : w)),
  };
}

/** Marca palavras como removidas (não destrutivo: o timing continua conhecido). */
export function removeWords(doc: TranscriptDoc, ids: string[]): TranscriptDoc {
  const set = new Set(ids);
  return { ...doc, words: doc.words.map((w) => (set.has(w.id) ? { ...w, removed: true } : w)) };
}

export function restoreWords(doc: TranscriptDoc, ids: string[]): TranscriptDoc {
  const set = new Set(ids);
  return { ...doc, words: doc.words.map((w) => (set.has(w.id) ? { ...w, removed: false } : w)) };
}

/** Localizar e substituir em toda a transcrição. Retorna doc + total trocado. */
export function findReplace(
  doc: TranscriptDoc,
  from: string,
  to: string,
  { all = true, caseSensitive = false }: { all?: boolean; caseSensitive?: boolean } = {},
): { doc: TranscriptDoc; replaced: number } {
  const needle = from.trim();
  if (!needle) return { doc, replaced: 0 };
  const cmp = (a: string) => (caseSensitive ? a : a.toLowerCase());
  const target = cmp(needle);
  let replaced = 0;
  const words = doc.words.map((w) => {
    if (!all && replaced > 0) return w;
    if (cmp(w.word) !== target) return w;
    replaced += 1;
    return { ...w, word: to };
  });
  return { doc: { ...doc, words }, replaced };
}

/** Intervalos temporais que devem sair da timeline (palavras removidas, unidas). */
export function removedRanges(doc: TranscriptDoc, padding = 0.02): TimeRange[] {
  const raw = doc.words
    .filter((w) => w.removed)
    .map((w) => ({ start: Math.max(0, w.start - padding), end: w.end + padding }))
    .sort((a, b) => a.start - b.start);
  return mergeRanges(raw);
}

export function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  const out: TimeRange[] = [];
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + 0.001) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** Trechos que permanecem no vídeo depois dos cortes. */
export function keptRanges(duration: number, removed: TimeRange[]): TimeRange[] {
  const out: TimeRange[] = [];
  let cursor = 0;
  for (const r of mergeRanges(removed)) {
    if (r.start > cursor) out.push({ start: cursor, end: Math.min(r.start, duration) });
    cursor = Math.max(cursor, r.end);
  }
  if (cursor < duration) out.push({ start: cursor, end: duration });
  return out.filter((r) => r.end - r.start > 0.01);
}

export function keptDuration(duration: number, removed: TimeRange[]): number {
  return keptRanges(duration, removed).reduce((s, r) => s + (r.end - r.start), 0);
}

/** Silêncios entre palavras acima de um limiar. */
export function silenceRanges(doc: TranscriptDoc, minGap = 0.6): TimeRange[] {
  const words = doc.words.filter((w) => !w.removed);
  const out: TimeRange[] = [];
  for (let i = 1; i < words.length; i++) {
    const gap = words[i]!.start - words[i - 1]!.end;
    if (gap >= minGap) out.push({ start: words[i - 1]!.end + 0.05, end: words[i]!.start - 0.05 });
  }
  return out.filter((r) => r.end > r.start);
}

export const FILLER_WORDS = [
  "é",
  "eh",
  "ahn",
  "ah",
  "hum",
  "hmm",
  "tipo",
  "né",
  "então",
  "assim",
  "sabe",
  "tá",
  "uh",
];

/** Palavras de preenchimento detectadas. */
export function fillerWords(doc: TranscriptDoc, extra: string[] = []): TranscriptWord[] {
  const set = new Set([...FILLER_WORDS, ...extra].map((w) => w.toLowerCase()));
  return doc.words.filter((w) => !w.removed && set.has(normalizeWord(w.word)));
}

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[.,!?;:…"']/g, "").trim();
}

/** Agrupa a transcrição em cenas por pausas longas. */
export function autoScenes(words: TranscriptWord[], gap = 1.4): TranscriptScene[] {
  const scenes: TranscriptScene[] = [];
  let start: number | null = null;
  let prevEnd = 0;
  let index = 1;
  for (const w of words) {
    if (start === null) start = w.start;
    else if (w.start - prevEnd >= gap) {
      scenes.push({ id: wid(), label: `Cena ${index++}`, start, end: prevEnd });
      start = w.start;
    }
    prevEnd = w.end;
  }
  if (start !== null) scenes.push({ id: wid(), label: `Cena ${index}`, start, end: prevEnd });
  return scenes;
}

/** Blocos de leitura (parágrafos) para o modo Parágrafo. */
export interface TranscriptBlock {
  id: string;
  start: number;
  end: number;
  words: TranscriptWord[];
  text: string;
  speaker?: string | null;
}

export function transcriptBlocks(doc: TranscriptDoc, maxWords = 14, gap = 0.9): TranscriptBlock[] {
  const blocks: TranscriptBlock[] = [];
  let current: TranscriptWord[] = [];
  const flush = () => {
    if (!current.length) return;
    const words = current;
    blocks.push({
      id: words[0]!.id,
      start: words[0]!.start,
      end: words[words.length - 1]!.end,
      words,
      text: words.filter((w) => !w.removed).map((w) => w.word).join(" "),
      speaker: words[0]!.speaker ?? null,
    });
    current = [];
  };
  for (const w of doc.words) {
    const prev = current[current.length - 1];
    if (prev && (w.start - prev.end >= gap || current.length >= maxWords)) flush();
    current.push(w);
  }
  flush();
  return blocks.filter((b) => b.words.some((w) => !w.removed));
}

/** Aplica um texto editado a um bloco preservando o timing por palavra. */
export function applyBlockText(doc: TranscriptDoc, blockId: string, text: string, maxWords = 14): TranscriptDoc {
  const blocks = transcriptBlocks(doc, maxWords);
  const block = blocks.find((b) => b.id === blockId);
  if (!block) return doc;
  const tokens = text.split(/\s+/).filter(Boolean);
  const live = block.words.filter((w) => !w.removed);
  const byId = new Map<string, TranscriptWord>();

  if (tokens.length === live.length) {
    live.forEach((w, i) => byId.set(w.id, { ...w, word: tokens[i]! }));
  } else {
    // Redistribui os tokens no intervalo do bloco, mantendo o tempo total.
    const span = Math.max(0.001, block.end - block.start);
    const step = span / Math.max(1, tokens.length);
    live.forEach((w, i) => {
      const token = tokens[i];
      byId.set(w.id, token ? { ...w, word: token } : { ...w, removed: true });
    });
    if (tokens.length > live.length) {
      // acrescenta palavras novas ao final do bloco
      const extras = tokens.slice(live.length).map((token, i) => ({
        id: wid(),
        word: token,
        start: block.start + step * (live.length + i),
        end: block.start + step * (live.length + i + 1),
        confidence: 0.5,
      }));
      const lastId = block.words[block.words.length - 1]!.id;
      const words = doc.words.flatMap((w) => {
        const patched = byId.get(w.id) ?? w;
        return w.id === lastId ? [patched, ...extras] : [patched];
      });
      return { ...doc, words };
    }
  }
  return { ...doc, words: doc.words.map((w) => byId.get(w.id) ?? w) };
}
