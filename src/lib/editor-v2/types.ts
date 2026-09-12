import type { AspectRatio, Easing, TemplateDoc } from "@/lib/video-template/types";

export const EDITOR_PROJECT_V2_VERSION = 2 as const;

export type ProjectTime = number & { readonly __projectTime: unique symbol };
export type MediaAssetKind = "video" | "audio" | "image" | "font" | "lut";
export type TrackKind = "video" | "overlay" | "captions" | "voice" | "music" | "sfx";
export type ClipKind = "video" | "audio" | "image" | "text" | "caption" | "shape" | "sticker";
export type RenderImpact = "none" | "timeline" | "visual" | "audio" | "full";

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
  license: AssetLicenseMetadata;
}

export interface Keyframe<T = number> {
  id: string;
  time: ProjectTime;
  value: T;
  easing: Easing;
}

export interface AnimationTrack<T = number> {
  property: string;
  keyframes: Keyframe<T>[];
}

export interface EffectInstance {
  id: string;
  definitionId: string;
  enabled: boolean;
  parameters: Record<string, number | string | boolean>;
}

export interface Transition {
  id: string;
  definitionId: string;
  fromClipId: string;
  toClipId: string;
  duration: number;
  parameters: Record<string, number | string | boolean>;
}

export interface Clip {
  id: string;
  kind: ClipKind;
  trackId: string;
  assetId?: string;
  name: string;
  projectStart: ProjectTime;
  projectEnd: ProjectTime;
  sourceIn: number;
  sourceOut: number;
  playbackRate: number;
  enabled: boolean;
  effects: EffectInstance[];
  animations: AnimationTrack[];
  metadata?: Record<string, unknown>;
}

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  order: number;
  locked: boolean;
  hidden: boolean;
  muted: boolean;
  clips: Clip[];
}

export interface CaptionCue {
  id: string;
  start: ProjectTime;
  end: ProjectTime;
  text: string;
  words?: { text: string; start: ProjectTime; end: ProjectTime }[];
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
}

export interface EditorProjectV2 {
  version: typeof EDITOR_PROJECT_V2_VERSION;
  id: string;
  name: string;
  assets: MediaAsset[];
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

