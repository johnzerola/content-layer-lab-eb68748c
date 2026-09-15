/**
 * Biblioteca de mídia do ChatScene.
 *
 * Guarda o que o usuário já enviou nesta conversa (fotos, figurinhas, vídeos,
 * logos e fundos) para poder reaproveitar com um clique. O mesmo arquivo nunca
 * é enviado duas vezes: a identificação é pelo conteúdo, não pelo nome.
 */
import { uploadChatSceneMedia, type UploadedMedia } from "./upload";

export type AssetRole = "message" | "avatar" | "background" | "logo";

export interface LibraryAsset {
  /** impressão digital do conteúdo do arquivo */
  hash: string;
  url: string;
  name: string;
  mime: string;
  size: number;
  aspect: number | null;
  role: AssetRole;
  temporary: boolean;
  addedAt: number;
}

const STORAGE_KEY = "chatscene.assets.v1";
const MAX_ITEMS = 60;

async function fingerprint(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  if (typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const digest = await crypto.subtle.digest("SHA-256", buffer);
      return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      /* segue para a soma simples */
    }
  }
  const bytes = new Uint8Array(buffer);
  let h = 2166136261;
  const step = Math.max(1, Math.floor(bytes.length / 4096));
  for (let i = 0; i < bytes.length; i += step) h = (Math.imul(h ^ bytes[i]!, 16777619) >>> 0);
  return `${h.toString(16)}-${bytes.length.toString(16)}`;
}

export function readLibrary(): LibraryAsset[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as LibraryAsset[]) : [];
    return Array.isArray(list) ? list.filter((a) => a && a.url && a.hash) : [];
  } catch {
    return [];
  }
}

function writeLibrary(list: LibraryAsset[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ITEMS)));
  } catch {
    /* sem espaço: a biblioteca apenas não persiste */
  }
}

export function removeAsset(hash: string): LibraryAsset[] {
  const next = readLibrary().filter((a) => a.hash !== hash);
  writeLibrary(next);
  return next;
}

/**
 * Envia o arquivo apenas se ele ainda não estiver na biblioteca; em qualquer
 * caso devolve o endereço utilizável e a lista atualizada.
 */
export async function addFileToLibrary(
  file: File,
  role: AssetRole = "message",
): Promise<{ asset: LibraryAsset; library: LibraryAsset[]; reused: boolean }> {
  const hash = await fingerprint(file);
  const library = readLibrary();
  const existing = library.find((a) => a.hash === hash && !a.temporary);
  if (existing) {
    const refreshed: LibraryAsset = { ...existing, addedAt: Date.now() };
    const next = [refreshed, ...library.filter((a) => a.hash !== hash)];
    writeLibrary(next);
    return { asset: refreshed, library: next, reused: true };
  }

  const uploaded: UploadedMedia = await uploadChatSceneMedia(file);
  const asset: LibraryAsset = {
    hash,
    url: uploaded.url,
    name: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
    aspect: uploaded.aspect,
    role,
    temporary: uploaded.temporary,
    addedAt: Date.now(),
  };
  const next = [asset, ...library.filter((a) => a.hash !== hash)];
  writeLibrary(next);
  return { asset, library: next, reused: false };
}
