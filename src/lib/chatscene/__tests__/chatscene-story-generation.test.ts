import { describe, expect, it } from "vitest";
import { buildStoryPrompt, normalizeStoryScript, parseGeneratedStory, STORY_LIMITS, storyBriefSchema } from "../story-generation";
import type { StoryScript } from "../story";

const story = (): StoryScript => ({
  title: "A chave da vizinha",
  characters: [
    { name: "Lúcia", role: "vizinha", gender: "feminina", age: "madura" },
    { name: "Ana", role: "amiga", gender: "feminina", age: "adulta", isSelf: true },
  ],
  lines: [
    { speaker: "Lúcia", text: "sua chave abriu meu apartamento", thread: "Lúcia" },
    { speaker: "Ana", text: "a da fita amarela?", thread: "Lúcia" },
    { speaker: "Lúcia", text: "essa. eu tinha te dado para regar as plantas", thread: "Lúcia" },
    { speaker: "Ana", text: "então faz um mês que estou regando suas plantas de plástico", thread: "Lúcia", emotion: "surprised" },
  ],
});

describe("story generation contract", () => {
  it("normaliza um único dono do celular sem mudar o roteiro original", () => {
    const input = story();
    const normalized = normalizeStoryScript(input);
    expect(normalized.characters.map((person) => person.isSelf)).toEqual([false, true]);
    expect(input.characters[0]!.isSelf).toBeUndefined();
    input.characters[0]!.isSelf = true;
    expect(normalizeStoryScript(input).characters.map((person) => person.isSelf)).toEqual([true, false]);
    input.characters.forEach((person) => { person.isSelf = false; });
    expect(normalizeStoryScript(input).characters.map((person) => person.isSelf)).toEqual([true, false]);
  });

  it("reconhece o mesmo nome com espaços, caixa e acento distintos", () => {
    const input = story();
    input.lines[0]!.speaker = "  LUCIA  ";
    expect(normalizeStoryScript(input).lines[0]!.speaker).toBe("Lúcia");
  });

  it("rejeita nomes duplicados após normalização", () => {
    const input = story();
    input.characters[1]!.name = "  lucia ";
    expect(() => normalizeStoryScript(input)).toThrow(/repetiu nomes/);
  });

  it("rejeita falantes desconhecidos sem transferir a fala ao dono do celular", () => {
    const input = story();
    input.lines[3]!.speaker = "Narrador";
    expect(() => normalizeStoryScript(input)).toThrow(/não está no elenco/);
    input.lines[3]!.speaker = "";
    expect(() => normalizeStoryScript(input)).toThrow(/não está no elenco/);
  });

  it("permite cartão sem falante e preserva sua posição", () => {
    const input = story();
    input.lines.splice(2, 0, { speaker: "", text: "Um mês antes", kind: "card" });
    const normalized = normalizeStoryScript(input);
    expect(normalized.lines[2]).toEqual({ speaker: "", text: "Um mês antes", kind: "card" });
    expect(normalized.lines.at(-1)).toEqual(input.lines.at(-1));
  });

  it("preserva todas as palavras e o desfecho no limite de mensagens", () => {
    const input = story();
    input.lines = [
      ...Array.from({ length: STORY_LIMITS.lines - 1 }, () => ({ ...input.lines[0]! })),
      input.lines.at(-1)!,
    ];
    const result = parseGeneratedStory(JSON.stringify(input));
    expect(result.lines).toEqual(input.lines);
    input.lines.unshift({ ...input.lines[0]! });
    expect(() => parseGeneratedStory(JSON.stringify(input))).toThrow(/90 mensagens/);
    expect(input.lines.at(-1)!.text).toContain("plantas de plástico");
  });

  it("rejeita bolha longa sem devolver fala cortada", () => {
    const input = story();
    input.lines[3]!.text = "a".repeat(STORY_LIMITS.line + 1);
    expect(() => normalizeStoryScript(input)).toThrow(/240 caracteres/);
    expect(input.lines[3]!.text).toHaveLength(STORY_LIMITS.line + 1);
  });

  it("aplica limites ao título, ao corpo e aos cortes de cena", () => {
    const input = story();
    input.title = "a".repeat(STORY_LIMITS.title + 1);
    expect(() => normalizeStoryScript(input)).toThrow(/título/);
    const longBody = story();
    longBody.lines = Array.from({ length: STORY_LIMITS.lines }, () => ({ speaker: "Ana", text: "a".repeat(STORY_LIMITS.line) }));
    expect(() => normalizeStoryScript(longBody)).toThrow(/16000/);
    const longCard = story();
    longCard.lines[1] = { speaker: "", kind: "card", text: "a".repeat(STORY_LIMITS.card + 1) };
    expect(() => normalizeStoryScript(longCard)).toThrow(/80 caracteres/);
  });

  it("recusa elenco maior ou diferente do solicitado sem remover personagens", () => {
    expect(() => normalizeStoryScript(story(), 3)).toThrow(/quantidade diferente/);
    const input = story();
    input.characters.push(...Array.from({ length: 5 }, (_, index) => ({ name: `Pessoa ${index}`, role: "amiga" })));
    expect(() => normalizeStoryScript(input)).toThrow(/2 a 6 personagens/);
    expect(input.characters).toHaveLength(7);
  });

  it("aceita JSON puro e bloco JSON completo; recusa respostas quebradas", () => {
    const raw = JSON.stringify(story());
    expect(parseGeneratedStory(`\`\`\`json\n${raw}\n\`\`\``)).toEqual(parseGeneratedStory(raw));
    expect(() => parseGeneratedStory(raw.slice(0, -1))).toThrow(/formato inesperado/);
    expect(() => parseGeneratedStory(`Aqui vai: ${raw}`)).toThrow(/formato inesperado/);
  });

  it("mantém o briefing como dados, incluindo aspas e quebras de linha", () => {
    const brief = storyBriefSchema.parse({ topic: 'Ela escreveu "não abre"\nno grupo', tone: "suspense", durationSec: 45, characters: 2 });
    const messages = buildStoryPrompt(brief);
    expect(messages.map((message) => message.role)).toEqual(["system", "user"]);
    const request = JSON.parse(messages[1]!.content);
    expect(request.tema).toBe(brief.topic);
    expect(request.personagensExatos).toBe(2);
    expect(request.duracaoAlvoSegundos).toBe(45);
    expect(request.mensagensAproximadas).toBeLessThanOrEqual(STORY_LIMITS.lines);
  });

  it("valida quantidade inteira e tema preenchido antes de chamar o provedor", () => {
    expect(() => storyBriefSchema.parse({ topic: "   " })).toThrow();
    expect(() => storyBriefSchema.parse({ topic: "A chave", characters: 2.5 })).toThrow();
    expect(storyBriefSchema.parse({ topic: "A chave" })).toMatchObject({ characters: 3, durationSec: 60, tone: "comedia" });
  });
});
