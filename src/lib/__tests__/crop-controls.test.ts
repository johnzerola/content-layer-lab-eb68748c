import { describe, expect, it } from 'vitest';
import { boundCrop, dragCrop, FULL_CROP } from '../editor/crop-controls';
import { mediaFrameFromPre } from '../editor/media-frame';
import { defaultPreEdit } from '../preedit';

describe('interactive source crop', () => {
  it('moves a selection without changing its size or leaving the source', () => {
    const crop = { x: 0.2, y: 0.2, w: 0.4, h: 0.5 };
    expect(dragCrop(crop, 'move', 2, -2)).toEqual({ x: 0.6, y: 0, w: 0.4, h: 0.5 });
    expect(crop.x).toBe(0.2);
  });
  it('resizes each edge while keeping the opposite corner anchored', () => {
    expect(dragCrop(FULL_CROP, 'nw', 0.25, 0.5)).toEqual({ x: 0.25, y: 0.5, w: 0.75, h: 0.5 });
    expect(dragCrop(FULL_CROP, 'se', -0.5, -0.25)).toEqual({ x: 0, y: 0, w: 0.5, h: 0.75 });
    expect(dragCrop(FULL_CROP, 'e', -0.5, 0.5).h).toBe(1);
    expect(dragCrop(FULL_CROP, 's', 0.5, -0.5).w).toBe(1);
  });
  it('prevents inverted or empty selections when dragging across the opposite edge', () => {
    for (const handle of ['n', 's', 'e', 'w', 'nw', 'ne', 'se', 'sw']) {
      const crop = dragCrop(FULL_CROP, handle, 4, 4);
      expect(crop.w).toBeGreaterThanOrEqual(0.02);
      expect(crop.h).toBeGreaterThanOrEqual(0.02);
      expect(crop.x + crop.w).toBeLessThanOrEqual(1);
      expect(crop.y + crop.h).toBeLessThanOrEqual(1);
    }
    expect(boundCrop({ x: -1, y: 4, w: 2, h: 0 })).toEqual({ x: 0, y: 0.98, w: 1, h: 0.02 });
  });
  it('passes the exact selection to the shared preview/export renderer, including rotation', () => {
    const pre = { ...defaultPreEdit(), crop: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, rotate: 90 as const };
    const frame = mediaFrameFromPre(pre, 1920, 1080, 10);
    expect(frame).toMatchObject({ sx: 480, sy: 270, sw: 960, sh: 540, ew: 540, eh: 960, quarter: 1 });
  });
});
