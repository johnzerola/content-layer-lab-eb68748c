/**
 * Cortes reais: metadados persistidos (localStorage) + registro em memória do
 * arquivo de origem, usado pela renderização real dos projetos.
 */
import type { Clip } from "@/lib/clips";
import type { BindableVideoSource } from "@/lib/video-template/types";

export interface CutRecord {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  start: number;
  end: number;
  score: number;
  text?: string | undefined;
  createdAt: string;
}

const KEY = "vaiviral.cuts.v1";
const files = new Map<string, File>();

export function cutDuration(cut: CutRecord): number {
  return Math.max(0, cut.end - cut.start);
}

/** Guarda o arquivo original em memória para render/prévia nesta sessão. */
export function registerSourceFile(sourceId: string, file: File) {
  files.set(sourceId, file);
}

export function getSourceFile(sourceId: string): File | null {
  return files.get(sourceId) ?? null;
}

export function sourceIdFor(file: File): string {
  return `src-${file.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${file.size}`;
}

export function loadCuts(): CutRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as CutRecord[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveCuts(cuts: CutRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(cuts.slice(0, 300)));
}

export function upsertCuts(next: CutRecord[]): CutRecord[] {
  const current = loadCuts();
  const byId = new Map(current.map((c) => [c.id, c]));
  for (const c of next) byId.set(c.id, c);
  const merged = [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  saveCuts(merged);
  return merged;
}

export function removeCut(id: string): CutRecord[] {
  const next = loadCuts().filter((c) => c.id !== id);
  saveCuts(next);
  return next;
}

export function cutsFromClips(clips: Clip[], file: File): CutRecord[] {
  const sourceId = sourceIdFor(file);
  const createdAt = new Date().toISOString();
  return clips.map((clip, i) => ({
    id: `${sourceId}-${Math.round(clip.start * 100)}-${i}`,
    sourceId,
    sourceName: file.name,
    title: clip.title ?? `Corte ${i + 1}`,
    start: clip.start,
    end: clip.end,
    score: Math.round(clip.score),
    text: clip.text,
    createdAt,
  }));
}

/** Converte um corte no source usado para resolver os bindings do template. */
export function cutAsSource(cut: CutRecord, videoUrl?: string | null): BindableVideoSource {
  return {
    id: cut.id,
    title: cut.title,
    videoUrl: videoUrl ?? null,
    duration: cutDuration(cut),
  };
}

/** Metadados do corte guardados no instance_data para render posterior. */
export interface CutBinding {
  cutId: string;
  sourceId: string;
  sourceName: string;
  start: number;
  end: number;
  title: string;
}

export function cutBinding(cut: CutRecord): CutBinding {
  return {
    cutId: cut.id,
    sourceId: cut.sourceId,
    sourceName: cut.sourceName,
    start: cut.start,
    end: cut.end,
    title: cut.title,
  };
}

export function readCutBinding(settings: Record<string, unknown> | undefined): CutBinding | null {
  const raw = settings?.["cut"];
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<CutBinding>;
  if (typeof c.sourceId !== "string" || typeof c.start !== "number" || typeof c.end !== "number") return null;
  return {
    cutId: c.cutId ?? "",
    sourceId: c.sourceId,
    sourceName: c.sourceName ?? "",
    start: c.start,
    end: c.end,
    title: c.title ?? "",
  };
}
