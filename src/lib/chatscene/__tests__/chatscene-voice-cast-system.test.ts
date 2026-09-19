import { describe, expect, it, vi } from "vitest";
import { computeMessageTimings } from "../timing";
import { applyConversationTimingPreset } from "../timing-presets";
import { planScroll } from "../scroll-planner";
import { attachPreset, effectiveVoice } from "../voice-resolution";
import { DEFAULT_VOICE, voiceKey } from "../voice";
import {
  applyVoiceDurations,
  clearVoiceCache,
  createGatewayVoiceProvider,
  generateCast,
  projectWithAvailableVoiceClips,
  restoreCachedCast,
  type VoiceClip,
} from "../voice-cast";
import { deserializeChatSceneProject, serializeChatSceneProject } from "../serialize";
import {
  createChatSceneProject,
  createMessage,
  createParticipant,
  normalizeChatSceneProject,
} from "../types";

const projectWithCast = () => {
  const person = createParticipant({ id: "pedro", name: "Pedro" });
  return attachPreset(
    createChatSceneProject({
      participants: [person],
      messages: [createMessage(person.id, { id: "m1", text: "Oi" })],
    }),
    person.id,
    "teen-boy-casual",
  );
};

describe("Voice Cast System", () => {
  it("mapeia mensagem → participante → perfil reutilizável", () => {
    const project = projectWithCast();
    expect(project.participants[0]?.voiceProfileId).toBe("voice_pedro");
    expect(effectiveVoice(project, project.messages[0]!)?.profile.presetId).toBe("teen-boy-casual");
  });

  it("salva o preset de atuação no perfil e invalida apenas as falas do personagem", () => {
    const pedro = createParticipant({ id: "pedro", name: "Pedro" });
    const ana = createParticipant({ id: "ana", name: "Ana" });
    const project = createChatSceneProject({
      participants: [pedro, ana],
      messages: [
        createMessage(pedro.id, { id: "p1", text: "Oi", voiceMs: 900 }),
        createMessage(ana.id, { id: "a1", text: "Olá", voiceMs: 800 }),
      ],
    });
    const updated = attachPreset(project, pedro.id, "acting-adult-sad");
    expect(updated.participants[0]?.voiceProfileId).toBe("voice_pedro");
    expect(updated.voiceProfiles?.find((profile) => profile.id === "voice_pedro")?.presetId).toBe(
      "acting-adult-sad",
    );
    expect(updated.messages.find((message) => message.id === "p1")?.voiceMs).toBeNull();
    expect(updated.messages.find((message) => message.id === "a1")?.voiceMs).toBe(800);
    const reopened = deserializeChatSceneProject(serializeChatSceneProject(updated));
    expect(reopened.voiceProfiles?.find((profile) => profile.id === "voice_pedro")?.presetId).toBe(
      "acting-adult-sad",
    );
  });

  it("mantém identidade e aplica emoção por mensagem", () => {
    const project = projectWithCast();
    const message = {
      ...project.messages[0]!,
      voiceDirection: { emotion: "annoyed" as const, speedMultiplier: 1.1 },
    };
    const result = effectiveVoice({ ...project, messages: [message] }, message);
    expect(result?.profile.presetId).toBe("teen-boy-casual");
    expect(result?.direction.emotion).toBe("annoyed");
  });

  it("usa a mesma chave para os mesmos ajustes e outra chave para emoção diferente", () => {
    const project = projectWithCast();
    const profile = effectiveVoice(project, project.messages[0]!)!.profile;
    expect(voiceKey("Oi", profile)).toBe(voiceKey("Oi", profile));
    expect(voiceKey("Oi", profile, { emotion: "happy" })).not.toBe(
      voiceKey("Oi", profile, { emotion: "sad" }),
    );
  });

  it("migra a voz embutida de projetos antigos", () => {
    const old = createChatSceneProject();
    old.participants[0] = {
      ...old.participants[0]!,
      voice: { presetId: "mother-warm", style: "calma", speed: 1, gain: 1 },
    };
    const legacy = { ...old } as Partial<typeof old> & { voiceProfiles?: typeof old.voiceProfiles };
    delete legacy.voiceProfiles;
    const reopened = normalizeChatSceneProject(legacy);
    expect(reopened.participants[0]?.voiceProfileId).toBe(`voice_${old.participants[0]!.id}`);
    expect(reopened.voiceProfiles).toHaveLength(1);
  });

  it("recalcula pausas do override no relógio", () => {
    const project = projectWithCast();
    project.messages[0] = {
      ...project.messages[0]!,
      voiceDirection: { pauseBeforeMs: 300, pauseAfterMs: 500 },
    };
    const timing = computeMessageTimings(project)[0]!;
    expect(timing.leadInMs).toBe(300);
    expect(timing.pauseAfterMs).toBe(project.timing.gapMs + 500);
  });

  it("envia a voz persistida ao provider real", async () => {
    let sentVoice = "";
    const provider = createGatewayVoiceProvider(async (input) => {
      sentVoice = input.voice;
      throw new Error("parar antes da decodificação");
    });
    await expect(
      provider.synthesize("Olá", { ...DEFAULT_VOICE, providerVoiceId: "ash" }),
    ).rejects.toThrow();
    expect(sentVoice).toBe("ash");
  });

  it("repete falha transitória antes de desistir", async () => {
    const project = projectWithCast();
    let calls = 0;
    const provider = {
      id: "retry-test",
      listVoices: async () => [],
      getCapabilities: () => ({
        languages: ["pt-BR"],
        maxCharacters: 600,
        controls: {
          speed: true,
          pitch: true,
          energy: false,
          expressiveness: true,
          roughness: false,
          warmth: false,
          brightness: false,
          emotion: true,
        },
        costEstimate: false,
        local: false,
      }),
      previewVoice: async () => {
        throw new Error("não usado");
      },
      synthesize: async () => {
        calls += 1;
        if (calls < 3) throw new Error("temporário");
        return { key: "ok", blob: new Blob(), durationSec: 1, buffer: {} as AudioBuffer };
      },
    };
    const result = await generateCast(project, provider);
    expect(calls).toBeGreaterThanOrEqual(3);
    expect(result.failures).toHaveLength(0);
  });

  it("não repete uma geração pesada quando maxAttempts é um", async () => {
    const project = projectWithCast();
    let calls = 0;
    const provider = {
      id: "single-attempt-test",
      listVoices: async () => [],
      getCapabilities: () => ({
        languages: ["pt-BR"],
        maxCharacters: 600,
        controls: {
          speed: true,
          pitch: true,
          energy: false,
          expressiveness: true,
          roughness: false,
          warmth: false,
          brightness: false,
          emotion: true,
        },
        costEstimate: false,
        local: true,
      }),
      previewVoice: async () => {
        throw new Error("não usado");
      },
      synthesize: async () => {
        calls += 1;
        throw new Error("timeout");
      },
    };
    const result = await generateCast(project, provider, { maxAttempts: 1 });
    expect(calls).toBe(1);
    expect(result.failures).toHaveLength(1);
  });

  it("restaura uma fala do IndexedDB depois que a memória é limpa", async () => {
    const stored = new Map<string, Blob>();
    const request = <T,>(result: T) => {
      const pending: { result: T; onsuccess?: () => void; onerror?: () => void } = { result };
      queueMicrotask(() => pending.onsuccess?.());
      return pending;
    };
    vi.stubGlobal("indexedDB", {
      open: () => request({
        transaction: () => ({
          objectStore: () => ({
            get: (key: string) => request(stored.get(key)),
            put: (blob: Blob, key: string) => {
              stored.set(key, blob);
              return request(undefined);
            },
          }),
        }),
      }),
    });
    const samples = new Float32Array(200).fill(0.2);
    vi.stubGlobal("AudioContext", class {
      decodeAudioData = async () => ({
        sampleRate: 1_000,
        length: samples.length,
        duration: 0.2,
        numberOfChannels: 1,
        getChannelData: () => samples,
      } as AudioBuffer);
    });
    clearVoiceCache();
    try {
      const project = projectWithCast();
      const provider = createGatewayVoiceProvider(async () => ({ audio: "AA==", mime: "audio/mpeg" }));
      const generated = await generateCast(project, provider);
      expect(generated.clips.size).toBe(1);
      expect(stored.size).toBe(1);
      clearVoiceCache();
      const restored = await restoreCachedCast(project);
      expect(restored.clips.get("m1")?.durationSec).toBe(0.2);
      expect(restored.durations.m1).toBe(generated.durations.m1);
    } finally {
      clearVoiceCache();
      vi.unstubAllGlobals();
    }
  });

  it("não usa duração de uma fala quando o áudio não está disponível", () => {
    const project = applyConversationTimingPreset(
      applyVoiceDurations(projectWithCast(), { m1: 20_000 }),
      "dynamic-fast",
    );
    const silent = projectWithAvailableVoiceClips(project, new Map());
    expect(silent.messages[0]?.voiceMs).toBeNull();
    expect(computeMessageTimings(silent)[0]!.voiceMs).toBe(0);
    const available = projectWithAvailableVoiceClips(
      project,
      new Map([["m1", {} as VoiceClip]]),
    );
    expect(available).toBe(project);
    expect(computeMessageTimings(available)[0]!.voiceMs).toBe(20_000);
  });
});

describe("ScrollPlanner", () => {
  it("é determinístico e termina no offset alvo", () => {
    const input = {
      frame: 40,
      appearFrame: 10,
      fps: 30,
      currentContentHeight: 800,
      previousContentHeight: 600,
      typingHeight: 0,
      viewportBottom: 1000,
    };
    expect(planScroll(input)).toBe(200);
    expect(planScroll(input)).toBe(planScroll(input));
  });

  it("interpola sem salto no início da mensagem", () => {
    expect(
      planScroll({
        frame: 10,
        appearFrame: 10,
        fps: 30,
        currentContentHeight: 800,
        previousContentHeight: 600,
        typingHeight: 0,
        viewportBottom: 1000,
      }),
    ).toBe(400);
  });
});

describe("Timbre e sincronia", () => {
  it("muda a chave de cache quando o timbre muda", () => {
    const base = { ...DEFAULT_VOICE, warmth: 0.2, brightness: 0.3, roughness: 0 };
    expect(voiceKey("Oi", base)).not.toBe(voiceKey("Oi", { ...base, warmth: 0.9 }));
    expect(voiceKey("Oi", base)).not.toBe(voiceKey("Oi", { ...base, roughness: 0.8 }));
  });

  it("aplica a duração real da fala no relógio da cena", () => {
    const project = projectWithCast();
    const synced = applyVoiceDurations(project, { m1: 2400 });
    expect(computeMessageTimings(synced)[0]!.voiceMs).toBe(2400);
  });
});
