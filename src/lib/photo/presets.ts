/** Presets de saída por plataforma (dimensões finais em pixels). */
export interface PhotoPreset {
  id: string;
  label: string;
  hint: string;
  width: number;
  height: number;
}

export const PHOTO_PRESETS: PhotoPreset[] = [
  { id: "original", label: "Original", hint: "mantém o enquadramento", width: 0, height: 0 },
  { id: "feed", label: "Feed 1:1", hint: "Instagram / Facebook", width: 1440, height: 1440 },
  { id: "retrato", label: "Retrato 4:5", hint: "Instagram feed alto", width: 1440, height: 1800 },
  { id: "story", label: "Story 9:16", hint: "Reels / Stories / TikTok", width: 1080, height: 1920 },
  { id: "shorts", label: "Shorts 9:16", hint: "YouTube Shorts", width: 1080, height: 1920 },
  { id: "paisagem", label: "Paisagem 16:9", hint: "Facebook / YouTube", width: 1920, height: 1080 },
];

export function presetById(id: string): PhotoPreset {
  return PHOTO_PRESETS.find((p) => p.id === id) ?? PHOTO_PRESETS[0]!;
}

export type PhotoFormat = "image/jpeg" | "image/webp" | "image/png";

export const PHOTO_FORMATS: { id: PhotoFormat; label: string; ext: string }[] = [
  { id: "image/jpeg", label: "JPEG (recomendado)", ext: "jpg" },
  { id: "image/webp", label: "WebP", ext: "webp" },
  { id: "image/png", label: "PNG (sem perdas)", ext: "png" },
];

export function extForFormat(format: PhotoFormat) {
  return PHOTO_FORMATS.find((f) => f.id === format)?.ext ?? "jpg";
}
