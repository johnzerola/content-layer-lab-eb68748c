import { asProjectTime, type CaptionCue, type Clip } from "./types";
import type { CaptionPresetDefinition } from "./library";

export function parseTimedText(input: string): Array<{ start: number; end: number; text: string }> {
  const normalized = input.replace(/^\uFEFF/, "").replace(/\r/g, "").replace(/^WEBVTT[^\n]*\n+/, "");
  return normalized.split(/\n{2,}/).flatMap((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) return [];
    const [startRaw, endRaw] = lines[timingIndex]!.split("-->").map((value) => value.trim().split(/\s+/)[0]);
    if (!startRaw || !endRaw) return [];
    const start = parseCaptionTime(startRaw), end = parseCaptionTime(endRaw);
    const text = lines.slice(timingIndex + 1).join(" ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    return Number.isFinite(start) && Number.isFinite(end) && end > start && text ? [{ start, end, text }] : [];
  });
}

export function createCaptionBatch(rows: Array<{ start: number; end: number; text: string }>, preset: CaptionPresetDefinition, serial: number) {
  return rows.map((row, index): { cue: CaptionCue; clip: Clip } => {
    const tokens = row.text.split(/\s+/).filter(Boolean);
    const cueId = `cue-import-${serial}-${index + 1}`;
    const duration = row.end - row.start;
    const cue: CaptionCue = { id: cueId, start: asProjectTime(row.start), end: asProjectTime(row.end), text: row.text, styleId: preset.id, animationId: preset.motion, words: tokens.map((text, wordIndex) => ({ id: `${cueId}-word-${wordIndex + 1}`, text, start: asProjectTime(row.start + duration * wordIndex / tokens.length), end: asProjectTime(row.start + duration * (wordIndex + 1) / tokens.length) })) };
    const clip: Clip = { id: `caption-import-${serial}-${index + 1}`, kind: "caption", trackId: "track-captions", name: row.text, projectStart: cue.start, projectEnd: cue.end, sourceIn: 0, sourceOut: duration, playbackRate: 1, enabled: true, effects: [], animations: [], transform: structuredClone(preset.transform), style: { ...structuredClone(preset.style), text: row.text }, metadata: { captionCueId: cueId, captionPresetId: preset.id, captionPreset: structuredClone(preset), importedTimedText: true } };
    return { cue, clip };
  });
}

export function createCaptionBatchFromTimedWords(
  rows: Array<{ start: number; end: number; words: Array<{ start: number; end: number; text: string }> }>,
  preset: CaptionPresetDefinition,
  serial: number,
) {
  return rows.map((row, index): { cue: CaptionCue; clip: Clip } => {
    const text = row.words.map((word) => word.text).join(" ").trim();
    const [entry] = createCaptionBatch([{ start: row.start, end: row.end, text }], preset, serial + index);
    if (!entry) throw new Error("Legenda automática sem conteúdo válido.");
    entry.cue.words = row.words.map((word, wordIndex) => ({
      id: `${entry.cue.id}-word-${wordIndex + 1}`,
      text: word.text,
      start: asProjectTime(word.start),
      end: asProjectTime(word.end),
    }));
    entry.clip.metadata = { ...entry.clip.metadata, importedTimedText: false, generatedTranscript: true };
    return entry;
  });
}

function parseCaptionTime(value: string): number {
  const parts = value.replace(",", ".").split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return Number.NaN;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return Number.NaN;
}
