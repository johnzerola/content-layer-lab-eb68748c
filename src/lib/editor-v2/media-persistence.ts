import { forgetSourceFile, persistSourceFile, readSourceFile } from "@/lib/editor/media-store";
import { normalizeProject } from "./project";
import type { EditorProjectV2, MediaAsset } from "./types";

const PROJECT_KEY_PREFIX = "vaiviral.editor-v2.project.";
const MEDIA_KEY_PREFIX = "editor-v2-media";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function editorMediaStorageKey(projectId: string, assetId: string) {
  return `${MEDIA_KEY_PREFIX}:${projectId}:${assetId}`;
}

export function editorMediaStoragePath(projectId: string, assetId: string) {
  return `indexeddb://${editorMediaStorageKey(projectId, assetId)}`;
}

export async function persistEditorMedia(projectId: string, assetId: string, file: File) {
  return persistSourceFile(editorMediaStorageKey(projectId, assetId), file);
}

export async function readEditorMedia(projectId: string, assetId: string) {
  return readSourceFile(editorMediaStorageKey(projectId, assetId));
}

export async function deleteEditorMedia(projectId: string, assetId: string) {
  await forgetSourceFile(editorMediaStorageKey(projectId, assetId));
}

export function serializeEditorProject(project: EditorProjectV2): string {
  const snapshot = structuredClone(project);
  snapshot.revisions.saved = snapshot.revisions.document;
  for (const asset of snapshot.assets) {
    if (asset.sourceUrl?.startsWith("blob:")) delete asset.sourceUrl;
    if (asset.proxyUrl?.startsWith("blob:")) delete asset.proxyUrl;
    if (asset.thumbnailUrl?.startsWith("blob:")) delete asset.thumbnailUrl;
  }
  return JSON.stringify(snapshot);
}

export function persistEditorProject(project: EditorProjectV2, storage: StorageLike = window.localStorage): boolean {
  try {
    storage.setItem(`${PROJECT_KEY_PREFIX}${project.id}`, serializeEditorProject(project));
    return true;
  } catch {
    return false;
  }
}

export function readEditorProject(projectId: string, storage: StorageLike = window.localStorage): EditorProjectV2 | null {
  try {
    const raw = storage.getItem(`${PROJECT_KEY_PREFIX}${projectId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EditorProjectV2>;
    if (parsed.version !== 2 || parsed.id !== projectId || !Array.isArray(parsed.assets) || !Array.isArray(parsed.tracks)) return null;
    return normalizeProject(parsed as EditorProjectV2);
  } catch {
    return null;
  }
}

export function isLocalEditorAsset(asset: MediaAsset) {
  return asset.license.provider === "Arquivo local"
    || asset.storagePath?.startsWith("local-session://")
    || asset.storagePath?.startsWith("indexeddb://");
}

export function validateRelinkFile(asset: MediaAsset, file: File): { ok: true } | { ok: false; reason: string } {
  const expectedKind = asset.kind === "video" ? "video/" : asset.kind === "audio" ? "audio/" : asset.kind === "image" ? "image/" : "";
  if (!expectedKind || !file.type.startsWith(expectedKind)) return { ok: false, reason: `Escolha um arquivo de ${asset.kind === "video" ? "vídeo" : asset.kind === "audio" ? "áudio" : "imagem"}.` };
  if (!asset.hash) return { ok: true };
  const [, expectedSize] = asset.hash.match(/:(\d+):\d+$/) ?? [];
  if (expectedSize && file.size !== Number(expectedSize)) return { ok: false, reason: "O tamanho não corresponde à mídia original deste projeto." };
  return { ok: true };
}
