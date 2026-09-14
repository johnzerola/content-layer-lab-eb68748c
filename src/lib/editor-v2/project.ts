import { ASPECT_SIZES, type AspectRatio } from "@/lib/video-template/types";
import {
  EDITOR_PROJECT_V2_VERSION,
  asProjectTime,
  type EditorProjectV2,
  type Track,
} from "./types";

export function createEditorProjectV2(input: {
  id?: string;
  name?: string;
  aspectRatio?: AspectRatio;
  duration?: number;
} = {}): EditorProjectV2 {
  const aspectRatio = input.aspectRatio ?? "9:16";
  const size = ASPECT_SIZES[aspectRatio];
  return {
    version: EDITOR_PROJECT_V2_VERSION,
    id: input.id ?? "editor-v2-local",
    name: input.name ?? "Projeto Editor V2",
    assets: [],
    audioGroups: [],
    tracks: [
      baseTrack("track-video", "video", "Vídeo", 0),
      baseTrack("track-overlay", "overlay", "Sobreposições", 1),
      { ...baseTrack("track-captions", "captions", "Legendas", 2), kind: "captions", language: "pt-BR", cues: [] },
      baseTrack("track-voice", "voice", "Voz", 3),
      baseTrack("track-music", "music", "Música", 4),
      baseTrack("track-sfx", "sfx", "Efeitos sonoros", 5),
    ],
    transitions: [],
    templates: [],
    selection: { itemIds: [], primaryId: null, surface: null },
    settings: {
      aspectRatio,
      width: size.width,
      height: size.height,
      fps: 30,
      duration: Math.max(0, input.duration ?? 15),
      snapEnabled: true,
      rippleEnabled: false,
      audio: { masterGain: 1, duckingEnabled: true, duckAmount: 0.65 },
    },
    revisions: { document: 0, render: 0, saved: 0 },
  };
}

function baseTrack(id: string, kind: Track["kind"], name: string, order: number): Track {
  return { id, kind, name, order, locked: false, hidden: false, muted: false, solo: false, gain: 1, clips: [] };
}

export function cloneProject(project: EditorProjectV2): EditorProjectV2 {
  return structuredClone(project);
}

export function projectDuration(project: EditorProjectV2): number {
  return Math.max(
    project.settings.duration,
    ...project.tracks.flatMap((track) => track.clips.map((clip) => Number(clip.projectEnd))),
    0,
  );
}

export function normalizeProject(project: EditorProjectV2): EditorProjectV2 {
  const next = cloneProject(project);
  next.audioGroups ??= [];
  next.audioGroups = next.audioGroups.map((group) => ({
    ...group,
    sourceStreamIndex: Math.max(0, Math.floor(group.sourceStreamIndex ?? 0)),
    linkedEditing: group.linkedEditing ?? true,
    sourceRevision: Math.max(0, Math.floor(group.sourceRevision ?? 0)),
  }));
  next.settings.audio ??= { masterGain: 1, duckingEnabled: true, duckAmount: 0.65 };
  next.settings.duration = projectDuration(next);
  for (const track of next.tracks) {
    track.solo ??= false;
    track.gain = Math.max(0, Math.min(2, track.gain ?? 1));
    track.clips.sort((a, b) => Number(a.projectStart) - Number(b.projectStart));
    for (const clip of track.clips) {
      clip.projectStart = asProjectTime(Number(clip.projectStart));
      clip.projectEnd = asProjectTime(Math.max(Number(clip.projectStart) + 0.04, Number(clip.projectEnd)));
      clip.sourceIn = Math.max(0, clip.sourceIn);
      clip.sourceOut = Math.max(clip.sourceIn, clip.sourceOut);
      clip.playbackRate = Math.max(0.05, clip.playbackRate || 1);
      const duration = Number(clip.projectEnd) - Number(clip.projectStart);
      for (const animation of clip.animations) {
        animation.keyframes.forEach((keyframe) => { keyframe.time = asProjectTime(Math.min(duration, Math.max(0, Number(keyframe.time)))); });
        animation.keyframes.sort((a, b) => Number(a.time) - Number(b.time));
      }
    }
    if (track.kind === "captions" && "cues" in track) {
      track.cues = track.cues.filter((cue) => track.clips.some((clip) => clip.metadata?.["captionCueId"] === cue.id));
      for (const cue of track.cues) {
        const clip = track.clips.find((item) => item.metadata?.["captionCueId"] === cue.id);
        if (!clip) continue;
        const delta = Number(clip.projectStart) - Number(cue.start);
        cue.words?.forEach((word) => {
          word.start = asProjectTime(Math.max(Number(clip.projectStart), Math.min(Number(clip.projectEnd), Number(word.start) + delta)));
          word.end = asProjectTime(Math.max(Number(word.start), Math.min(Number(clip.projectEnd), Number(word.end) + delta)));
        });
        cue.start = clip.projectStart;
        cue.end = clip.projectEnd;
      }
      track.cues.sort((a, b) => Number(a.start) - Number(b.start));
    }
  }
  const compoundCounts = new Map<string, number>();
  for (const clip of next.tracks.flatMap((track) => track.clips)) {
    const groupId = clip.metadata?.["compoundGroupId"];
    if (typeof groupId === "string") compoundCounts.set(groupId, (compoundCounts.get(groupId) ?? 0) + 1);
  }
  for (const clip of next.tracks.flatMap((track) => track.clips)) {
    const groupId = clip.metadata?.["compoundGroupId"];
    if (typeof groupId === "string" && (compoundCounts.get(groupId) ?? 0) < 2) {
      const { compoundGroupId: _group, compoundName: _name, ...metadata } = clip.metadata ?? {};
      clip.metadata = metadata;
    }
  }
  return next;
}
