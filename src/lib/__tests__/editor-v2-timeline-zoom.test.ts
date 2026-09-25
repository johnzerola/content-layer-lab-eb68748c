import { describe, expect, it } from "vitest";
import {
  MAX_TIMELINE_ZOOM,
  MIN_TIMELINE_ZOOM,
  fitTimelineZoom,
  timelineSliderToZoom,
  timelineTickStep,
  timelineZoomToSlider,
} from "@/lib/editor-v2";

describe("zoom da timeline do Editor V2", () => {
  it("ajusta um vídeo longo inteiro no espaço disponível", () => {
    const zoom = fitTimelineZoom(13 * 60 + 43, 1_560);
    expect(zoom).toBeLessThan(0.1);
    expect(zoom).toBeGreaterThanOrEqual(MIN_TIMELINE_ZOOM);
  });

  it("mantém precisão de zoom em uma escala logarítmica", () => {
    for (const zoom of [MIN_TIMELINE_ZOOM, 0.05, 0.35, 1, 4, MAX_TIMELINE_ZOOM]) {
      expect(timelineSliderToZoom(timelineZoomToSlider(zoom))).toBeCloseTo(zoom, 8);
    }
  });

  it("reduz a densidade da régua quando a timeline está afastada", () => {
    expect(timelineTickStep(52)).toBe(1);
    expect(timelineTickStep(5)).toBe(10);
    expect(timelineTickStep(1)).toBe(60);
  });
});
