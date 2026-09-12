import { describe, expect, it } from "vitest";
import { computeMessageTimings } from "../timing";
import { planScroll } from "../scroll-planner";
import { attachPreset, effectiveVoice } from "../voice-resolution";
import { voiceKey } from "../voice";
import { createChatSceneProject, createMessage, createParticipant, normalizeChatSceneProject } from "../types";

const projectWithCast = () => {
  const person = createParticipant({ id: "pedro", name: "Pedro" });
  return attachPreset(createChatSceneProject({ participants: [person], messages: [createMessage(person.id, { id: "m1", text: "Oi" })] }), person.id, "teen-boy-casual");
};

describe("Voice Cast System", () => {
  it("mapeia mensagem → participante → perfil reutilizável", () => {
    const project = projectWithCast();
    expect(project.participants[0]?.voiceProfileId).toBe("voice_pedro");
    expect(effectiveVoice(project, project.messages[0]!)?.profile.presetId).toBe("teen-boy-casual");
  });

  it("mantém identidade e aplica emoção por mensagem", () => {
    const project = projectWithCast();
    const message = { ...project.messages[0]!, voiceDirection: { emotion: "annoyed" as const, speedMultiplier: 1.1 } };
    const result = effectiveVoice({ ...project, messages: [message] }, message);
    expect(result?.profile.presetId).toBe("teen-boy-casual");
    expect(result?.direction.emotion).toBe("annoyed");
  });

  it("usa a mesma chave para os mesmos ajustes e outra chave para emoção diferente", () => {
    const project = projectWithCast();
    const profile = effectiveVoice(project, project.messages[0]!)!.profile;
    expect(voiceKey("Oi", profile)).toBe(voiceKey("Oi", profile));
    expect(voiceKey("Oi", profile, { emotion: "happy" })).not.toBe(voiceKey("Oi", profile, { emotion: "sad" }));
  });

  it("migra a voz embutida de projetos antigos", () => {
    const old = createChatSceneProject();
    old.participants[0] = { ...old.participants[0]!, voice: { presetId: "mother-warm", style: "calma", speed: 1, gain: 1 } };
    const reopened = normalizeChatSceneProject({ ...old, voiceProfiles: undefined });
    expect(reopened.participants[0]?.voiceProfileId).toBe(`voice_${old.participants[0]!.id}`);
    expect(reopened.voiceProfiles).toHaveLength(1);
  });

  it("recalcula pausas do override no relógio", () => {
    const project = projectWithCast();
    project.messages[0] = { ...project.messages[0]!, voiceDirection: { pauseBeforeMs: 300, pauseAfterMs: 500 } };
    const timing = computeMessageTimings(project)[0]!;
    expect(timing.leadInMs).toBe(300);
    expect(timing.pauseAfterMs).toBe(project.timing.gapMs + 500);
  });
});

describe("ScrollPlanner", () => {
  it("é determinístico e termina no offset alvo", () => {
    const input = { frame: 40, appearFrame: 10, fps: 30, currentContentHeight: 800, previousContentHeight: 600, typingHeight: 0, viewportBottom: 1000 };
    expect(planScroll(input)).toBe(200);
    expect(planScroll(input)).toBe(planScroll(input));
  });

  it("interpola sem salto no início da mensagem", () => {
    expect(planScroll({ frame: 10, appearFrame: 10, fps: 30, currentContentHeight: 800, previousContentHeight: 600, typingHeight: 0, viewportBottom: 1000 })).toBe(400);
  });
});
