import { describe, expect, it } from "vitest";
import { storyToProject, suggestPersonalityPresetId, suggestVoicePresetId, timingForDuration } from "../story";
import { buildPlan } from "../clock";
import { createChatSceneProject, MAIN_THREAD_ID } from "../types";
import { voicePreset } from "../voice";

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

  it("mantém apenas o dono explícito mesmo quando ele não é o primeiro", () => {
    const input = { ...script, characters: script.characters.map((character, index) => ({ ...character, isSelf: index === 1 ? true : undefined })) };
    const project = storyToProject(createChatSceneProject(), input);
    expect(project.participants.map((person) => person.isSelf)).toEqual([false, true, false]);
  });

  it("recusa referência inválida antes de montar o documento", () => {
    const base = createChatSceneProject();
    const snapshot = JSON.stringify(base);
    const input = { ...script, lines: script.lines.map((line, index) => index === 0 ? { ...line, speaker: "Pessoa inexistente" } : line) };
    expect(() => storyToProject(base, input)).toThrow(/não está no elenco/);
    expect(JSON.stringify(base)).toBe(snapshot);
  });

  it("respeita idade e gênero explícitos em vez de inferir pela relação familiar", () => {
    const cases = [
      { name: "Rafa", role: "filho adulto", gender: "masculina" as const, age: "adulta" as const },
      { name: "Bia", role: "amiga", gender: "feminina" as const, age: "teen" as const },
      { name: "Carla", role: "professora", gender: "feminina" as const, age: "adulta" as const },
      { name: "Lia", role: "estagiária", gender: "feminina" as const, age: "adulta" as const },
      { name: "Alex", role: "criança", gender: "neutra" as const, age: "juvenil" as const },
    ];
    for (const character of cases) {
      const preset = voicePreset(suggestVoicePresetId(character));
      expect(preset.age).toBe(character.age);
      expect(preset.gender).toBe(character.gender);
    }
    expect(suggestPersonalityPresetId(cases[0]!)).toBe("neutro");
  });

  it("preserva identidade declarada e emoção na conversão", () => {
    const input = { ...script, characters: script.characters.map((character, index) => index === 0
      ? { ...character, gender: "neutra" as const, age: "teen" as const }
      : character) };
    const project = storyToProject(createChatSceneProject(), input);
    const person = project.participants[0]!;
    const profile = project.voiceProfiles!.find((voice) => voice.id === person.voiceProfileId)!;
    expect(profile).toMatchObject({ ageStyle: "teen", genderStyle: "neutra", locale: "pt-BR" });
    expect(project.messages.find((message) => message.text === "desculpa, chefe")).toMatchObject({
      participantId: person.id, voiceDirection: { emotion: "nervous" },
    });
  });

  it("mensagem sem thread continua na conversa anterior", () => {
    const input = { ...script, lines: [...script.lines, { speaker: "Gabriel", text: "já almocei, mãe" }] };
    const project = storyToProject(createChatSceneProject(), input);
    const family = project.threads!.find((thread) => thread.name === "Grupo da família")!;
    expect(project.messages.at(-1)!.threadId).toBe(family.id);
  });
});
