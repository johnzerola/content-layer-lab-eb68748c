import type { Template, VideoLayer } from './template';

export type VideoKeyframeBox = Pick<VideoLayer, 'x' | 'y' | 'w' | 'h' | 'radius'>;
export type VideoKeyframeProperty = keyof VideoKeyframeBox;

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

/** Cria ou atualiza somente uma propriedade, sem prender os outros controles ao mesmo instante. */
export function upsertVideoPropertyKeyframe(
  t: Template,
  time: number,
  property: VideoKeyframeProperty,
  value = videoBoxAt(t, time)[property],
): Template {
  const at = Number(Math.max(0, time).toFixed(2));
  const existing = (t.videoKeyframes ?? []).find(
    (key) => Math.abs(key.t - at) <= KEY_EPSILON && key[property] !== undefined,
  );
  const next = { id: existing?.id ?? crypto.randomUUID(), t: at, [property]: value };
  return {
    ...t,
    videoKeyframes: [
      ...(t.videoKeyframes ?? []).filter((key) => key.id !== existing?.id),
      next,
    ].sort((a, b) => a.t - b.t),
  };
}

export function removeVideoKeyframe(t: Template, id: string): Template {
  return { ...t, videoKeyframes: (t.videoKeyframes ?? []).filter((key) => key.id !== id) };
}

/**
 * Ajusta a caixa base ou, quando a agulha está sobre um keyframe, o próprio
 * keyframe. Assim a sequência "marcar keyframe -> mover/redimensionar" funciona.
 */
export function patchVideoAtTime(t: Template, time: number, patch: Partial<VideoKeyframeBox>): Template {
  let next = t;
  const basePatch: Partial<VideoKeyframeBox> = {};
  for (const [property, value] of Object.entries(patch) as [VideoKeyframeProperty, number][]) {
    const hasPropertyKey = (next.videoKeyframes ?? []).some(
      (key) => Math.abs(key.t - time) <= KEY_EPSILON && key[property] !== undefined,
    );
    if (hasPropertyKey) next = upsertVideoPropertyKeyframe(next, time, property, value);
    else basePatch[property] = value;
  }
  return Object.keys(basePatch).length ? { ...next, video: { ...next.video, ...basePatch } } : next;
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
  const resolved = { ...t.video };
  for (const property of ['x', 'y', 'w', 'h', 'radius'] as VideoKeyframeProperty[]) {
    const propertyKeys = keys.filter((key) => key[property] !== undefined);
    if (!propertyKeys.length) continue;
    const before = propertyKeys.filter((key) => key.t <= time).at(-1);
    const after = propertyKeys.find((key) => key.t > time);
    if (!before) {
      resolved[property] = propertyKeys[0]?.[property] ?? resolved[property];
      continue;
    }
    if (!after) {
      resolved[property] = before[property] ?? resolved[property];
      continue;
    }
    const raw = (time - before.t) / Math.max(0.001, after.t - before.t);
    const p = raw * raw * (3 - 2 * raw);
    const from = before[property] ?? resolved[property];
    const to = after[property] ?? resolved[property];
    resolved[property] = from + (to - from) * p;
  }
  return resolved;
}
