import { describe, expect, it } from "vitest";
import { resolveVoiceProviderConfig } from "../voice.functions";
import { createGatewayVoiceProvider } from "../voice-cast";
import { voiceSynthesisInput } from "../voice-request";
import { attachPreset, effectiveVoice } from "../voice-resolution";
import { createChatSceneProject, createMessage, createParticipant } from "../types";
import {
  DEFAULT_MESSAGE_VOICE_DIRECTION,
  DEFAULT_VOICE,
  VOICE_DIRECTION_MAX_CHARS,
  VOICE_PRESETS,
  VOICE_STYLES,
  profileFromPreset,
  timbreDirection,
  voiceDirection,
  voiceKey,
  voicePreset,
  type VoiceEmotion,
} from "../voice";

const emotions: [VoiceEmotion, string][] = [
  ["neutral", ""], ["happy", "Soe feliz."], ["excited", "Soe empolgada."],
  ["serious", "Soe séria."], ["nervous", "Soe nervosa."], ["annoyed", "Soe incomodada."],
  ["angry-theatrical", "Soe brava de forma teatral, sem gritar."], ["sad", "Soe triste e contida."],
  ["sarcastic", "Use ironia leve."], ["surprised", "Soe surpresa."],
  ["whisper-like", "Fale como um segredo, sem perder clareza."],
];

describe("voice synthesis request contract", () => {
  it("selects the configured server provider with the correct model name", () => {
    expect(resolveVoiceProviderConfig({ LOVABLE_API_KEY: "lovable" })).toMatchObject({
      endpoint: "https://ai.gateway.lovable.dev/v1/audio/speech",
      model: "openai/gpt-4o-mini-tts",
    });
    expect(resolveVoiceProviderConfig({ OPENAI_API_KEY: "openai" })).toMatchObject({
      endpoint: "https://api.openai.com/v1/audio/speech",
      model: "gpt-4o-mini-tts",
    });
    expect(resolveVoiceProviderConfig({ LOVABLE_API_KEY: "lovable", OPENAI_API_KEY: "openai" })?.key).toBe("lovable");
    expect(resolveVoiceProviderConfig({})).toBeNull();
  });
  it.each(VOICE_PRESETS)("preserves identity, emotion and timbre for $id", (preset) => {
    for (const [emotion, instruction] of emotions) {
      const direction = voiceDirection(preset.profile.style, emotion, preset.profile.energy, preset.age, preset.gender, preset.profile);
      const validated = voiceSynthesisInput.parse({ text: "Tenho uma coisa para contar.", voice: preset.providerVoice, direction });
      expect(direction.length).toBeLessThanOrEqual(VOICE_DIRECTION_MAX_CHARS);
      expect(validated.direction).toBe(direction);
      expect(validated.direction).toContain(VOICE_STYLES.find((style) => style.id === preset.profile.style)!.direction);
      expect(validated.direction).toContain(`Personagem sintético: ${preset.age}, ${preset.gender}.`);
      expect(validated.direction).toContain(instruction);
      expect(validated.direction).toContain(timbreDirection(preset.profile).trim());
      if (preset.age === "juvenil") expect(validated.direction).toContain("sem caricatura, falsete extremo ou efeito de esquilo");
    }
  });

  it("passes the complete gateway direction through server validation", async () => {
    const profile = profileFromPreset("acting-child-sad");
    let received: ReturnType<typeof voiceSynthesisInput.parse> | undefined;
    const provider = createGatewayVoiceProvider(async (input) => {
      received = voiceSynthesisInput.parse(input);
      throw new Error("request captured; no synthesis");
    });
    await expect(provider.synthesize("Não quero ficar sozinha.", profile, {
      ...DEFAULT_MESSAGE_VOICE_DIRECTION, emotion: "sad", energyMultiplier: 0.5,
    })).rejects.toThrow("request captured");
    expect(received?.voice).toBe("shimmer");
    expect(received?.direction?.length).toBeGreaterThan(480);
    expect(received?.direction).toContain("Soe triste e contida.");
    expect(received?.direction).toContain("Volume baixo e intensidade contida.");
    expect(received?.direction).toContain("Personagem sintético: juvenil, neutra.");
    expect(received?.direction?.endsWith(timbreDirection(profile))).toBe(true);
  });

  it("still bounds untrusted requests and accepts omitted direction", () => {
    const validated = voiceSynthesisInput.parse({ text: "a".repeat(700), voice: "nova", direction: "b".repeat(VOICE_DIRECTION_MAX_CHARS + 100) });
    expect(validated.text).toHaveLength(600);
    expect(validated.direction).toHaveLength(VOICE_DIRECTION_MAX_CHARS);
    expect(VOICE_DIRECTION_MAX_CHARS).toBeGreaterThanOrEqual(1200);
    expect(voiceSynthesisInput.parse({ text: "Olá", voice: "nova" }).direction).toBeUndefined();
    expect(() => voiceSynthesisInput.parse({ text: "Olá", voice: "nova", speed: 2 })).toThrow();
  });

  it("sends explicit profile identity and separates its cached audio", async () => {
    const base = profileFromPreset("adult-male-casual");
    const profile = { ...base, ageStyle: "teen" as const, genderStyle: "neutra" as const };
    let receivedDirection = "";
    const provider = createGatewayVoiceProvider(async (input) => {
      receivedDirection = voiceSynthesisInput.parse(input).direction ?? "";
      throw new Error("identity captured; no synthesis");
    });
    await expect(provider.synthesize("Oi, tudo bem?", profile)).rejects.toThrow("identity captured");
    expect(receivedDirection).toContain("Personagem sintético: teen, neutra.");
    expect(voiceKey("Oi", profile)).not.toBe(voiceKey("Oi", base));
    expect(voiceKey("Oi", { ...base, ageStyle: "teen" })).not.toBe(voiceKey("Oi", base));
    expect(voiceKey("Oi", { ...base, genderStyle: "neutra" })).not.toBe(voiceKey("Oi", base));
    const { ageStyle: _age, genderStyle: _gender, ...legacy } = base;
    expect(voiceKey("Oi", legacy)).toBe(voiceKey("Oi", base));
  });

  it("does not reuse the historical cache key with truncated direction", () => {
    // Captured ator-br-2 key for this text, DEFAULT_VOICE and sad delivery.
    const legacyKey = "1nwokhxgnq7gp";
    const key = voiceKey("Olá, tudo bem?", DEFAULT_VOICE, { emotion: "sad" });
    expect(key).not.toBe(legacyKey);
    expect(voiceKey(" Olá, tudo bem? ", DEFAULT_VOICE, { emotion: "sad" })).toBe(key);
    expect(voiceKey("Olá, tudo bem?", DEFAULT_VOICE, { emotion: "happy" })).not.toBe(key);
  });
});

describe("participant preset assignment", () => {
  it("replaces all previous sound controls while preserving user metadata", () => {
    const previous = profileFromPreset("child-boy-raspy", {
      id: "saved-pedro", name: "Minha voz", gain: 0.72, provider: "lovable-ai", language: "pt",
      locale: "pt-BR", seed: 42, providerSettings: { stability: 0.7 },
    });
    const pedro = createParticipant({ id: "pedro", voiceProfileId: previous.id!, voice: previous });
    const ana = createParticipant({ id: "ana" });
    const project = createChatSceneProject({
      participants: [pedro, ana], voiceProfiles: [previous],
      messages: [createMessage("pedro", { id: "p1", text: "Oi", voiceMs: 900 }), createMessage("ana", { id: "a1", text: "Olá", voiceMs: 800 })],
    });
    const updated = attachPreset(project, "pedro", "acting-adult-sad");
    const result = effectiveVoice(updated, updated.messages[0]!)!.profile;
    const target = voicePreset("acting-adult-sad");
    expect(result).toMatchObject({
      ...target.profile, presetId: target.id, providerVoiceId: target.providerVoice, ageStyle: target.age, genderStyle: target.gender,
      id: previous.id, name: previous.name, gain: previous.gain, provider: previous.provider,
      language: previous.language, locale: previous.locale, seed: previous.seed, providerSettings: previous.providerSettings,
    });
    expect(updated.participants[0]!.voice).toEqual(result);
    expect(updated.messages[0]!.voiceMs).toBeNull();
    expect(updated.messages[1]).toBe(project.messages[1]);
    expect(updated.participants[1]).toBe(project.participants[1]);
    expect(project.voiceProfiles![0]).toBe(previous);
    expect(project.messages[0]!.voiceMs).toBe(900);
  });

  it("copies a shared profile so only the selected participant changes", () => {
    const shared = profileFromPreset("adult-male-casual", { id: "voice_pedro", name: "Elenco", gain: 0.8 });
    const reserved = profileFromPreset("mother-warm", { id: "voice_pedro_2" });
    const project = createChatSceneProject({
      participants: [
        createParticipant({ id: "pedro", voiceProfileId: shared.id!, voice: shared }),
        createParticipant({ id: "ana", voiceProfileId: shared.id!, voice: shared }),
      ],
      voiceProfiles: [shared, reserved],
      messages: [createMessage("pedro", { voiceMs: 900 }), createMessage("ana", { voiceMs: 800 })],
    });
    const updated = attachPreset(project, "pedro", "acting-child-happy");
    expect(updated.participants[0]!.voiceProfileId).toBe("voice_pedro_3");
    expect(effectiveVoice(updated, updated.messages[0]!)!.profile.presetId).toBe("acting-child-happy");
    expect(effectiveVoice(updated, updated.messages[1]!)!.profile).toBe(shared);
    expect(updated.voiceProfiles).toContain(reserved);
    expect(updated.participants[1]).toBe(project.participants[1]);
    expect(updated.messages[1]).toBe(project.messages[1]);
    expect(updated.messages[0]!.voiceMs).toBeNull();
  });

  it("preserves metadata from a legacy embedded voice when selecting a preset", () => {
    const previous = profileFromPreset("mother-warm", { name: "Voz da mãe", gain: 0.65, seed: 7 });
    const project = createChatSceneProject({
      participants: [createParticipant({ id: "mae", voice: previous })], voiceProfiles: [],
      messages: [createMessage("mae", { voiceMs: 900 })],
    });
    const updated = attachPreset(project, "mae", "acting-light-sarcastic");
    expect(effectiveVoice(updated, updated.messages[0]!)!.profile).toMatchObject({
      id: "voice_mae", name: "Voz da mãe", gain: 0.65, seed: 7, style: "sarcastica", providerVoiceId: "nova",
    });
  });
});
