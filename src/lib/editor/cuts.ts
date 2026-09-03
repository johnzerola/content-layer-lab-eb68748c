/**
 * Cortes reais: metadados persistidos (localStorage) + registro em memória do
 * arquivo de origem, usado pela renderização real dos projetos.
 */
import type { Clip } from "@/lib/clips";
import { persistSourceFile, readSourceFile } from "@/lib/editor/media-store";
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

/** Guarda o arquivo original em memória (e no IndexedDB) para render/prévia. */
export function registerSourceFile(sourceId: string, file: File) {
  files.set(sourceId, file);
  void persistSourceFile(sourceId, file).catch(() => undefined);
}

export function getSourceFile(sourceId: string): File | null {
  return files.get(sourceId) ?? null;
}

/**
 * Recupera o arquivo de origem: memória primeiro, depois o IndexedDB — é o que
 * permite reabrir o projeto depois de recarregar a página.
 */
export async function loadSourceFile(sourceId: string): Promise<File | null> {
  const cached = files.get(sourceId);
  if (cached) return cached;
  const stored = await readSourceFile(sourceId);
  if (stored) files.set(sourceId, stored);
  return stored;
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

/** Gera uma miniatura JPEG (data URL) do vídeo em um instante do corte. */
export async function captureCutThumbnail(
  file: File,
  time: number,
  width = 320,
): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      const onErr = () => reject(new Error("Falha ao ler o vídeo."));
      video.onloadedmetadata = () => resolve();
      video.onerror = onErr;
    });
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      video.currentTime = Math.min(Math.max(0.1, time), Math.max(0.1, video.duration - 0.1));
    });
    const ratio = video.videoHeight / Math.max(1, video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.round(width * (ratio || 0.5625));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  } finally {
    video.src = "";
    URL.revokeObjectURL(url);
  }
}
