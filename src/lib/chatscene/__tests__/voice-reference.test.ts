import { describe, expect, it } from "vitest";
import { attachPreset, attachVoiceReference, preselectLocalVoices, voiceProfileOf } from "../voice-resolution";
import { createChatSceneProject } from "../types";
import { voiceKey } from "../voice";
import { voiceSynthesisInput } from "../voice-request";

describe("character voice reference contract", () => {
  it("preselects the original viral template without overriding saved casting", () => {
    const project = preselectLocalVoices(createChatSceneProject());
    const voice = voiceProfileOf(project, project.participants[0]!)!;
    expect(voice).toMatchObject({ provider: "piper", transform: { presetId: "adam_roblox_teen", config: { speedMultiplier: 1.3 } } });
    expect(preselectLocalVoices(project)).toBe(project);
  });
  it("keeps identity per character and invalidates cache when the reference changes", () => {
    const project = preselectLocalVoices(createChatSceneProject());
    const first = project.participants[0]!;
    const reference = { id: crypto.randomUUID(), name: "reference.wav", durationSec: 6 };
    const updated = attachVoiceReference(project, first.id, reference);
    const profile = voiceProfileOf(updated, updated.participants[0]!)!;
    expect(profile).toMatchObject({ provider: "chatterbox", reference, speed: 1, pitch: 0 });
    expect(profile.transform).toBeUndefined();
    expect(updated.participants[1]).toBe(project.participants[1]);
    expect(voiceKey("Olá", profile)).not.toBe(voiceKey("Olá", { ...profile, reference: { ...reference, id: crypto.randomUUID() } }));
    const restored = attachPreset(updated, first.id, "faber-natural");
    expect(voiceProfileOf(restored, restored.participants[0]!)).toMatchObject({ provider: "piper" });
    expect(voiceProfileOf(restored, restored.participants[0]!)!.reference).toBeUndefined();
  });
  it("accepts only UUID references and caps payload input", () => {
    expect(voiceSynthesisInput.safeParse({ text: "Oi", voice: "reference", provider: "chatterbox", referenceId: "../../other-user" }).success).toBe(false);
    expect(voiceSynthesisInput.parse({ text: "Oi", voice: "reference", provider: "chatterbox", referenceId: crypto.randomUUID() }).provider).toBe("chatterbox");
  });
});
