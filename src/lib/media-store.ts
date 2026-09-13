/**
 * MÍDIA NO ARMAZENAMENTO
 *
 * Imagens e áudios costumavam ser salvos colados dentro do registro (data URL),
 * o que inflava o banco. Aqui o arquivo vai para o armazenamento privado da
 * conta e o projeto guarda só uma referência curta: `storage:assets/<caminho>`.
 *
 * Só transporte de arquivo — nenhuma regra de negócio muda. Se o envio falhar,
 * tudo volta ao comportamento antigo (a própria data URL é devolvida).
 */
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "assets";
const PREFIX = `storage:${BUCKET}/`;
/** acima disso não vale a pena enviar inline (limite do bucket é 50 MB) */
const MAX_UPLOAD = 45 * 1024 * 1024;

const urlCache = new Map<string, { url: string; at: number }>();
const SIGNED_TTL = 60 * 60 * 24 * 7; // 7 dias
const CACHE_MS = 1000 * 60 * 60 * 6;

export function isStorageRef(value: string | null | undefined): value is string {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function isDataUrl(value: string | null | undefined): value is string {
  return typeof value === "string" && value.startsWith("data:");
}

function refToPath(ref: string): string {
  return ref.slice(PREFIX.length);
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "video/mp4": "mp4",
    "video/webm": "webm",
  };
  return map[mime] ?? (mime.split("/")[1] || "bin").replace(/[^a-z0-9]+/gi, "");
}

/** Converte uma data URL em Blob sem passar por fetch (funciona offline). */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const mime = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] ?? "";
  try {
    if (!isBase64) return new Blob([decodeURIComponent(payload)], { type: mime });
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

/**
 * Comprime imagens grandes antes do envio: redimensiona para no máximo
 * 1920px no maior lado e converte para WebP (qualidade 0.85). Só troca
 * quando o resultado fica menor que o original; qualquer falha devolve
 * o blob original. SVG/GIF animado e imagens pequenas passam direto.
 */
const MAX_IMAGE_SIDE = 1920;
const MIN_COMPRESS_BYTES = 200 * 1024;

async function compressImageIfWorthIt(blob: Blob): Promise<Blob> {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return blob;
  if (blob.type !== "image/png" && blob.type !== "image/jpeg") return blob;
  if (blob.size < MIN_COMPRESS_BYTES) return blob;
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return blob;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/webp", 0.85),
    );
    if (out && out.size < blob.size) return out;
  } catch {
    /* mantém o original */
  }
  return blob;
}

/**
 * Envia um Blob e devolve a referência `storage:assets/...`.
 * Devolve null quando não há sessão, o arquivo é grande demais ou o envio falha.
 */
export async function uploadMediaBlob(kind: string, blob: Blob): Promise<string | null> {
  if (!blob.size || blob.size > MAX_UPLOAD) return null;
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return null;
  const compressed = await compressImageIfWorthIt(blob);
  const ext = extFromMime(compressed.type || "application/octet-stream");
  const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = `${userId}/${kind}/${name}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: false,
    contentType: blob.type || "application/octet-stream",
  });
  if (error) return null;
  return `${PREFIX}${path}`;
}

/** Envia uma data URL. Devolve a referência, ou a própria data URL se não der. */
export async function uploadDataUrl(kind: string, dataUrl: string): Promise<string> {
  if (!isDataUrl(dataUrl)) return dataUrl;
  const blob = dataUrlToBlob(dataUrl);
  if (!blob) return dataUrl;
  const ref = await uploadMediaBlob(kind, blob);
  return ref ?? dataUrl;
}

/** Envia um arquivo escolhido pelo usuário; cai para data URL se o envio falhar. */
export async function uploadFileOrInline(kind: string, file: File | Blob): Promise<string> {
  const ref = await uploadMediaBlob(kind, file);
  if (ref) return ref;
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

/** Transforma a referência em URL utilizável. Qualquer outro valor passa direto. */
export async function resolveMediaUrl(value: string | null | undefined): Promise<string> {
  if (!value) return "";
  if (!isStorageRef(value)) return value;
  const cached = urlCache.get(value);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.url;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(refToPath(value), SIGNED_TTL);
  if (error || !data?.signedUrl) return "";
  urlCache.set(value, { url: data.signedUrl, at: Date.now() });
  return data.signedUrl;
}

/** URL já resolvida anteriormente (uso síncrono, sem rede). */
export function peekMediaUrl(value: string): string | null {
  const cached = urlCache.get(value);
  return cached && Date.now() - cached.at < CACHE_MS ? cached.url : null;
}

/**
 * Percorre um objeto salvo e troca toda mídia embutida (data URL) por
 * referência de armazenamento. Usado ao sincronizar conteúdo antigo.
 */
export async function externalizeDataUrls<T>(kind: string, value: T): Promise<T> {
  if (typeof value === "string") {
    return (isDataUrl(value) ? await uploadDataUrl(kind, value) : value) as T;
  }
  if (Array.isArray(value)) {
    return (await Promise.all(value.map((v) => externalizeDataUrls(kind, v)))) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = await externalizeDataUrls(kind, v);
    }
    return out as T;
  }
  return value;
}
