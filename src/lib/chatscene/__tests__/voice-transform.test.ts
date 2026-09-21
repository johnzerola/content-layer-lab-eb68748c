import { describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  VOICE_TRANSFORM_PRESETS,
  buildAtempoChain,
  ratioToSemitones,
  selectionFromTransformPreset,
  semitonesToRatio,
  synthesisTransformForProfile,
} from "../voice-transform";
import { VoiceTransformEngine } from "../voice-transform.server";

function sineWaveWav(durationSec: number, sampleRate = 24_000, channels = 1): Buffer {
  const frames = Math.round(durationSec * sampleRate);
  const dataBytes = frames * channels * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * channels * 2, 28);
  wav.writeUInt16LE(channels * 2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataBytes, 40);
  for (let frame = 0; frame < frames; frame += 1) {
    const sample = Math.round(Math.sin((2 * Math.PI * 440 * frame) / sampleRate) * 5_000);
    for (let channel = 0; channel < channels; channel += 1) {
      wav.writeInt16LE(sample, 44 + (frame * channels + channel) * 2);
    }
  }
  return wav;
}

describe("VoiceTransform math", () => {
  it("converte razão e semitons nos dois sentidos", () => {
    expect(ratioToSemitones(1.3)).toBeCloseTo(4.54214, 4);
    expect(ratioToSemitones(1.4)).toBeCloseTo(5.82512, 4);
    expect(semitonesToRatio(ratioToSemitones(1.3))).toBeCloseTo(1.3, 8);
  });

  it("divide extremos em estágios atempo seguros", () => {
    expect(buildAtempoChain(0.25)).toEqual([0.5, 0.5]);
    expect(buildAtempoChain(4)).toEqual([2, 2]);
    for (const stage of buildAtempoChain(0.1)) expect(stage).toBeGreaterThanOrEqual(0.5);
    for (const stage of buildAtempoChain(8)) expect(stage).toBeLessThanOrEqual(2);
  });

  it("mantém IDs únicos e limites conservadores nos presets", () => {
    expect(new Set(VOICE_TRANSFORM_PRESETS.map((preset) => preset.id)).size).toBe(VOICE_TRANSFORM_PRESETS.length);
    expect(VOICE_TRANSFORM_PRESETS.find((preset) => preset.id === "adam_child_cartoon")?.safePitchRange).toEqual([5.5, 6.2]);
  });

  it("transforma tom fino e grave sem mudar o tempo da fala", () => {
    for (const pitch of [-4, 4]) {
      const userSelection = selectionFromTransformPreset("adam_natural");
      userSelection.presetId = "user-pitch";
      userSelection.config.mode = "PITCH_ONLY";
      userSelection.config.pitchSemitones = pitch;
      const selection = synthesisTransformForProfile({ transform: userSelection });
      expect(selection?.config).toMatchObject({
        mode: "PITCH_ONLY", speedMultiplier: 1, pitchSemitones: pitch,
        linkedPitchToSpeed: false,
      });
    }
    const fast = selectionFromTransformPreset("dialogue_fast");
    const tuned = synthesisTransformForProfile({ pitch: -4, transform: fast });
    expect(tuned?.config.mode).toBe("SPEED_AND_PITCH");
    expect(tuned?.config.speedMultiplier).toBe(1.3);
    expect(tuned?.config.pitchSemitones).toBe(-4);
    expect(fast.config.pitchSemitones).toBe(0);
    expect(synthesisTransformForProfile({ pitch: 2 })).toBeUndefined();
  });

  it("expõe modificadores de rádio e personagem sem quebrar configs antigas", () => {
    const radio = selectionFromTransformPreset("news_radio");
    expect(radio.config.effect).toBe("radio");
    const legacy = { ...selectionFromTransformPreset("adam_natural").config };
    delete legacy.effect;
    expect(synthesisTransformForProfile({ transform: { presetId: "legacy", config: legacy } })?.config.effect)
      .toBeUndefined();
  });
});

describe("VoiceTransform FFmpeg baseline", () => {
  const engine = new VoiceTransformEngine();
  const input = sineWaveWav(10);

  it("expõe as capacidades instaladas sem prometer preservação de formantes", async () => {
    const capabilities = await engine.getCapabilities();
    expect(capabilities.ffmpegVersion).toContain("ffmpeg version 6.1.1");
    expect(capabilities.filters).toEqual(expect.arrayContaining(["asetrate", "atempo", "loudnorm", "volumedetect"]));
    expect(capabilities.preserveFormants).toBe(false);
  }, 20_000);

  it("varispeed 1.30 produz aproximadamente 7,69 s", async () => {
    const selection = selectionFromTransformPreset("adam_roblox_teen");
    const result = await engine.transform(input, selection.config, selection.presetId);
    expect(result.audio.byteLength).toBeGreaterThan(0);
    expect(result.output.durationSec).toBeCloseTo(10 / 1.3, 1);
    expect(result.output.sampleRate).toBe(24_000);
    expect(result.output.channels).toBe(1);
    expect(result.output.peakDb ?? 1).toBeLessThanOrEqual(0);
  }, 30_000);

  it("varispeed com restauração mantém aproximadamente 10 s e +4,54 st", async () => {
    const selection = selectionFromTransformPreset("adam_child_pitch_only");
    const result = await engine.transform(input, selection.config, selection.presetId);
    expect(result.output.durationSec).toBeCloseTo(10, 1);
    expect(result.effectivePitchSemitones).toBeCloseTo(4.54214, 4);
  }, 30_000);

  it.runIf(process.env["CHATSCENE_WRITE_VOICE_ARTIFACTS"] === "1")("gera um artefato mensurável por preset", async () => {
    const outputDir = resolve("output/chatscene-voice-transform-v1");
    await mkdir(outputDir, { recursive: true });
    const manifest: Record<string, unknown>[] = [];
    for (const preset of VOICE_TRANSFORM_PRESETS) {
      const result = await engine.transform(input, preset.config, preset.id);
      await writeFile(resolve(outputDir, `${preset.id}.mp3`), result.audio);
      manifest.push({
        presetId: preset.id,
        sourceDurationSec: result.source.durationSec,
        finalDurationSec: result.output.durationSec,
        speedRatio: preset.config.speedMultiplier,
        measuredSampleRate: result.output.sampleRate,
        channels: result.output.channels,
        effectivePitchTargetSemitones: result.effectivePitchSemitones,
        peakDb: result.output.peakDb,
        meanVolumeDb: result.output.meanVolumeDb,
        processingMs: result.processingMs,
        cacheHit: result.cacheHit,
      });
    }
    await writeFile(resolve(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    expect(manifest).toHaveLength(VOICE_TRANSFORM_PRESETS.length);
  }, 120_000);
});
