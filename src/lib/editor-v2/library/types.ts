import type { TemplateDoc } from "@/lib/video-template/types";
import type { AssetLicenseMetadata, ClipKind, ClipStyle, ClipTransform, MotionSlot, TrackKind, VideoAdjustments } from "../types";

export const LIBRARY_ITEM_TYPES = [
  "template", "transition", "video-effect", "filter", "text", "caption", "animation",
  "music", "sound-effect", "stock-video", "stock-image", "sticker", "gif", "overlay",
  "shape", "background", "lut", "font", "brand-kit", "user-preset", "community-pack", "plugin",
] as const;

export type LibraryItemType = (typeof LIBRARY_ITEM_TYPES)[number];
export type LibrarySource = "built-in" | "user" | "provider";
export type LibraryDownloadState = "not-required" | "available" | "downloading" | "downloaded" | "failed";
export type LibraryCacheState = "missing" | "fresh" | "stale";

export interface LibraryPreview {
  kind: "transition" | "effect" | "filter" | "text" | "caption" | "animation" | "template" | "audio" | "media" | "shape" | "sticker";
  rendererId: string;
  poster?: string;
  sampleText?: string;
  colors?: string[];
}

export interface LibraryCompatibility {
  aspectRatios?: string[];
  trackKinds?: TrackKind[];
  clipKinds?: ClipKind[];
  minEditorVersion: number;
}

export interface LibraryItem<TDefinition = unknown> {
  id: string;
  type: LibraryItemType;
  name: string;
  description: string;
  category: string;
  tags: string[];
  source: LibrarySource;
  sourceId: string;
  preview: LibraryPreview;
  thumbnail?: string;
  duration?: number;
  aspectRatios?: string[];
  parameters?: Record<string, unknown>;
  defaultParameters?: Record<string, unknown>;
  license: AssetLicenseMetadata;
  version: number;
  compatibility: LibraryCompatibility;
  downloadState: LibraryDownloadState;
  cacheState: LibraryCacheState;
  definition: TDefinition;
}

export interface TransitionDefinition {
  id: string;
  name: string;
  durationDefault: number;
  durationMin: number;
  durationMax: number;
  parameters: Record<string, number | string | boolean>;
  rendererId: string;
}

export interface EffectDefinition {
  id: string;
  name: string;
  parameters: Record<string, { min: number; max: number; default: number }>;
  rendererId: string;
}

export interface TemplateDefinition {
  id: string;
  name: string;
  duration: number;
  aspectRatios: string[];
  placeholders: { id: string; kind: "text" | "media" | "captions" }[];
  previewTime: number;
  document: TemplateDoc;
}

export interface CaptionPresetDefinition {
  id: string;
  name: string;
  mode: "line" | "word" | "karaoke";
  rendererId: string;
  transform: ClipTransform;
  style: ClipStyle;
  activeWordColor: string;
  inactiveWordOpacity: number;
  motion: string;
}

export interface TextPresetDefinition { id: string; style: ClipStyle; transform?: Partial<ClipTransform> }
export interface StickerDefinition { id: string; text: string; color: string; accent: string; ratio: number; speed: number }
export interface MotionDefinition { id: string; slot: MotionSlot; duration: number; intensity: number; easing: "linear" | "easeIn" | "easeOut" | "easeInOut" }
export interface FilterPresetDefinition { id: string; adjustments: VideoAdjustments }
export interface CreativeEffectDefinition { id: string; duration: number; intensity: number }
export interface SoundEffectDefinition {
  id: string;
  duration: number;
  gain: number;
  generator: "whoosh" | "impact" | "pop" | "click" | "sparkle" | "notification" | "riser" | "drop";
  color: string;
}

export interface LibrarySearchQuery {
  text?: string;
  types?: LibraryItemType[];
  category?: string;
  provider?: string;
  duration?: { min?: number; max?: number };
  orientation?: "vertical" | "horizontal" | "square";
  tags?: string[];
  page?: number;
  pageSize?: number;
}

export interface LibrarySearchResult {
  items: LibraryItem[];
  total: number;
  page: number;
  hasMore: boolean;
}

export interface LibraryPack {
  id: string;
  name: string;
  description: string;
  itemIds: string[];
  version: number;
  license: AssetLicenseMetadata;
}

export interface MyLibraryRecord {
  id: string;
  userId: string;
  itemId: string;
  kind: "media" | "music" | "sound-effect" | "template" | "preset" | "caption-style" | "text-style" | "brand-asset";
  createdAt: string;
}

export interface LibraryProvider {
  readonly id: string;
  readonly name: string;
  search(query: LibrarySearchQuery, signal?: AbortSignal): Promise<LibrarySearchResult>;
  getItem(id: string, signal?: AbortSignal): Promise<LibraryItem | null>;
  download(id: string, signal?: AbortSignal): Promise<{ assetUrl: string; item: LibraryItem }>;
}
