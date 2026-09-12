import type { EditorProjectDoc } from "@/lib/editor/project";
import { keptSegments } from "@/lib/preedit";
import { createEditorProjectV2 } from "./project";
import { asProjectTime, type Clip, type EditorProjectV2, type MediaAsset } from "./types";

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
  const segments = keptSegments(doc.preedit, undefined, doc.media.duration);
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
      metadata: { editorV1Segment: index },
    };
    cursor += clipDuration;
    return clip;
  });
  project.tracks.find((track) => track.id === "track-video")!.clips = clips;
  return project;
}

