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
    },
    revisions: { document: 0, render: 0, saved: 0 },
  };
}

function baseTrack(id: string, kind: Track["kind"], name: string, order: number): Track {
  return { id, kind, name, order, locked: false, hidden: false, muted: false, clips: [] };
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
  next.settings.duration = projectDuration(next);
  for (const track of next.tracks) {
    track.clips.sort((a, b) => Number(a.projectStart) - Number(b.projectStart));
    for (const clip of track.clips) {
      clip.projectStart = asProjectTime(Number(clip.projectStart));
      clip.projectEnd = asProjectTime(Math.max(Number(clip.projectStart) + 0.04, Number(clip.projectEnd)));
      clip.sourceIn = Math.max(0, clip.sourceIn);
      clip.sourceOut = Math.max(clip.sourceIn, clip.sourceOut);
      clip.playbackRate = Math.max(0.05, clip.playbackRate || 1);
    }
  }
  return next;
}

