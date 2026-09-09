import type { BaseLayer, LayerKeyframe } from "./types";

const NUMERIC = ["x", "y", "width", "height", "rotation", "opacity", "volume", "speed", "blur"] as const;
type NumericKey = typeof NUMERIC[number];

export function resolveLayerAtTime<T extends BaseLayer>(layer: T, time: number): T {
  const keys = [...(layer.keyframes ?? [])].sort((a, b) => a.time - b.time);
  if (!keys.length) return layer;
  const before = keys.filter((key) => key.time <= time).at(-1);
  const after = keys.find((key) => key.time > time);
  if (!before) return { ...layer, ...(keys[0]?.values ?? {}) } as T;
  if (!after) return { ...layer, ...before.values } as T;
  const span = Math.max(0.001, after.time - before.time);
  const p = Math.min(1, Math.max(0, (time - before.time) / span));
  const values: Record<string, number> = {};
  for (const key of NUMERIC) {
    const a = before.values[key as NumericKey];
    const b = after.values[key as NumericKey];
    if (typeof a === "number" && typeof b === "number") values[key] = a + (b - a) * p;
    else if (typeof a === "number") values[key] = a;
  }
  return { ...layer, ...values } as T;
}

export function upsertLayerKeyframe(layer: BaseLayer, time: number, values: LayerKeyframe["values"]): LayerKeyframe[] {
  const next = (layer.keyframes ?? []).filter((key) => Math.abs(key.time - time) > 0.04);
  next.push({ id: `kf-${Date.now()}-${Math.round(time * 100)}`, time: Number(time.toFixed(3)), values });
  return next.sort((a, b) => a.time - b.time);
}
