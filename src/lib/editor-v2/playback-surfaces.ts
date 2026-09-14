import type { EditorProjectV2 } from "./types";

/**
 * Keeps one decoded video surface across adjacent hard cuts from the same asset.
 * A real transition starts a new surface because both clips must exist together.
 */
export function createPlaybackSurfaceKeys(project: EditorProjectV2): Record<string, string> {
  const keys: Record<string, string> = {};
  const transitionBoundaries = new Set(project.transitions.map((transition) => `${transition.fromClipId}:${transition.toClipId}`));

  for (const track of project.tracks) {
    const clips = [...track.clips].sort((left, right) => Number(left.projectStart) - Number(right.projectStart));
    let previous = clips[0];
    let groupId = previous?.id ?? "empty";
    for (const clip of clips) {
      const continuesHardCut = previous !== clip
        && clip.kind === "video"
        && previous?.kind === "video"
        && Boolean(clip.assetId)
        && clip.assetId === previous.assetId
        && Math.abs(Number(previous.projectEnd) - Number(clip.projectStart)) < 0.001
        && !transitionBoundaries.has(`${previous.id}:${clip.id}`);
      if (!continuesHardCut) groupId = clip.id;
      keys[clip.id] = clip.kind === "video" ? `video:${track.id}:${groupId}` : clip.id;
      previous = clip;
    }
  }

  return keys;
}
