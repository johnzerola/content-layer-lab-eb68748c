import type { Template, VideoLayer } from './template';

export type VideoKeyframeBox = Pick<VideoLayer, 'x' | 'y' | 'w' | 'h' | 'radius'>;

const KEY_EPSILON = 0.05;

const keyBox = (video: VideoLayer): VideoKeyframeBox => ({
  x: video.x,
  y: video.y,
  w: video.w,
  h: video.h,
  radius: video.radius,
});

/** Cria ou atualiza o keyframe exatamente sob a agulha. */
export function upsertVideoKeyframe(t: Template, time: number, patch: Partial<VideoKeyframeBox> = {}): Template {
  const at = Number(Math.max(0, time).toFixed(2));
  const current = keyBox(videoBoxAt(t, at));
  const existing = (t.videoKeyframes ?? []).find((key) => Math.abs(key.t - at) <= KEY_EPSILON);
  const next = {
    id: existing?.id ?? crypto.randomUUID(),
    t: at,
    ...current,
    ...patch,
  };
  return {
    ...t,
    videoKeyframes: [
      ...(t.videoKeyframes ?? []).filter((key) => Math.abs(key.t - at) > KEY_EPSILON),
      next,
    ].sort((a, b) => a.t - b.t),
  };
}

/**
 * Ajusta a caixa base ou, quando a agulha está sobre um keyframe, o próprio
 * keyframe. Assim a sequência "marcar keyframe -> mover/redimensionar" funciona.
 */
export function patchVideoAtTime(t: Template, time: number, patch: Partial<VideoKeyframeBox>): Template {
  const hasKey = (t.videoKeyframes ?? []).some((key) => Math.abs(key.t - time) <= KEY_EPSILON);
  if (hasKey) return upsertVideoKeyframe(t, time, patch);
  return { ...t, video: { ...t.video, ...patch } };
}

/** Cria uma animação real da caixa atual até o quadro 9:16 inteiro. */
export function expandVideoFrom(t: Template, time: number, duration: number, transition = 0.8): Template {
  const start = Math.max(0, Math.min(time, Math.max(0, duration - 0.1)));
  const end = Math.min(duration, start + Math.max(0.1, transition));
  const anchored = upsertVideoKeyframe(t, start, keyBox(videoBoxAt(t, start)));
  return upsertVideoKeyframe(anchored, end, {
    x: 0,
    y: 0,
    w: t.canvasW ?? 1080,
    h: t.canvasH ?? 1920,
    radius: 0,
  });
}

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
