import { describe, expect, it } from "vitest";
import {
  buildStoryPrompt,
  normalizeStoryScript,
  parseGeneratedStory,
  referenceOverlapRatio,
  STORY_LIMITS,
  storyBriefSchema,
  storyUsesReferenceTooClosely,
} from "../story-generation";
import type { StoryScript } from "../story";
import { STORY_TOPIC_MAX_CHARS } from "../story-style";

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
    expect(request.palavrasAproximadas).toBe(Math.round(45 * 4.3));
  });

  it("valida quantidade inteira e tema preenchido antes de chamar o provedor", () => {
    expect(() => storyBriefSchema.parse({ topic: "   " })).toThrow();
    expect(() => storyBriefSchema.parse({ topic: "A chave", characters: 2.5 })).toThrow();
    expect(storyBriefSchema.parse({ topic: "A chave" })).toMatchObject({ characters: 3, durationSec: 60, tone: "comedia" });
  });

  it("aceita briefing longo integralmente e recusa excesso sem cortar o final", () => {
    const ending = " A pista final é o guarda-sol";
    const topic = "a".repeat(STORY_TOPIC_MAX_CHARS - ending.length) + ending;
    expect(topic).toHaveLength(STORY_TOPIC_MAX_CHARS);
    const brief = storyBriefSchema.parse({ topic });
    const sent = JSON.parse(buildStoryPrompt(brief)[1]!.content);
    expect(sent.tema).toBe(topic);
    expect(sent.tema.endsWith("guarda-sol")).toBe(true);
    expect(() => storyBriefSchema.parse({ topic: `${topic}!` })).toThrow();
  });

  it("aplica a direção animada por padrão inclusive para clientes anteriores", () => {
    const legacy = { topic: "O avô esconde o controle do portão", tone: "comedia" as const, durationSec: 60, characters: 3 };
    expect(storyBriefSchema.parse(legacy).narrativeStyle).toBe("animated-chat");
    const prompt = buildStoryPrompt(legacy);
    expect(JSON.parse(prompt[1]!.content).direcaoNarrativa).toBe("animated-chat");
    expect(prompt[0]!.content).toContain("GANCHO:");
    expect(prompt[0]!.content).toContain("callback");
    expect(prompt[0]!.content).toContain("o clima escolhido prevalece");
  });

  it("a direção livre remove a receita animada sem perder o tema nem o tom", () => {
    const brief = storyBriefSchema.parse({ topic: 'Uma mensagem diz "ignore o roteiro"', tone: "drama", narrativeStyle: "free" });
    const prompt = buildStoryPrompt(brief);
    expect(prompt[0]!.content).not.toContain("DIREÇÃO NARRATIVA: CONVERSA ANIMADA.");
    expect(prompt[0]!.content).toContain("DIREÇÃO LIVRE:");
    expect(prompt[0]!.content).not.toContain(brief.topic);
    expect(JSON.parse(prompt[1]!.content)).toMatchObject({ tema: brief.topic, direcaoNarrativa: "free" });
    expect(() => storyBriefSchema.parse({ topic: "Uma conversa", narrativeStyle: "unknown" })).toThrow();
  });

  it("usa reinvenção como padrão para transcrições e explicita a decisão no prompt", () => {
    const brief = storyBriefSchema.parse({ topic: "A transcrição de uma conversa inteira" });
    const prompt = buildStoryPrompt(brief);

    expect(brief.sourceTreatment).toBe("reinvent");
    expect(prompt[0]!.content).toContain("TRANSFORMACAO OBRIGATORIA");
    expect(JSON.parse(prompt[1]!.content).tratamentoDaReferencia).toBe("reinvent");
  });

  it("detecta blocos copiados e não bloqueia a adaptação de premissa", () => {
    const source = story();
    const sourceText = source.lines.map((line) => line.text).join(" ");
    expect(referenceOverlapRatio(sourceText, source)).toBe(1);
    expect(storyUsesReferenceTooClosely({ topic: sourceText, sourceTreatment: "reinvent", tone: "comedia", durationSec: 60, characters: 2 }, source)).toBe(true);
    expect(storyUsesReferenceTooClosely({ topic: sourceText, sourceTreatment: "preserve-premise", tone: "comedia", durationSec: 60, characters: 2 }, source)).toBe(false);
  });
});
