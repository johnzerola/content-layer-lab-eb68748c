import type { Template } from './template';

export function fullscreenAt(t: Template, time: number) {
  let amount = 0;
  for (const clip of t.fullscreenClips ?? []) {
    if (time < clip.start || time >= clip.end) continue;
    const fade = Math.max(0, Math.min(clip.fade, (clip.end - clip.start) / 2));
    const linear = fade ? Math.min(1, (time - clip.start) / fade, (clip.end - time) / fade) : 1;
    amount = Math.max(amount, linear * linear * (3 - 2 * linear));
  }
  const lerp = (a: number, b: number) => a + (b - a) * amount;
  return {
    amount,
    video: { ...t.video, x: lerp(t.video.x, 0), y: lerp(t.video.y, 0),
      w: lerp(t.video.w, t.canvasW ?? 1080), h: lerp(t.video.h, t.canvasH ?? 1920),
      radius: lerp(t.video.radius, 0), rotation: lerp(t.video.rotation, 0) },
  };
}

/** Caixa do vídeo no tempo, interpolando os keyframes com easing suave. */
export function videoBoxAt(t: Template, time: number) {
  const keys = [...(t.videoKeyframes ?? [])].sort((a, b) => a.t - b.t);
  if (!keys.length) return t.video;
  const before = keys.filter((k) => k.t <= time).at(-1);
  const after = keys.find((k) => k.t > time);
  const box = (k: (typeof keys)[number]) => ({ ...t.video, x: k.x, y: k.y, w: k.w, h: k.h, radius: k.radius });
  if (!before) return box(keys[0]!);
  if (!after) return box(before);
  const raw = (time - before.t) / Math.max(0.001, after.t - before.t);
  const p = raw * raw * (3 - 2 * raw);
  const mix = (a: number, b: number) => a + (b - a) * p;
  return {
    ...t.video,
    x: mix(before.x, after.x), y: mix(before.y, after.y),
    w: mix(before.w, after.w), h: mix(before.h, after.h),
    radius: mix(before.radius, after.radius),
  };
}
