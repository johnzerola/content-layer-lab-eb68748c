import type { Clip, EditorProjectV2, Transition } from "./types";

export interface TransitionTarget {
  from: Clip;
  to: Clip;
  boundary: number;
  maxDuration: number;
  distance: number;
  existing: Transition | undefined;
}

/** Finds the editable cut closest to the playhead across visual tracks. */
export function findTransitionTarget(project: EditorProjectV2, at: number, preferredClipId?: string | null): TransitionTarget | null {
  const tolerance = Math.max(0.05, 1 / Math.max(1, project.settings.fps));
  const candidates: Array<TransitionTarget & { preferred: boolean; trackOrder: number }> = [];

  for (const track of project.tracks) {
    if (!(["video", "overlay"] as const).includes(track.kind as "video" | "overlay") || track.locked) continue;
    const clips = [...track.clips]
      .filter((clip) => clip.enabled && clip.kind !== "audio" && clip.kind !== "caption")
      .sort((left, right) => Number(left.projectStart) - Number(right.projectStart));

    for (let index = 0; index < clips.length - 1; index += 1) {
      const from = clips[index]!;
      const to = clips[index + 1]!;
      const boundary = Number(to.projectStart);
      if (Math.abs(Number(from.projectEnd) - boundary) > tolerance) continue;
      const fromDuration = Number(from.projectEnd) - Number(from.projectStart);
      const toDuration = Number(to.projectEnd) - Number(to.projectStart);
      candidates.push({
        from,
        to,
        boundary,
        maxDuration: Math.max(0, Math.min(fromDuration, toDuration) / 2),
        distance: Math.abs(boundary - at),
        existing: project.transitions.find((transition) => transition.fromClipId === from.id && transition.toClipId === to.id),
        preferred: from.id === preferredClipId || to.id === preferredClipId,
        trackOrder: track.order,
      });
    }
  }

  candidates.sort((left, right) => left.distance - right.distance || Number(right.preferred) - Number(left.preferred) || left.trackOrder - right.trackOrder);
  const target = candidates[0];
  if (!target) return null;
  const { preferred: _preferred, trackOrder: _trackOrder, ...result } = target;
  return result;
}

export function clampTransitionDuration(value: number, minimum: number, maximum: number) {
  if (maximum <= 0) return 0;
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}
