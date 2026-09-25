import { describe, expect, it } from 'vitest';
import { createTemplate } from '../template';
import { expandVideoFrom, fullscreenAt, patchVideoAtTime, removeVideoKeyframe, upsertVideoKeyframe, upsertVideoPropertyKeyframe, videoBoxAt } from '../template-timeline';
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

describe('keyframes de vídeo do template', () => {
  it('atualiza o keyframe sob a agulha sem alterar a caixa base', () => {
    const base = createTemplate();
    const keyed = upsertVideoKeyframe(base, 4);
    const changed = patchVideoAtTime(keyed, 4.02, { x: 0, y: 0, w: 1080, h: 1920, radius: 0 });
    expect(changed.video).toEqual(base.video);
    expect(changed.videoKeyframes).toHaveLength(1);
    expect(videoBoxAt(changed, 4)).toMatchObject({ x: 0, y: 0, w: 1080, h: 1920, radius: 0 });
  });

  it('mantém ajustes normais na caixa base quando não existe keyframe no instante', () => {
    const base = createTemplate();
    const changed = patchVideoAtTime(base, 3, { w: 900 });
    expect(changed.video.w).toBe(900);
    expect(changed.videoKeyframes ?? []).toHaveLength(0);
  });

  it('cria um novo ponto ao editar uma propriedade já animada fora de um keyframe', () => {
    const base = createTemplate();
    const keyed = upsertVideoPropertyKeyframe(base, 2, 'x', 320);
    const changed = patchVideoAtTime(keyed, 6, { x: 780, y: 940, w: 920, h: 1500, radius: 24 });
    expect(changed.video).toMatchObject({
      x: base.video.x,
      y: 940,
      w: 920,
      h: 1500,
      radius: 24,
    });
    expect(changed.videoKeyframes).toHaveLength(2);
    expect(changed.videoKeyframes?.find((key) => key.t === 6)).toMatchObject({ x: 780 });
    expect(videoBoxAt(changed, 6)).toMatchObject({ x: 780, y: 940, w: 920, h: 1500, radius: 24 });
  });

  it('Expandir cria um movimento suave a partir do segundo escolhido', () => {
    const base = createTemplate();
    const expanded = expandVideoFrom(base, 10, 30, 0.8);
    expect(expanded.videoKeyframes?.map((key) => key.t)).toEqual([10, 10.8]);
    expect(videoBoxAt(expanded, 10)).toMatchObject({
      x: base.video.x, y: base.video.y, w: base.video.w, h: base.video.h,
    });
    expect(videoBoxAt(expanded, 10.4).w).toBeGreaterThan(base.video.w);
    expect(videoBoxAt(expanded, 10.8)).toMatchObject({ x: 0, y: 0, w: 1080, h: 1920, radius: 0 });
  });

  it('cria e ajusta X, Y, largura e altura em tempos independentes', () => {
    const base = createTemplate();
    let keyed = upsertVideoPropertyKeyframe(base, 0, 'x', 60);
    keyed = upsertVideoPropertyKeyframe(keyed, 2, 'x', 460);
    keyed = upsertVideoPropertyKeyframe(keyed, 0, 'y', 620);
    keyed = upsertVideoPropertyKeyframe(keyed, 4, 'y', 1020);
    keyed = upsertVideoPropertyKeyframe(keyed, 0, 'w', 600);
    keyed = upsertVideoPropertyKeyframe(keyed, 4, 'w', 1000);
    keyed = upsertVideoPropertyKeyframe(keyed, 0, 'h', 800);
    keyed = upsertVideoPropertyKeyframe(keyed, 4, 'h', 1600);
    const changed = patchVideoAtTime(keyed, 4, { y: 1120, w: 1080, h: 1700 });
    expect(videoBoxAt(changed, 3)).toMatchObject({ x: 460, y: 1041.875, w: 1005, h: 1559.375 });
    expect(videoBoxAt(changed, 4)).toMatchObject({ x: 460, y: 1120, w: 1080, h: 1700 });
  });

  it('exclui somente o keyframe selecionado sem apagar os demais', () => {
    const base = createTemplate();
    const withX = upsertVideoPropertyKeyframe(base, 2, 'x', 400);
    const withY = upsertVideoPropertyKeyframe(withX, 2, 'y', 900);
    const xKey = withY.videoKeyframes?.find((key) => key.x !== undefined);
    expect(xKey).toBeDefined();
    const removed = removeVideoKeyframe(withY, xKey?.id ?? 'missing');
    expect(removed.videoKeyframes).toHaveLength(1);
    expect(removed.videoKeyframes?.[0]).toMatchObject({ t: 2, y: 900 });
    expect(videoBoxAt(removed, 2)).toMatchObject({ x: base.video.x, y: 900 });
  });

  it('mantém compatibilidade com keyframes antigos completos', () => {
    const base = createTemplate();
    const legacy = upsertVideoKeyframe(upsertVideoKeyframe(base, 0), 4, { x: 460, y: 1020, w: 1080, h: 1600, radius: 0 });
    expect(videoBoxAt(legacy, 2)).toMatchObject({ x: 260, y: 820, w: 1020, h: 1340, radius: 12 });
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
