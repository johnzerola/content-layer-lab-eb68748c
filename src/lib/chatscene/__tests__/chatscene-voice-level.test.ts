import { describe, expect, it } from "vitest";
import { dialogueGain } from "../voice-level";

function buffer(samples: number[]): AudioBuffer {
  return {
    numberOfChannels: 1,
    getChannelData: () => Float32Array.from(samples),
  } as unknown as AudioBuffer;
}

describe("nivel de dialogo", () => {
  it("aproxima uma fala baixa e uma alta sem estourar os picos", () => {
    const quietGain = dialogueGain(buffer(Array(200).fill(0.025)));
    const loudGain = dialogueGain(buffer(Array(200).fill(0.25)));
    expect(quietGain).toBeGreaterThan(loudGain);
    expect(quietGain * 0.025).toBeCloseTo(loudGain * 0.25, 2);
    expect(loudGain * 0.25).toBeLessThanOrEqual(0.9);
  });

  it("ignora o silencio no calculo e nunca amplifica um clipe mudo", () => {
    const spoken = buffer([...Array(100).fill(0), ...Array(100).fill(0.12)]);
    const continuous = buffer(Array(200).fill(0.12));
    expect(dialogueGain(spoken)).toBeCloseTo(dialogueGain(continuous), 5);
    expect(dialogueGain(buffer(Array(200).fill(0)))).toBe(1);
  });
});
