import { describe, expect, it } from "vitest";
import { suppressMusicBleed } from "../editor/stems";

describe("suppressMusicBleed", () => {
  it("removes correlated music from the voice stem", () => {
    const music = Float32Array.from([0.2, -0.4, 0.6, -0.1, 0.3]);
    const speech = Float32Array.from([0.1, 0.1, 0.1, 0.1, 0.1]);
    const leaked = Float32Array.from(music, (value, i) => speech[i]! + value * 0.5);
    const clean = suppressMusicBleed([leaked], [music])[0]!;
    expect(clean.reduce((sum, value, i) => sum + Math.abs(value - speech[i]!), 0)).toBeLessThan(0.2);
  });

  it("does not change an independent voice signal", () => {
    const voice = Float32Array.from([0.1, 0.2, 0.3, 0.4]);
    const music = Float32Array.from([0.4, -0.3, 0.2, -0.1]);
    const clean = suppressMusicBleed([voice], [music], 0.65)[0]!;
    expect(clean.length).toBe(voice.length);
    expect(clean[0]).toBeLessThanOrEqual(voice[0]!);
  });
});
