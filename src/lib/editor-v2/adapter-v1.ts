import type { EditorProjectDoc } from "@/lib/editor/project";
import { createEditorProjectV2 } from "./project";
import { asProjectTime, type Clip, type EditorProjectV2, type MediaAsset } from "./types";
import { NEUTRAL_VIDEO_ADJUSTMENTS } from "./creative";

const internalLicense = {
  provider: "VaiViral",
  sourceUrl: "internal://editor-v1",
  licenseType: "user-provided",
  licenseUrl: "internal://terms",
  author: "Usuário",
  attributionRequired: false,
  commercialUseAllowed: true,
  redistributionAllowed: false,
};

/** Adapter de compatibilidade. Não persiste V2 nem altera o documento V1. */
export function adaptEditorProjectV1(doc: EditorProjectDoc): EditorProjectV2 {
  const segments = (doc.preedit?.segments?.length
    ? doc.preedit.segments
        .map((segment) => ({
          start: Math.max(0, segment.start),
          end: Math.min(doc.media.duration, segment.end),
          speed: Math.max(0.05, segment.speed ?? 1),
        }))
        .filter((segment) => segment.end - segment.start > 0.05)
        .sort((a, b) => a.start - b.start)
    : [{ start: 0, end: doc.media.duration, speed: 1 }]);
  const duration = segments.reduce((sum, item) => sum + (item.end - item.start) / Math.max(0.05, item.speed ?? 1), 0);
  const project = createEditorProjectV2({ id: `v2-${doc.videoId}`, name: doc.title, aspectRatio: doc.composition.aspectRatio, duration });
  const assetId = `asset-${doc.videoId}`;
  const media: MediaAsset = {
    id: assetId,
    kind: "video",
    name: doc.title,
    mimeType: "video/*",
    ...(doc.media.originalUrl ? { sourceUrl: doc.media.originalUrl } : {}),
    ...(doc.media.storagePath ? { storagePath: doc.media.storagePath } : {}),
    ...(doc.media.proxyUrl ? { proxyUrl: doc.media.proxyUrl } : {}),
    ...(doc.media.posterUrl ? { thumbnailUrl: doc.media.posterUrl } : {}),
    duration: doc.media.duration,
    ...(doc.media.width ? { width: doc.media.width } : {}),
    ...(doc.media.height ? { height: doc.media.height } : {}),
    license: internalLicense,
  };
  project.assets.push(media);
  let cursor = 0;
  const clips: Clip[] = segments.map((segment, index) => {
    const rate = Math.max(0.05, segment.speed ?? 1);
    const clipDuration = (segment.end - segment.start) / rate;
    const clip: Clip = {
      id: `clip-${doc.videoId}-${index}`,
      kind: "video",
      trackId: "track-video",
      assetId,
      name: segments.length > 1 ? `${doc.title} · ${index + 1}` : doc.title,
      projectStart: asProjectTime(cursor),
      projectEnd: asProjectTime(cursor + clipDuration),
      sourceIn: segment.start,
      sourceOut: segment.end,
      playbackRate: rate,
      enabled: true,
      effects: [],
      animations: [],
      transform: { x: 50, y: 50, width: 100, height: 100, scale: 1, rotation: doc.preedit?.rotate ?? 0, opacity: 1 },
      adjustments: { ...NEUTRAL_VIDEO_ADJUSTMENTS, brightness: (doc.preedit?.brightness ?? 1) - 1, contrast: (doc.preedit?.contrast ?? 1) - 1, saturation: (doc.preedit?.saturation ?? 1) - 1, temperature: doc.preedit?.temp ?? 0, tint: (doc.preedit?.hue ?? 0) / 180, fade: doc.preedit?.fade ?? 0, vignette: doc.preedit?.vignette ?? 0, grain: doc.preedit?.grain ?? 0, blur: doc.preedit?.blur ?? 0 },
      motion: {
        ...(doc.preedit?.transIn.kind && doc.preedit.transIn.kind !== "none" ? { in: { id: normalizeLegacyMotion(doc.preedit.transIn.kind), duration: doc.preedit.transIn.dur, intensity: 1, easing: "easeOut" as const } } : {}),
        ...(doc.preedit?.transOut.kind && doc.preedit.transOut.kind !== "none" ? { out: { id: normalizeLegacyMotion(doc.preedit.transOut.kind), duration: doc.preedit.transOut.dur, intensity: 1, easing: "easeIn" as const } } : {}),
      },
      metadata: { editorV1Segment: index },
    };
    cursor += clipDuration;
    return clip;
  });
  project.tracks.find((track) => track.id === "track-video")!.clips = clips;
  return project;
}

function normalizeLegacyMotion(kind: string) {
  if (kind === "zoom-out" || kind === "punch") return "zoom";
  if (kind === "whip" || kind === "drift" || kind === "swing") return "slide-left";
  if (kind === "whip-vertical") return "slide-up";
  if (kind === "flash") return "fade";
  return kind;
}
