export const TIMELINE_BASE_PX_PER_SECOND = 52;
export const MIN_TIMELINE_ZOOM = 0.01;
export const MAX_TIMELINE_ZOOM = 12;

export function clampTimelineZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(MIN_TIMELINE_ZOOM, Math.min(MAX_TIMELINE_ZOOM, value));
}

export function timelineZoomToSlider(zoom: number): number {
  return Math.log2(clampTimelineZoom(zoom));
}

export function timelineSliderToZoom(value: number): number {
  return clampTimelineZoom(2 ** value);
}

export function fitTimelineZoom(
  duration: number,
  viewportWidth: number,
  labelWidth = 136,
  endPadding = 120,
): number {
  const available = Math.max(120, viewportWidth - labelWidth - endPadding);
  return clampTimelineZoom(available / (Math.max(1, duration) * TIMELINE_BASE_PX_PER_SECOND));
}

export function timelineTickStep(pxPerSecond: number, minimumSpacing = 44): number {
  const candidates = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800];
  return (
    candidates.find((seconds) => seconds * pxPerSecond >= minimumSpacing) ??
    candidates[candidates.length - 1]!
  );
}
