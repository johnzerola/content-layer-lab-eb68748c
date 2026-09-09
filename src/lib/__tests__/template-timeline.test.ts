import { describe, expect, it } from 'vitest';
import { createTemplate } from '../template';
import { fullscreenAt } from '../template-timeline';
import { subtractRanges } from '../editor/transcript';
import { outputTimeAtSrc, segmentsDuration, srcTimeAt } from '../preedit';

describe('template fullscreen timeline', () => {
  const t = { ...createTemplate(), fullscreenClips: [{ id: 'one', start: 10, end: 20, fade: 1 }] };
  it('preserves the layout outside a fullscreen interval', () => {
    expect(fullscreenAt(t, 9).video).toEqual(t.video);
    expect(fullscreenAt(t, 20).amount).toBe(0);
    expect(t.video).toEqual(createTemplate().video);
  });
  it('expands smoothly, hides overlays, and returns to the original layout', () => {
    expect(fullscreenAt(t, 10).amount).toBe(0);
    expect(fullscreenAt(t, 10.5).amount).toBeCloseTo(0.5);
    expect(fullscreenAt(t, 12).video).toMatchObject({ x: 0, y: 0, w: 1080, h: 1920, radius: 0 });
    expect(fullscreenAt(t, 12).amount).toBe(1);
    expect(fullscreenAt(t, 19.5).amount).toBeCloseTo(0.5);
  });
  it('supports hard cuts and clamps excessive transition duration', () => {
    expect(fullscreenAt({ ...t, fullscreenClips: [{ id: 'cut', start: 2, end: 4, fade: 0 }] }, 2).amount).toBe(1);
    expect(fullscreenAt({ ...t, fullscreenClips: [{ id: 'short', start: 2, end: 4, fade: 10 }] }, 3).amount).toBe(1);
  });
  it('uses custom canvas dimensions and supports overlapping intervals', () => {
    const custom = { ...t, canvasW: 1920, canvasH: 1080, fullscreenClips: [...t.fullscreenClips, { id: 'two', start: 19, end: 25, fade: 0 }] };
    expect(fullscreenAt(custom, 19.5).video).toMatchObject({ w: 1920, h: 1080 });
    expect(fullscreenAt(custom, 19.5).amount).toBe(1);
  });
});

describe('montagem e intervalos removidos', () => {
  it('remove palavras da montagem sem destruir segmentos vizinhos', () => {
    expect(subtractRanges(
      [{ start: 0, end: 10 }, { start: 20, end: 30 }],
      [{ start: 3, end: 5 }, { start: 23, end: 25 }],
    )).toEqual([
      { start: 0, end: 3 }, { start: 5, end: 10 },
      { start: 20, end: 23 }, { start: 25, end: 30 },
    ]);
  });

  it('converte o relógio original para o tempo compacto', () => {
    expect(outputTimeAtSrc([{ start: 0, end: 3 }, { start: 8, end: 12 }], 2)).toBe(2);
    expect(outputTimeAtSrc([{ start: 0, end: 3 }, { start: 8, end: 12 }], 9)).toBe(4);
  });

  it('aplica velocidade constante ao relógio da montagem', () => {
    const segments = [{ start: 0, end: 4, speed: 2 }, { start: 10, end: 12, speed: 0.5 }];
    expect(segmentsDuration(segments)).toBe(6);
    expect(srcTimeAt(segments, 1)).toBe(2);
    expect(srcTimeAt(segments, 5)).toBe(11.5);
    expect(outputTimeAtSrc(segments, 11)).toBe(4);
  });
});
