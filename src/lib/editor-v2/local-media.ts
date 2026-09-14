import { asProjectTime, type AudioSourceGroup, type Clip, type MediaAsset, type MediaAssetKind } from "./types";

export interface LocalMediaRuntime {
  asset: MediaAsset;
  clip: Clip;
  objectUrl: string;
  thumbnailUrl?: string;
  audioGroup?: AudioSourceGroup;
}

export async function prepareLocalMedia(file: File, at: number, serial: number): Promise<LocalMediaRuntime> {
  const kind = mediaKind(file.type);
  if (!kind) throw new Error("Use um arquivo de vídeo, imagem ou áudio compatível.");
  const id = `local-${serial}-${safeName(file.name)}`;
  const objectUrl = URL.createObjectURL(file);
  try {
    const metadata = await readMetadata(objectUrl, kind);
    const duration = kind === "image" ? 5 : Math.max(0.5, metadata.duration ?? 5);
    const trackId = kind === "video" ? "track-video" : kind === "audio" ? "track-music" : "track-overlay";
    const asset: MediaAsset = {
      id,
      kind,
      name: file.name,
      mimeType: file.type || fallbackMime(kind),
      storagePath: `local-session://${id}`,
      duration,
      hash: `${file.name}:${file.size}:${file.lastModified}`,
      ...(kind === "audio" ? { audioAnalysis: { cacheKey: `${file.name}:${file.size}:${file.lastModified}:180`, status: "pending" as const } } : {}),
      ...(metadata.width ? { width: metadata.width } : {}),
      ...(metadata.height ? { height: metadata.height } : {}),
      license: { provider: "Arquivo local", sourceUrl: `local-session://${id}`, licenseType: "Fornecida pelo usuário", licenseUrl: "internal://editor-v2/local-media", author: "Usuário", attributionRequired: false, commercialUseAllowed: true, redistributionAllowed: false },
    };
    const clip: Clip = {
      id: `clip-${id}`,
      kind,
      trackId,
      assetId: id,
      name: file.name,
      projectStart: asProjectTime(at),
      projectEnd: asProjectTime(at + duration),
      sourceIn: 0,
      sourceOut: duration,
      playbackRate: 1,
      enabled: true,
      effects: [],
      animations: [],
      ...(kind !== "audio" ? { transform: { x: 50, y: 50, width: 100, height: 100, scale: 1, rotation: 0, opacity: 1 } } : {}),
      ...(kind === "video" || kind === "audio" ? { audio: { gain: 1, muted: false, fadeIn: 0, fadeOut: 0, loop: false, stemRole: kind === "video" ? "original" as const : "music" as const, envelope: [] } } : {}),
      metadata: { localSession: true },
    };
    const thumbnailUrl = kind === "image" ? objectUrl : kind === "video" ? await captureVideoPoster(objectUrl, duration).catch(() => undefined) : undefined;
    const audioGroup: AudioSourceGroup | undefined = kind === "video" ? {
      id: `audio-group-${id}`,
      sourceAssetId: asset.id,
      sourceStreamIndex: 0,
      sourceVideoClipId: clip.id,
      activeRepresentation: "embedded",
      linkedEditing: true,
      sourceRevision: 0,
    } : undefined;
    return { asset, clip, objectUrl, ...(thumbnailUrl ? { thumbnailUrl } : {}), ...(audioGroup ? { audioGroup } : {}) };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function mediaKind(mime: string): Extract<MediaAssetKind, "video" | "audio" | "image"> | null {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  return null;
}

function readMetadata(url: string, kind: "video" | "audio" | "image") {
  return new Promise<{ duration?: number; width?: number; height?: number }>((resolve, reject) => {
    if (kind === "image") {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("Não foi possível ler a imagem."));
      image.src = url;
      return;
    }
    const media = document.createElement(kind);
    media.preload = "metadata";
    media.onloadedmetadata = () => resolve({ duration: Number.isFinite(media.duration) ? media.duration : 5, ...(kind === "video" ? { width: (media as HTMLVideoElement).videoWidth, height: (media as HTMLVideoElement).videoHeight } : {}) });
    media.onerror = () => reject(new Error(`Não foi possível ler o ${kind === "video" ? "vídeo" : "áudio"}.`));
    media.src = url;
  });
}

export function captureVideoPoster(url: string, duration: number) {
  return new Promise<string>((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.onloadedmetadata = () => { video.currentTime = Math.min(Math.max(0.05, duration * 0.12), Math.max(0.05, duration - 0.05)); };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 240;
      canvas.height = Math.max(80, Math.round(240 * video.videoHeight / Math.max(1, video.videoWidth)));
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => blob ? resolve(URL.createObjectURL(blob)) : reject(new Error("Poster indisponível.")), "image/jpeg", 0.72);
    };
    video.onerror = () => reject(new Error("Poster indisponível."));
    video.src = url;
  });
}

function safeName(name: string) { return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "media"; }
function fallbackMime(kind: "video" | "audio" | "image") { return kind === "video" ? "video/mp4" : kind === "audio" ? "audio/mpeg" : "image/png"; }
