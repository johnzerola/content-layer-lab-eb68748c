import { describe, expect, it } from "vitest";
import { extractVideoLinks, MAX_LINK_BATCH } from "@/lib/link-import";

describe("extractVideoLinks", () => {
  it("aceita lista numerada e preserva a ordem", () => {
    const text = `
      1.1 - https://vt.tiktok.com/ZSqdJmKWh/
      1.2 - https://vt.tiktok.com/ZSqdJuXG2/
      3- https://example.com/video.mp4
    `;
    expect(extractVideoLinks(text)).toEqual([
      "https://vt.tiktok.com/ZSqdJmKWh/",
      "https://vt.tiktok.com/ZSqdJuXG2/",
      "https://example.com/video.mp4",
    ]);
  });

  it("remove duplicados e pontuação final", () => {
    expect(extractVideoLinks("https://example.com/a.mp4, https://example.com/a.mp4)")).toEqual([
      "https://example.com/a.mp4",
    ]);
  });

  it("limita lotes excessivos", () => {
    const text = Array.from({ length: MAX_LINK_BATCH + 5 }, (_, i) => `https://example.com/${i}`).join("\n");
    expect(extractVideoLinks(text)).toHaveLength(MAX_LINK_BATCH);
  });
});
