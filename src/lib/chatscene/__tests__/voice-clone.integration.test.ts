import { afterAll, describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cloneEngineStatus, saveVoiceReference, deleteVoiceReference, synthesizeClonedVoice, referencePath, shutdownVoiceWorker } from "../voice-clone.server";
import { synthesizePiperWav } from "../voice-piper.server";
import { voiceTransformEngine } from "../voice-transform.server";
import { selectionFromTransformPreset } from "../voice-transform";

describe.runIf(process.env["CHATSCENE_TEST_CLONE"] === "1")("real local reference synthesis", () => {
  afterAll(() => shutdownVoiceWorker());
  it("generates fresh text from synthetic reference and isolates accounts", async () => {
    expect(cloneEngineStatus().installed).toBe(true);
    const owner = `voice-test-${crypto.randomUUID()}`;
    const wav = await synthesizePiperWav("Olá, tudo bem? Hoje vamos contar uma história divertida. Eu sou um personagem sintético e esta é uma amostra de teste.");
    const reference = await saveVoiceReference(owner, wav.toString("base64"), {
      name: "Teste autorizado",
      category: "conversacional",
      gender: "neutra",
      style: "natural",
    });
    try {
      expect(reference.durationSec).toBeGreaterThanOrEqual(3);
      expect(referencePath(owner, reference.id)).not.toBe(referencePath("another-account", reference.id));
      await expect(synthesizeClonedVoice("another-account", reference.id, "Oi")).rejects.toThrow("conta");
      const output = await synthesizeClonedVoice(owner, reference.id, "Você não vai acreditar no que aconteceu hoje.");
      const preset = selectionFromTransformPreset("adam_natural");
      const result = await voiceTransformEngine.transform(output, preset.config, preset.presetId);
      expect(result.output.durationSec).toBeGreaterThan(0.5);
      expect(result.output.meanVolumeDb).not.toBeNull();
      const directory = resolve("output/chatscene-voice-cloning");
      await mkdir(directory, { recursive: true });
      await writeFile(resolve(directory, "synthetic-reference.wav"), wav);
      await writeFile(resolve(directory, "chatterbox-pt-br.mp3"), result.audio);
      await writeFile(resolve(directory, "metrics.json"), JSON.stringify(result.output, null, 2));
    } finally { await deleteVoiceReference(owner, reference.id); }
    await expect(synthesizeClonedVoice(owner, reference.id, "Oi")).rejects.toThrow("conta");
  }, 480_000);
});
