import { describe, expect, it } from "vitest";
import { applyTemplateToVideo } from "@/lib/video-template/bindings";
import { cutAsSource, cutBinding, cutsFromClips, readCutBinding, type CutRecord } from "@/lib/editor/cuts";
import type { TemplateDoc } from "@/lib/video-template/types";

function baseTemplate(): TemplateDoc {
  return {
    version: 1,
    name: "Template",
    aspectRatio: "9:16",
    canvas: { width: 1080, height: 1920, background: { kind: "color", color: "#000" } },
    filter: {
      brightness: 1,
      contrast: 1,
      saturation: 1,
      hue: 0,
      sepia: 0,
      grayscale: 0,
      temperature: 0,
      blur: 0,
    },
    layers: [
      {
        id: "v1",
        name: "Vídeo do corte",
        type: "video",
        bindingType: "CUT_VIDEO",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        opacity: 1,
        zIndex: 0,
        visible: true,
        locked: false,
        startTime: 0,
        endTime: null,
        src: "https://exemplo.com/preview.mp4",
        fit: "cover",
        radius: 0,
        muted: false,
        volume: 1,
        speed: 1,
        loop: false,
        backgroundBlur: 0,
        mask: "none",
      },
    ],
    sampleVideoUrl: "https://exemplo.com/preview.mp4",
  };
}

const cut: CutRecord = {
  id: "cut-1",
  sourceId: "src-aula-123",
  sourceName: "aula.mp4",
  title: "O gancho que prende",
  start: 12.5,
  end: 45,
  score: 88,
  createdAt: new Date().toISOString(),
};

describe("aplicação de template a um corte real", () => {
  it("substitui o CUT_VIDEO pelo vídeo do corte", () => {
    const doc = applyTemplateToVideo(baseTemplate(), cutAsSource(cut, `cut://${cut.id}`));
    const layer = doc.layers[0]!;
    expect(layer.type).toBe("video");
    expect((layer as { src: string | null }).src).toBe("cut://cut-1");
    expect(doc.sampleVideoUrl).toBe("cut://cut-1");
    expect(doc.settings?.["boundSourceId"]).toBe("cut-1");
  });

  it("herda a duração do corte na camada ligada", () => {
    const doc = applyTemplateToVideo(baseTemplate(), cutAsSource(cut, "cut://cut-1"));
    expect(doc.layers[0]!.endTime).toBeCloseTo(32.5, 3);
  });

  it("não altera o template original", () => {
    const template = baseTemplate();
    applyTemplateToVideo(template, cutAsSource(cut, "cut://cut-1"));
    expect((template.layers[0] as { src: string | null }).src).toBe("https://exemplo.com/preview.mp4");
  });

  it("guarda e relê o vínculo do corte para a renderização", () => {
    const binding = cutBinding(cut);
    const read = readCutBinding({ cut: binding });
    expect(read).toEqual(binding);
    expect(readCutBinding({})).toBeNull();
  });

  it("converte cortes gerados pela IA em registros com id estável", () => {
    const file = { name: "aula.mp4", size: 1234 } as File;
    const records = cutsFromClips([{ start: 1, end: 20, score: 77.4, title: "Corte A" }], file);
    expect(records[0]!.sourceId).toBe("src-aula-mp4-1234");
    expect(records[0]!.score).toBe(77);
    expect(records[0]!.title).toBe("Corte A");
  });
});
