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
