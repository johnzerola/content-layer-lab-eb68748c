import { describe, expect, it } from "vitest";
import {
  BACKGROUND_PRESETS,
  createChatSceneProject,
  createDemoChatSceneProject,
  createMessage,
  createParticipant,
  normalizeChatSceneProject,
  participantOf,
  renderSize,
} from "../types";
import { buildPlan } from "../clock";
import { deserializeChatSceneProject, serializeChatSceneProject } from "../serialize";

describe("documento da conversa", () => {
  it("cria projeto com fundo padrão e participantes válidos", () => {
    const p = createChatSceneProject();
    expect(p.background?.kind).toBe("theme");
    expect(p.participants.length).toBeGreaterThan(0);
    for (const m of p.messages) expect(participantOf(p, m.participantId)).toBeTruthy();
  });

  it("a conversa de exemplo é um grupo com quatro pessoas", () => {
    const demo = createDemoChatSceneProject();
    expect(demo.chatKind).toBe("group");
    expect(demo.participants).toHaveLength(4);
    expect(demo.messages.length).toBeGreaterThan(5);
    expect(demo.voiceProfiles?.every((voice) => voice.provider === "lovable-ai")).toBe(true);
    expect(new Set(demo.voiceProfiles?.map((voice) => voice.name)).size).toBe(4);
  });

  it("mantém ordem ao inserir e remover mensagens", () => {
    const p = createDemoChatSceneProject();
    const target = p.messages[2]!;
    const without = p.messages.filter((m) => m.id !== target.id);
    expect(without).toHaveLength(p.messages.length - 1);
    expect(without.map((m) => m.id)).not.toContain(target.id);
  });

  it("mensagem de remetente inexistente não quebra a cena", () => {
    const p = createChatSceneProject();
    const orfa = createMessage("nao-existe", { text: "oi" });
    const doc = { ...p, messages: [...p.messages, orfa] };
    const autor = participantOf(doc, orfa.participantId);
    expect(autor).toBeTruthy();
    expect(doc.participants.some((x) => x.id === autor!.id)).toBe(true);
    expect(buildPlan(doc).totalFrames).toBeGreaterThan(0);
  });

  it("serializa e reabre preservando conteúdo", () => {
    const p = createDemoChatSceneProject();
    const back = deserializeChatSceneProject(serializeChatSceneProject(p));
    expect(back.title).toBe(p.title);
    expect(back.messages.map((m) => m.text)).toEqual(p.messages.map((m) => m.text));
    expect(back.participants).toHaveLength(p.participants.length);
  });

  it("normaliza documentos antigos sem fundo", () => {
    const p = createChatSceneProject();
    const { background: _drop, ...legado } = p;
    expect(normalizeChatSceneProject(legado).background?.kind).toBe("theme");
  });

  it("cada formato gera um tamanho coerente", () => {
    const p = createChatSceneProject();
    const v = renderSize({ ...p.render, aspect: "9:16" });
    const h = renderSize({ ...p.render, aspect: "16:9" });
    const q = renderSize({ ...p.render, aspect: "1:1" });
    expect(v.height).toBeGreaterThan(v.width);
    expect(h.width).toBeGreaterThan(h.height);
    expect(q.width).toBe(q.height);
  });

  it("o tema não altera o tempo da conversa", () => {
    const p = createDemoChatSceneProject();
    const a = buildPlan(p);
    const b = buildPlan({ ...p, themeId: CHAT_THEME_ALT, dark: !p.dark });
    expect(b.totalFrames).toBe(a.totalFrames);
  });

  it("lida com cem mensagens rapidamente", () => {
    const eu = createParticipant({ name: "Eu", isSelf: true });
    const outro = createParticipant({ name: "Outro" });
    const p = createChatSceneProject({
      participants: [eu, outro],
      messages: Array.from({ length: 100 }, (_, i) =>
        createMessage(i % 2 ? eu.id : outro.id, { text: `mensagem ${i}` }),
      ),
    });
    const t = performance.now();
    const plan = buildPlan(p);
    expect(plan.totalFrames).toBeGreaterThan(0);
    expect(performance.now() - t).toBeLessThan(1000);
  });

  it("há pelo menos um fundo pronto além do tema", () => {
    expect(BACKGROUND_PRESETS.length).toBeGreaterThan(1);
  });
});

const CHAT_THEME_ALT = "minimal";
