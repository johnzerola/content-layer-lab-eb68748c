import { describe, expect, it } from "vitest";
import {
  RENDER_MANIFEST_VERSION,
  buildRenderManifest,
  checkManifest,
  validateAgainstManifest,
} from "@/lib/render-manifest";

describe("render manifest", () => {
  it("normaliza entradas parciais", () => {
    const m = buildRenderManifest({ keyframes: [{ time: 3, crop: { x: 0, y: 0, width: 1, height: 1 } }, { time: 1, crop: { x: 0, y: 0, width: 1, height: 1 } }] });
    expect(m.version).toBe(RENDER_MANIFEST_VERSION);
    expect(m.output).toMatchObject({ width: 1080, height: 1920, fps: 30, format: "mp4" });
    expect(m.keyframes.map((k) => k.time)).toEqual([1, 3]);
  });

  it("recusa versão incompatível", () => {
    expect(checkManifest({ version: 99, output: { width: 1, height: 1 } }).ok).toBe(false);
    expect(checkManifest(buildRenderManifest()).ok).toBe(true);
  });

  it("valida resolução, duração e áudio do arquivo final", () => {
    const m = buildRenderManifest({ trim: { start: 0, end: 10 } });
    expect(validateAgainstManifest(m, { durationSec: 10.1, width: 1080, height: 1920, hasAudio: true }).ok).toBe(true);
    expect(validateAgainstManifest(m, { durationSec: 4, width: 1080, height: 1920, hasAudio: true }).ok).toBe(false);
    expect(validateAgainstManifest(m, { durationSec: 10, width: 720, height: 1280, hasAudio: true }).ok).toBe(false);
    expect(validateAgainstManifest(m, { durationSec: 10, width: 1080, height: 1920, hasAudio: false }).ok).toBe(false);
  });
});
