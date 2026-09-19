import { describe, expect, it } from "vitest";
import { compactGeneratedSpeech } from "../voice-pauses";

function buffer(samples: number[], sampleRate = 1_000): AudioBuffer {
  const data = Float32Array.from(samples);
  return {
    sampleRate,
    length: data.length,
    duration: data.length / sampleRate,
    numberOfChannels: 1,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

function createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
  expect(channels).toBe(1);
  return buffer(Array(length).fill(0), sampleRate);
}

describe("compactação de pausas da voz gerada", () => {
  it("encurta silêncios longos sem mudar os samples da fala", () => {
    const speech = Array(200).fill(0.25);
    const original = buffer([
      ...Array(400).fill(0),
      ...speech,
      ...Array(400).fill(0),
      ...speech,
      ...Array(400).fill(0),
    ]);
    const compact = compactGeneratedSpeech(original, createBuffer);
    expect(compact.duration).toBeLessThan(0.8);
    expect(compact.duration).toBeGreaterThan(0.4);
    expect(Array.from(compact.getChannelData(0)).filter((sample) => sample > 0.2)).toHaveLength(400);
  });

  it("preserva uma pausa curta e um áudio sem voz", () => {
    const natural = buffer([...Array(200).fill(0.2), ...Array(150).fill(0), ...Array(200).fill(0.2)]);
    expect(compactGeneratedSpeech(natural, createBuffer)).toBe(natural);
    const silent = buffer(Array(1_000).fill(0));
    expect(compactGeneratedSpeech(silent, createBuffer)).toBe(silent);
  });
});
