import { applyEasing, clipLocalTime } from "./animation";
import type { Clip, ClipMotionSettings, VideoAdjustments } from "./types";

export const NEUTRAL_VIDEO_ADJUSTMENTS: VideoAdjustments = {
  exposure: 0, brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0,
  highlights: 0, shadows: 0, fade: 0, sharpen: 0, vignette: 0, grain: 0, blur: 0,
};

export interface ResolvedClipPresentation {
  opacity: number;
  translateX: number;
  translateY: number;
  scale: number;
  rotation: number;
  filter: string;
  overlay: string | null;
  overlayOpacity: number;
}

export function videoAdjustmentFilter(input?: Partial<VideoAdjustments>): string {
  const value = { ...NEUTRAL_VIDEO_ADJUSTMENTS, ...input };
  const brightness = Math.max(.1, 1 + value.exposure * .7 + value.brightness * .55 + value.shadows * .12);
  const contrast = Math.max(.1, 1 + value.contrast * .65 - value.fade * .28 + value.highlights * .08 + value.sharpen * .12);
  const saturation = Math.max(0, 1 + value.saturation * .8);
  const hue = value.tint * 18;
  const sepia = Math.max(0, value.temperature) * .18;
  return `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) hue-rotate(${hue}deg) sepia(${sepia}) blur(${Math.max(0, value.blur)}px)`;
}

export function resolveClipPresentation(clip: Clip, projectTime: number): ResolvedClipPresentation {
  const duration = Math.max(.04, Number(clip.projectEnd) - Number(clip.projectStart));
  const local = clipLocalTime(clip, projectTime);
  const result: ResolvedClipPresentation = { opacity: 1, translateX: 0, translateY: 0, scale: 1, rotation: 0, filter: videoAdjustmentFilter(clip.adjustments), overlay: null, overlayOpacity: 0 };
  const adjustments = { ...NEUTRAL_VIDEO_ADJUSTMENTS, ...clip.adjustments };
  if (adjustments.vignette > 0) { result.overlay = "radial-gradient(circle,transparent 42%,#000 100%)"; result.overlayOpacity = adjustments.vignette * .72; }
  else if (adjustments.grain > 0) { result.overlay = "repeating-radial-gradient(circle at 30% 20%,#fff0 0 1px,#fff3 2px,#0002 3px)"; result.overlayOpacity = adjustments.grain * .16; }
  applyMotion(result, clip.motion, local, duration);
  for (const effect of clip.effects.filter((item) => item.enabled)) {
    const start = Number(effect.parameters["start"] ?? 0);
    const end = Number(effect.parameters["end"] ?? duration);
    if (local < start || local > end) continue;
    const p = (local - start) / Math.max(.04, end - start);
    const k = Number(effect.parameters["intensity"] ?? .6);
    const wave = Math.sin(p * Math.PI);
    if (effect.definitionId === "zoom-burst") result.scale *= 1 + (1 - p) * .28 * k;
    if (effect.definitionId === "slow-zoom") result.scale *= 1 + p * .14 * k;
    if (effect.definitionId === "pulse") result.scale *= 1 + Math.abs(Math.sin(local * Math.PI * 2)) * .06 * k;
    if (effect.definitionId === "shake") { result.translateX += Math.sin(local * 73) * 2.2 * k; result.translateY += Math.cos(local * 61) * 1.5 * k; }
    if (effect.definitionId === "whip") result.translateX += (1 - p) * 24 * k;
    if (effect.definitionId === "flash") { result.overlay = "#ffffff"; result.overlayOpacity = (1 - p) * .72 * k; }
    if (effect.definitionId === "light-leak") { result.overlay = "#ff7b3d"; result.overlayOpacity = wave * .28 * k; }
    if (effect.definitionId === "vignette") { result.overlay = "radial-gradient(circle,transparent 42%,#000 100%)"; result.overlayOpacity = .72 * k; }
    if (effect.definitionId === "film-grain") { result.overlay = "repeating-radial-gradient(circle at 30% 20%,#fff0 0 1px,#fff3 2px,#0002 3px)"; result.overlayOpacity = .16 * k; }
    if (["rgb-split", "glitch", "vhs"].includes(effect.definitionId)) result.filter += ` contrast(${1 + .18 * k}) saturate(${1 + .3 * k}) hue-rotate(${Math.sin(local * 20) * 4 * k}deg)`;
  }
  return result;
}

function applyMotion(result: ResolvedClipPresentation, motion: ClipMotionSettings | undefined, local: number, duration: number) {
  if (motion?.in) applyPreset(result, motion.in.id, applyEasing(local / Math.max(.04, motion.in.duration), motion.in.easing), motion.in.intensity, false);
  if (motion?.out) applyPreset(result, motion.out.id, applyEasing((duration - local) / Math.max(.04, motion.out.duration), motion.out.easing), motion.out.intensity, false);
  if (motion?.loop) {
    const phase = (local / Math.max(.2, motion.loop.duration)) % 1;
    applyPreset(result, motion.loop.id, phase, motion.loop.intensity, true);
  }
}

function applyPreset(result: ResolvedClipPresentation, id: string, progress: number, intensity: number, loop: boolean) {
  const p = Math.max(0, Math.min(1, progress));
  const k = Math.max(0, Math.min(2, intensity));
  if (id.includes("fade")) result.opacity *= p;
  if (id.includes("slide-left")) result.translateX += (p - 1) * 35 * k;
  else if (id.includes("slide-right")) result.translateX += (1 - p) * 35 * k;
  else if (id.includes("slide-up")) result.translateY += (1 - p) * 30 * k;
  else if (id.includes("slide-down")) result.translateY += (p - 1) * 30 * k;
  if (id.includes("zoom") || id.includes("pop")) result.scale *= Math.max(.2, 1 - (1 - p) * .28 * k);
  if (id.includes("spin")) result.rotation += (p - 1) * 180 * k;
  if (id.includes("bounce")) result.translateY -= Math.abs(Math.sin(p * Math.PI * (loop ? 2 : 1))) * 8 * k;
  if (id.includes("float")) result.translateY += Math.sin(p * Math.PI * 2) * 3.5 * k;
  if (id.includes("pulse")) result.scale *= 1 + Math.sin(p * Math.PI * 2) * .055 * k;
  if (id.includes("shake")) result.translateX += Math.sin(p * Math.PI * 10) * 2.5 * k;
}
