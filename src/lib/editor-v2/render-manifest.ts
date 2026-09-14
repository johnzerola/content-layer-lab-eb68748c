import { resolveAnimatedTransform, resolveTransitionVisual } from "./animation";
import { resolveAudioMixFrame, type ResolvedAudioLayer } from "./audio";
import { resolveClipPresentation, type ResolvedClipPresentation } from "./creative";
import type { AudioSourceGroup, CaptionCue, Clip, ClipAudioSettings, ClipStyle, ClipTransform, EditorProjectV2, MediaAsset, TemplateInstance, Track, Transition } from "./types";

export interface ResolvedVisualLayer {
  clipId: string;
  transform: ClipTransform;
  transition: { opacity: number; translateX: number; scale: number };
  presentation: ResolvedClipPresentation;
  order: number;
  caption?: { cue: CaptionCue; preset: Record<string, unknown> };
}

export interface EditorRenderManifestV2 {
  version: 2;
  projectId: string;
  revision: number;
  settings: EditorProjectV2["settings"];
  tracks: { id: string; kind: Track["kind"]; name: string; order: number; locked: boolean; hidden: boolean; muted: boolean; solo: boolean; gain: number }[];
  visualClips: { id: string; name: string; assetId?: string; audioGroupId?: string; trackId: string; kind: string; enabled: boolean; projectStart: number; projectEnd: number; sourceIn: number; sourceOut: number; playbackRate: number; audio?: ClipAudioSettings; transform?: ClipTransform; style?: ClipStyle; metadata?: Record<string, unknown>; animations: EditorProjectV2["tracks"][number]["clips"][number]["animations"]; effects: EditorProjectV2["tracks"][number]["clips"][number]["effects"]; adjustments?: EditorProjectV2["tracks"][number]["clips"][number]["adjustments"]; motion?: EditorProjectV2["tracks"][number]["clips"][number]["motion"]; sticker?: EditorProjectV2["tracks"][number]["clips"][number]["sticker"] }[];
  transitions: Transition[];
  captionTracks: { trackId: string; language: string; cues: CaptionCue[] }[];
  templates: TemplateInstance[];
  assets: MediaAsset[];
  audioGroups: AudioSourceGroup[];
  audioTracks: { id: string; kind: "video" | "voice" | "music" | "sfx"; muted: boolean; solo: boolean; gain: number }[];
  audioClips: { id: string; name: string; assetId: string; audioGroupId?: string; trackId: string; enabled: boolean; projectStart: number; projectEnd: number; sourceIn: number; sourceOut: number; playbackRate: number; audio: ClipAudioSettings }[];
}

export function resolveAudioRenderFrame(project: EditorProjectV2, projectTime: number): ResolvedAudioLayer[] { return resolveAudioMixFrame(project, projectTime); }

/** Reconstructs a frozen render document without consulting the live editor store. */
export function editorProjectFromManifest(manifest: EditorRenderManifestV2): EditorProjectV2 {
  const clipsByTrack = new Map<string, Clip[]>();
  for (const item of manifest.audioClips) {
    const clip: Clip = {
      ...structuredClone(item),
      kind: "audio",
      projectStart: item.projectStart as Clip["projectStart"],
      projectEnd: item.projectEnd as Clip["projectEnd"],
      effects: [],
      animations: [],
    };
    clipsByTrack.set(item.trackId, [...(clipsByTrack.get(item.trackId) ?? []), clip]);
  }
  for (const item of manifest.visualClips.filter((clip) => clip.kind === "video")) {
    const clip = {
      ...structuredClone(item),
      kind: "video",
      projectStart: item.projectStart as Clip["projectStart"],
      projectEnd: item.projectEnd as Clip["projectEnd"],
    } as Clip;
    clipsByTrack.set(item.trackId, [...(clipsByTrack.get(item.trackId) ?? []), clip]);
  }
  for (const item of manifest.visualClips) {
    const clip = {
      ...structuredClone(item),
      kind: item.kind,
      projectStart: item.projectStart as Clip["projectStart"],
      projectEnd: item.projectEnd as Clip["projectEnd"],
    } as Clip;
    if (clip.kind !== "video") clipsByTrack.set(item.trackId, [...(clipsByTrack.get(item.trackId) ?? []), clip]);
  }
  const captions = new Map(manifest.captionTracks.map((track) => [track.trackId, track]));
  const tracks = manifest.tracks.map((track) => {
    const caption = captions.get(track.id);
    return {
      ...structuredClone(track),
      clips: clipsByTrack.get(track.id) ?? [],
      ...(track.kind === "captions" ? { language: caption?.language ?? "pt-BR", cues: structuredClone(caption?.cues ?? []) } : {}),
    } as Track;
  });
  return {
    version: 2,
    id: manifest.projectId,
    name: manifest.projectId,
    assets: structuredClone(manifest.assets),
    audioGroups: structuredClone(manifest.audioGroups),
    tracks,
    transitions: [],
    templates: [],
    selection: { itemIds: [], primaryId: null, surface: null },
    settings: structuredClone(manifest.settings),
    revisions: { document: manifest.revision, render: manifest.revision, saved: manifest.revision },
  };
}

/** Resolves the serialized export contract independently from the live editor store. */
export function resolveAudioRenderFrameFromManifest(manifest: EditorRenderManifestV2, projectTime: number): ResolvedAudioLayer[] {
  return resolveAudioMixFrame(editorProjectFromManifest(manifest), projectTime);
}

export function resolveCompositionFrameFromManifest(manifest: EditorRenderManifestV2, projectTime: number): ResolvedVisualLayer[] {
  return resolveCompositionFrame(editorProjectFromManifest(manifest), projectTime);
}

export function resolveCompositionFrame(project: EditorProjectV2, projectTime: number): ResolvedVisualLayer[] {
  return project.tracks.filter((track) => !track.hidden).flatMap((track) => track.clips.map((clip) => ({ clip, order: track.order }))).filter(({ clip }) => {
    if (clip.kind === "audio" || !clip.enabled) return false;
    if (projectTime >= Number(clip.projectStart) && projectTime <= Number(clip.projectEnd)) return true;
    return project.transitions.some((transition) => {
      if (transition.toClipId !== clip.id) return false;
      const from = project.tracks.flatMap((track) => track.clips).find((item) => item.id === transition.fromClipId);
      const boundary = Number(from?.projectEnd ?? 0);
      return projectTime >= boundary - transition.duration && projectTime <= boundary;
    });
  }).map(({ clip, order }) => {
    const owner = project.tracks.find((track) => track.id === clip.trackId);
    const cue = owner?.kind === "captions" && "cues" in owner ? owner.cues.find((item) => item.id === clip.metadata?.["captionCueId"]) : undefined;
    return { clipId: clip.id, transform: resolveAnimatedTransform(clip, projectTime), transition: resolveTransitionVisual(project, clip.id, projectTime), presentation: resolveClipPresentation(clip, projectTime), order, ...(cue ? { caption: { cue: structuredClone(cue), preset: structuredClone((clip.metadata?.["captionPreset"] as Record<string, unknown> | undefined) ?? {}) } } : {}) };
  });
}

export function createEditorRenderManifest(project: EditorProjectV2): EditorRenderManifestV2 {
  return {
    version: 2,
    projectId: project.id,
    revision: project.revisions.render,
    settings: structuredClone(project.settings),
    tracks: project.tracks.map((track) => ({ id: track.id, kind: track.kind, name: track.name, order: track.order, locked: track.locked, hidden: track.hidden, muted: track.muted, solo: track.solo, gain: track.gain })),
    visualClips: project.tracks.flatMap((track) => track.clips).filter((clip) => clip.kind !== "audio").map((clip) => ({ id: clip.id, name: clip.name, ...(clip.assetId ? { assetId: clip.assetId } : {}), ...(clip.audioGroupId ? { audioGroupId: clip.audioGroupId } : {}), trackId: clip.trackId, kind: clip.kind, enabled: clip.enabled, projectStart: Number(clip.projectStart), projectEnd: Number(clip.projectEnd), sourceIn: clip.sourceIn, sourceOut: clip.sourceOut, playbackRate: clip.playbackRate, ...(clip.audio ? { audio: structuredClone(clip.audio) } : {}), ...(clip.transform ? { transform: structuredClone(clip.transform) } : {}), ...(clip.style ? { style: structuredClone(clip.style) } : {}), ...(clip.metadata ? { metadata: structuredClone(clip.metadata) } : {}), ...(clip.adjustments ? { adjustments: structuredClone(clip.adjustments) } : {}), ...(clip.motion ? { motion: structuredClone(clip.motion) } : {}), ...(clip.sticker ? { sticker: structuredClone(clip.sticker) } : {}), animations: structuredClone(clip.animations), effects: structuredClone(clip.effects) })),
    transitions: structuredClone(project.transitions),
    captionTracks: project.tracks.filter((track) => track.kind === "captions" && "cues" in track).map((track) => ({ trackId: track.id, language: track.language, cues: structuredClone(track.cues) })),
    templates: structuredClone(project.templates),
    assets: structuredClone(project.assets),
    audioGroups: structuredClone(project.audioGroups ?? []),
    audioTracks: project.tracks.filter((track): track is typeof track & { kind: "video" | "voice" | "music" | "sfx" } => track.kind === "video" || track.kind === "voice" || track.kind === "music" || track.kind === "sfx").map((track) => ({ id: track.id, kind: track.kind, muted: track.muted, solo: track.solo, gain: track.gain })),
    audioClips: project.tracks.flatMap((track) => track.clips).filter((clip) => clip.kind === "audio" && clip.assetId && clip.audio).map((clip) => ({ id: clip.id, name: clip.name, assetId: clip.assetId!, ...(clip.audioGroupId ? { audioGroupId: clip.audioGroupId } : {}), trackId: clip.trackId, enabled: clip.enabled, projectStart: Number(clip.projectStart), projectEnd: Number(clip.projectEnd), sourceIn: clip.sourceIn, sourceOut: clip.sourceOut, playbackRate: clip.playbackRate, audio: structuredClone(clip.audio!) })),
  };
}
