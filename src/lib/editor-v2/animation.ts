import type { Easing } from "@/lib/video-template/types";
import { DEFAULT_CLIP_TRANSFORM } from "./interactions";
import type { AnimatableProperty, Clip, ClipTransform, EditorProjectV2, Keyframe, Transition } from "./types";

export const ANIMATABLE_PROPERTIES: { property: AnimatableProperty; label: string; min: number; max: number; step: number }[] = [
  { property: "x", label: "Posição X", min: 0, max: 100, step: 1 },
  { property: "y", label: "Posição Y", min: 0, max: 100, step: 1 },
  { property: "scale", label: "Escala", min: 0.1, max: 4, step: 0.05 },
  { property: "rotation", label: "Rotação", min: -360, max: 360, step: 1 },
  { property: "opacity", label: "Opacidade", min: 0, max: 1, step: 0.05 },
];

export function clipLocalTime(clip: Clip, projectTime: number): number {
  return clamp(projectTime - Number(clip.projectStart), 0, Number(clip.projectEnd) - Number(clip.projectStart));
}

export function resolveAnimatedTransform(clip: Clip, projectTime: number): ClipTransform {
  const base = { ...DEFAULT_CLIP_TRANSFORM, ...clip.transform };
  const localTime = clipLocalTime(clip, projectTime);
  for (const track of clip.animations) {
    if (track.property in base && track.keyframes.length) base[track.property] = interpolateKeyframes(track.keyframes, localTime);
  }
  return base;
}

export function interpolateKeyframes(keyframes: Keyframe<number>[], time: number): number {
  const points = [...keyframes].sort((a, b) => Number(a.time) - Number(b.time));
  if (!points.length) return 0;
  if (time <= Number(points[0]!.time)) return points[0]!.value;
  if (time >= Number(points.at(-1)!.time)) return points.at(-1)!.value;
  const rightIndex = points.findIndex((point) => Number(point.time) >= time);
  const left = points[rightIndex - 1]!;
  const right = points[rightIndex]!;
  const span = Math.max(0.0001, Number(right.time) - Number(left.time));
  const progress = applyEasing((time - Number(left.time)) / span, right.easing);
  return left.value + (right.value - left.value) * progress;
}

export function applyEasing(value: number, easing: Easing): number {
  const t = clamp(value, 0, 1);
  if (easing === "easeIn") return t * t;
  if (easing === "easeOut") return 1 - (1 - t) * (1 - t);
  if (easing === "easeInOut") return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  return t;
}

export interface TransitionVisualState { opacity: number; translateX: number; scale: number; }

export function resolveTransitionVisual(project: EditorProjectV2, clipId: string, projectTime: number): TransitionVisualState {
  const neutral = { opacity: 1, translateX: 0, scale: 1 };
  const candidate = project.transitions.map((transition) => ({ transition, from: findClip(project, transition.fromClipId) })).find(({ transition, from }) => {
    if (transition.fromClipId !== clipId && transition.toClipId !== clipId || transition.duration <= 0 || !from) return false;
    const boundary = Number(from.projectEnd);
    return projectTime >= boundary - transition.duration && projectTime <= boundary;
  });
  if (!candidate?.from) return neutral;
  const { transition, from } = candidate;
  const boundary = Number(from.projectEnd);
  const start = boundary - transition.duration;
  const progress = applyEasing((projectTime - start) / transition.duration, transition.easing);
  const incoming = transition.toClipId === clipId;
  if (transition.definitionId.includes("slide")) return { opacity: 1, translateX: incoming ? (1 - progress) * 100 : -progress * 35, scale: 1 };
  if (transition.definitionId.includes("zoom")) return { opacity: incoming ? progress : 1 - progress, translateX: 0, scale: incoming ? 0.88 + progress * 0.12 : 1 + progress * 0.08 };
  return { opacity: incoming ? progress : 1 - progress, translateX: 0, scale: 1 };
}

export function transitionAt(project: EditorProjectV2, clipId: string): Transition | undefined {
  return project.transitions.find((item) => item.fromClipId === clipId || item.toClipId === clipId);
}

function findClip(project: EditorProjectV2, id: string) { return project.tracks.flatMap((track) => track.clips).find((clip) => clip.id === id); }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
