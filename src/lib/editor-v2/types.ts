import type { AspectRatio, Easing, TemplateDoc } from "@/lib/video-template/types";

export const EDITOR_PROJECT_V2_VERSION = 2 as const;

export type ProjectTime = number & { readonly __projectTime: unique symbol };
export type MediaAssetKind = "video" | "audio" | "image" | "font" | "lut";
export type TrackKind = "video" | "overlay" | "captions" | "voice" | "music" | "sfx";
export type ClipKind = "video" | "audio" | "image" | "text" | "caption" | "shape" | "sticker";
export type AnimatableProperty = "x" | "y" | "scale" | "rotation" | "opacity";
export type RenderImpact = "none" | "timeline" | "visual" | "audio" | "full";
export type AudioRepresentation = "embedded" | "extracted" | "separated";

export interface AssetLicenseMetadata {
  provider: string;
  sourceUrl: string;
  licenseType: string;
  licenseUrl: string;
  author: string;
  attributionRequired: boolean;
  commercialUseAllowed: boolean;
  redistributionAllowed: boolean;
  downloadedAt?: string;
  providerItemId?: string;
}

export interface MediaAsset {
  id: string;
  kind: MediaAssetKind;
  name: string;
  mimeType: string;
  sourceUrl?: string;
  storagePath?: string;
  proxyUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  width?: number;
  height?: number;
  hash?: string;
  /** Keeps a source available to existing clips while hiding it from the library. */
  libraryHidden?: boolean;
  audioAnalysis?: { cacheKey: string; status: "pending" | "ready" | "error"; sampleRate?: number; channels?: number; durationMs?: number; peaks?: number[]; error?: string };
  sourceAudio?: {
    sourceAssetId: string;
    streamIndex: number;
    extractedAt?: string;
    /** Source interval copied into this rebased audio asset. */
    sourceIn?: number;
    sourceOut?: number;
  };
  stem?: {
    role: "voice" | "music";
    sourceAssetId: string;
    revision: number;
    status: "queued" | "running" | "partial" | "ready" | "error";
    confidence?: number;
    engine?: string;
    model?: string;
    jobId?: string;
    createdAt?: string;
  };
  license: AssetLicenseMetadata;
}

export interface Keyframe<T = number> {
  id: string;
  time: ProjectTime;
  value: T;
  easing: Easing;
}

export interface AnimationTrack<T = number> {
  property: AnimatableProperty;
  keyframes: Keyframe<T>[];
}

export interface EffectInstance {
  id: string;
  definitionId: string;
  enabled: boolean;
  parameters: Record<string, number | string | boolean>;
}

export interface VideoAdjustments {
  exposure: number;
  brightness: number;
  contrast: number;
  saturation: number;
  temperature: number;
  tint: number;
  highlights: number;
  shadows: number;
  fade: number;
  sharpen: number;
  vignette: number;
  grain: number;
  blur: number;
}

export type MotionSlot = "in" | "out" | "loop";
export interface MotionPreset {
  id: string;
  duration: number;
  intensity: number;
  easing: Easing;
}
export interface ClipMotionSettings {
  in?: MotionPreset | null;
  out?: MotionPreset | null;
  loop?: MotionPreset | null;
}

export interface StickerSettings {
  stickerId: string;
  text: string;
  color: string;
  accent: string;
  speed: number;
}

export interface Transition {
  id: string;
  definitionId: string;
  fromClipId: string;
  toClipId: string;
  duration: number;
  easing: Easing;
  fallback: "cut";
  parameters: Record<string, number | string | boolean>;
}

export interface Clip {
  id: string;
  kind: ClipKind;
  trackId: string;
  assetId?: string;
  audioGroupId?: string;
  name: string;
  projectStart: ProjectTime;
  projectEnd: ProjectTime;
  sourceIn: number;
  sourceOut: number;
  playbackRate: number;
  /** Plays the visual source from sourceOut back to sourceIn. Embedded audio is muted. */
  reversed?: boolean;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  enabled: boolean;
  effects: EffectInstance[];
  animations: AnimationTrack[];
  transform?: ClipTransform;
  style?: ClipStyle;
  audio?: ClipAudioSettings;
  adjustments?: VideoAdjustments;
  motion?: ClipMotionSettings;
  sticker?: StickerSettings;
  metadata?: Record<string, unknown>;
}

export interface AudioEnvelopePoint { id: string; time: ProjectTime; gain: number }
export interface ClipAudioSettings {
  gain: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
  loop: boolean;
  stemRole?: "original" | "voice" | "music" | "sfx";
  envelope: AudioEnvelopePoint[];
}

export interface ClipTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  rotation: number;
  opacity: number;
}

export interface ClipStyle {
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  align?: "left" | "center" | "right";
  color?: string;
  backgroundColor?: string;
  borderRadius?: number;
  strokeColor?: string;
  strokeWidth?: number;
  shadow?: boolean;
  uppercase?: boolean;
  letterSpacing?: number;
  lineHeight?: number;
  highlight?: "color" | "box" | "underline" | "scale";
  highlightColor?: string;
  maxWords?: number;
  maxLines?: number;
}

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  order: number;
  locked: boolean;
  hidden: boolean;
  muted: boolean;
  solo: boolean;
  gain: number;
  clips: Clip[];
}

/**
 * Links every playable representation derived from one source stream.
 * Only the clips referenced by `activeRepresentation` may enter the mix.
 */
export interface AudioSourceGroup {
  id: string;
  sourceAssetId: string;
  sourceStreamIndex: number;
  sourceVideoClipId?: string;
  originalAudioAssetId?: string;
  extractedClipId?: string;
  dialogueClipId?: string;
  musicClipId?: string;
  activeRepresentation: AudioRepresentation;
  linkedEditing: boolean;
  sourceRevision: number;
}

export interface CaptionCue {
  id: string;
  start: ProjectTime;
  end: ProjectTime;
  text: string;
  words?: { id: string; text: string; start: ProjectTime; end: ProjectTime }[];
  styleId: string;
  animationId?: string;
}

export interface CaptionTrack extends Track {
  kind: "captions";
  language: string;
  cues: CaptionCue[];
}

export interface TemplateInstance {
  id: string;
  templateId: string;
  version: number;
  document: TemplateDoc;
  parameters: Record<string, string | number | boolean>;
  appliedAt: ProjectTime;
  clipIds: string[];
}

export interface SelectionState {
  itemIds: string[];
  primaryId: string | null;
  surface: "timeline" | "canvas" | "library" | null;
}

export interface ProjectSettings {
  aspectRatio: AspectRatio;
  width: number;
  height: number;
  fps: number;
  duration: number;
  snapEnabled: boolean;
  rippleEnabled: boolean;
  audio: { masterGain: number; duckingEnabled: boolean; duckAmount: number };
}

export interface EditorProjectV2 {
  version: typeof EDITOR_PROJECT_V2_VERSION;
  id: string;
  name: string;
  assets: MediaAsset[];
  audioGroups: AudioSourceGroup[];
  tracks: (Track | CaptionTrack)[];
  transitions: Transition[];
  templates: TemplateInstance[];
  selection: SelectionState;
  settings: ProjectSettings;
  revisions: {
    document: number;
    render: number;
    saved: number;
  };
}

export function asProjectTime(value: number): ProjectTime {
  if (!Number.isFinite(value)) return 0 as ProjectTime;
  return Math.max(0, value) as ProjectTime;
}
