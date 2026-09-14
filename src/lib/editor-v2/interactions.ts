import { asProjectTime, type CaptionCue, type Clip, type EditorProjectV2, type TemplateInstance, type Track, type TrackKind } from "./types";
import type { CaptionPresetDefinition, LibraryItem, LibraryItemType, StickerDefinition, TemplateDefinition, TextPresetDefinition } from "./library";

export const DEFAULT_CLIP_TRANSFORM = {
  x: 50,
  y: 50,
  width: 62,
  height: 24,
  scale: 1,
  rotation: 0,
  opacity: 1,
} as const;

const trackForType: Partial<Record<LibraryItemType, TrackKind>> = {
  caption: "captions",
  music: "music",
  "sound-effect": "sfx",
  "stock-video": "video",
  "stock-image": "overlay",
  gif: "overlay",
  sticker: "overlay",
  overlay: "overlay",
  shape: "overlay",
  background: "video",
  text: "overlay",
  template: "overlay",
};

export function findClip(project: EditorProjectV2, clipId: string | null): Clip | null {
  if (!clipId) return null;
  return project.tracks.flatMap((track) => track.clips).find((clip) => clip.id === clipId) ?? null;
}

export function isTrackCompatible(clip: Clip, target: Track): boolean {
  if (clip.kind === "audio") return target.kind === "voice" || target.kind === "music" || target.kind === "sfx";
  if (clip.kind === "caption") return target.kind === "captions";
  if (clip.kind === "video") return target.kind === "video" || target.kind === "overlay";
  return target.kind === "overlay";
}

export function visibleTimelineRange(scrollLeft: number, viewportWidth: number, labelWidth: number, pxPerSecond: number, overscan = 2) {
  const contentLeft = Math.max(0, scrollLeft - labelWidth);
  return {
    start: Math.max(0, contentLeft / pxPerSecond - overscan),
    end: Math.max(0, (scrollLeft + viewportWidth - labelWidth) / pxPerSecond + overscan),
  };
}

export function resolveLibraryInsertion(project: EditorProjectV2, item: LibraryItem, at: number, serial: number): Clip | null {
  const trackKind = trackForType[item.type];
  if (!trackKind) return null;
  const owner = project.tracks.find((track) => track.kind === trackKind);
  if (!owner) return null;
  const duration = Math.max(0.5, Math.min(item.duration ?? (item.type === "template" ? 6 : 4), 12));
  const text = item.preview.sampleText ?? item.name;
  const captionPreset = item.type === "caption" ? item.definition as CaptionPresetDefinition : null;
  const textPreset = item.type === "text" ? item.definition as TextPresetDefinition : null;
  const sticker = item.type === "sticker" ? item.definition as StickerDefinition : null;
  const baseTransform = item.type === "shape"
    ? { ...DEFAULT_CLIP_TRANSFORM, width: 36, height: 20 }
    : item.type === "caption"
      ? { ...(captionPreset?.transform ?? DEFAULT_CLIP_TRANSFORM) }
      : item.type === "sticker"
        ? { ...DEFAULT_CLIP_TRANSFORM, width: Math.min(68, 22 * (sticker?.ratio ?? 1)), height: 22 }
        : { ...DEFAULT_CLIP_TRANSFORM, ...(textPreset?.transform ?? {}) };
  return {
    id: `v2-${item.sourceId}-${serial}`,
    kind: item.type === "caption" ? "caption" : item.type === "shape" ? "shape" : item.type === "sticker" ? "sticker" : item.type === "stock-video" ? "video" : item.type === "stock-image" ? "image" : item.type === "music" || item.type === "sound-effect" ? "audio" : "text",
    trackId: owner.id,
    name: item.name,
    projectStart: asProjectTime(Math.max(0, at)),
    projectEnd: asProjectTime(Math.max(0, at) + duration),
    sourceIn: 0,
    sourceOut: duration,
    playbackRate: 1,
    enabled: true,
    effects: [],
    animations: [],
    ...(item.type === "music" || item.type === "sound-effect" ? { audio: { gain: item.type === "music" ? .8 : 1, muted: false, fadeIn: 0, fadeOut: 0, loop: item.type === "music", stemRole: item.type === "music" ? "music" as const : "sfx" as const, envelope: [] } } : {}),
    transform: baseTransform,
    style: captionPreset?.style ?? textPreset?.style ?? {
      text,
      fontFamily: "Outfit",
      fontSize: item.type === "caption" ? 42 : 54,
      fontWeight: 760,
      align: "center",
      color: "#f8f7ff",
      backgroundColor: item.type === "caption" && item.preview.rendererId.includes("box") ? "#080a10d9" : "transparent",
      borderRadius: 10,
    },
    ...(sticker ? { sticker: { stickerId: sticker.id, text: sticker.text, color: sticker.color, accent: sticker.accent, speed: sticker.speed } } : {}),
    metadata: { libraryItemId: item.id, libraryVersion: item.version, definition: item.definition, rendererId: item.preview.rendererId, colors: item.preview.colors, ...(captionPreset ? { captionPresetId: captionPreset.id } : {}) },
  };
}

export function resolveCaptionInsertion(project: EditorProjectV2, item: LibraryItem<CaptionPresetDefinition>, at: number, serial: number) {
  const clip = resolveLibraryInsertion(project, item, at, serial);
  if (!clip) throw new Error("Não foi possível criar a legenda.");
  const duration = Number(clip.projectEnd) - Number(clip.projectStart);
  const words = (item.preview.sampleText ?? "LEGENDA EM TEMPO REAL").split(/\s+/).filter(Boolean);
  const cueId = `cue-${item.sourceId}-${serial}`;
  const cue: CaptionCue = {
    id: cueId, start: clip.projectStart, end: clip.projectEnd, text: words.join(" "), styleId: item.definition.id,
    animationId: item.definition.motion,
    words: words.map((word, index) => ({ id: `${cueId}-word-${index + 1}`, text: word, start: asProjectTime(Number(clip.projectStart) + duration * index / words.length), end: asProjectTime(Number(clip.projectStart) + duration * (index + 1) / words.length) })),
  };
  clip.metadata = { ...clip.metadata, captionCueId: cue.id, captionPreset: structuredClone(item.definition) };
  return { clip, cue };
}

export function resolveTemplateApplication(project: EditorProjectV2, item: LibraryItem<TemplateDefinition>, at: number, serial: number) {
  const definition = item.definition;
  if (!definition.aspectRatios.includes(project.settings.aspectRatio)) throw new Error(`${item.name} não é compatível com ${project.settings.aspectRatio}.`);
  const instanceId = `template-${item.sourceId}-${serial}`;
  const clips: Clip[] = definition.document.layers.filter((layer) => layer.visible && ["text", "shape", "caption", "sticker"].includes(layer.type)).map((layer, index) => {
    const caption = layer.type === "caption";
    const owner = project.tracks.find((track) => track.kind === (caption ? "captions" : "overlay"));
    if (!owner) throw new Error("Trilha necessária para o template não encontrada.");
    const start = at + layer.startTime;
    const end = at + Math.min(definition.duration, layer.endTime ?? definition.duration);
    const text = "text" in layer ? String(layer.text) : layer.name;
    return {
      id: `${instanceId}-layer-${index + 1}`, kind: caption ? "caption" : layer.type === "shape" ? "shape" : layer.type === "sticker" ? "sticker" : "text", trackId: owner.id,
      name: layer.name, projectStart: asProjectTime(start), projectEnd: asProjectTime(Math.max(start + .04, end)), sourceIn: 0, sourceOut: Math.max(.04, end - start), playbackRate: 1, enabled: true, effects: [], animations: [],
      transform: { x: layer.x, y: layer.y, width: layer.width, height: layer.height, scale: 1, rotation: layer.rotation, opacity: layer.opacity },
      style: layer.type === "text" ? { text: layer.text, fontFamily: layer.fontFamily, fontSize: layer.fontSize, fontWeight: layer.fontWeight, align: layer.align, color: layer.color, backgroundColor: layer.background ?? "transparent", borderRadius: layer.radius } : undefined,
      metadata: { templateInstanceId: instanceId, templateLayerId: layer.id, rendererId: layer.type === "shape" ? layer.shape : item.preview.rendererId, colors: layer.type === "shape" ? [layer.fill, layer.fill] : item.preview.colors, text },
    } as Clip;
  });
  const instance: TemplateInstance = { id: instanceId, templateId: definition.id, version: item.version, document: structuredClone(definition.document), parameters: {}, appliedAt: asProjectTime(at), clipIds: clips.map((clip) => clip.id) };
  return { instance, clips };
}

export function snapProjectTime(project: EditorProjectV2, rawTime: number, ignoreClipId?: string): number {
  const fpsStep = 1 / project.settings.fps;
  if (!project.settings.snapEnabled) return Math.max(0, rawTime);
  const candidates = [0, ...project.tracks.flatMap((track) => track.clips.filter((clip) => clip.id !== ignoreClipId).flatMap((clip) => [Number(clip.projectStart), Number(clip.projectEnd)]))];
  const threshold = Math.max(fpsStep, 0.12);
  const nearest = candidates.reduce((best, candidate) => Math.abs(candidate - rawTime) < Math.abs(best - rawTime) ? candidate : best, candidates[0] ?? 0);
  if (Math.abs(nearest - rawTime) <= threshold) return Math.max(0, nearest);
  return Math.max(0, Math.round(rawTime / fpsStep) * fpsStep);
}

export function formatProjectTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const frames = Math.floor((safe % 1) * 30);
  return `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}
