import { describe, expect, it } from "vitest";
import { getPiperLocalStatus, synthesizePiperWav } from "../voice-piper.server";
import { voiceTransformEngine } from "../voice-transform.server";
import { voiceTransformPreset } from "../voice-transform";

const status = getPiperLocalStatus();

describe.skipIf(!status.available)("Piper local PT-BR", () => {
  it("gera um WAV PCM válido para a prévia de voz", async () => {
    const wav = await synthesizePiperWav("Você não vai acreditar no que aconteceu hoje.", 1);
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.subarray(8, 12).toString("ascii")).toBe("WAVE");
    expect(wav.readUInt32LE(24)).toBe(22_050);
    expect(wav.length).toBeGreaterThan(20_000);
  }, 45_000);

  it("aceita a voz Faber como base dos presets de transformação", async () => {
    const wav = await synthesizePiperWav("Você não vai acreditar no que aconteceu hoje.", 1);
    const preset = voiceTransformPreset("adam_roblox_teen");
    const result = await voiceTransformEngine.transform(wav, preset.config, preset.id);
    expect(result.mime).toBe("audio/mpeg");
    expect(result.audio.length).toBeGreaterThan(5_000);
    expect(result.output.durationSec).toBeGreaterThan(0.5);
    expect(result.effectivePitchSemitones).toBeGreaterThan(0);
  }, 60_000);
});
