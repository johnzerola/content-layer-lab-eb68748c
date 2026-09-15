import { describe, expect, it } from "vitest";
import { storyToProject, suggestPersonalityPresetId, suggestVoicePresetId, timingForDuration } from "../story";
import { buildPlan } from "../clock";
import { createChatSceneProject, MAIN_THREAD_ID } from "../types";

const script = {
  title: "Primeiro dia",
  characters: [
    { name: "Gabriel", role: "funcionário", gender: "masculina" as const, isSelf: true },
    { name: "Chefe", role: "chefe", gender: "masculina" as const },
    { name: "Mãe", role: "mãe", gender: "feminina" as const },
  ],
  lines: [
    { speaker: "Chefe", text: "Você está atrasado de novo.", thread: "Chefe" },
    { speaker: "Gabriel", text: "desculpa, chefe", thread: "Chefe", emotion: "nervous" as const },
    { speaker: "", text: "Momentos antes", kind: "card" as const, thread: "Chefe" },
    { speaker: "Mãe", text: "Filho, você almoçou?", thread: "Grupo da família" },
  ],
};

describe("story engine", () => {
  it("monta participantes, vozes e conversas a partir do roteiro", () => {
    const project = storyToProject(createChatSceneProject(), script);
    expect(project.participants).toHaveLength(3);
    expect(project.participants[0]!.isSelf).toBe(true);
    expect(project.voiceProfiles).toHaveLength(3);
    expect(project.participants.every((p) => p.voiceProfileId)).toBe(true);
    expect(project.voiceProfiles?.every((voice) => voice.provider === "lovable-ai" && voice.locale === "pt-BR")).toBe(true);
    expect(project.voiceProfiles?.map((voice) => voice.name)).toEqual([
      "Gabriel — funcionário",
      "Chefe — chefe",
      "Mãe — mãe",
    ]);
    expect(project.threads?.map((t) => t.name)).toEqual(["Chefe", "Grupo da família"]);
    expect(project.threads?.[0]!.id).toBe(MAIN_THREAD_ID);
    expect(project.threads?.[1]!.kind).toBe("group");
  });

  it("preserva cartões de cena e emoções", () => {
    const project = storyToProject(createChatSceneProject(), script);
    expect(project.messages.some((m) => m.kind === "card" && m.text === "Momentos antes")).toBe(true);
    expect(project.messages.find((m) => m.text === "desculpa, chefe")?.voiceDirection?.emotion).toBe("nervous");
  });

  it("é determinístico e gera um plano válido", () => {
    const a = storyToProject(createChatSceneProject(), script);
    const b = storyToProject(createChatSceneProject(), script);
    expect(a.messages.map((m) => `${m.kind}:${m.text}`)).toEqual(b.messages.map((m) => `${m.kind}:${m.text}`));
    expect(buildPlan(a).totalFrames).toBeGreaterThan(0);
  });

  it("sugere voz e jeito de escrever pelo papel", () => {
    expect(suggestVoicePresetId({ name: "Mãe", role: "mãe", gender: "feminina" })).toBe("mother-warm");
    expect(suggestPersonalityPresetId({ name: "Chefe", role: "chefe" })).toBe("chefe");
    expect(timingForDuration(40).speed).toBeGreaterThan(timingForDuration(120).speed);
  });
});
