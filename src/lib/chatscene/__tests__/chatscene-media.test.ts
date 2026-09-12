import { describe, expect, it } from "vitest";
import { durationLabel, MESSAGE_KINDS, messageKind, voiceSeconds, voiceWave } from "../message-kinds";
import {
  createMessage,
  createChatSceneProject,
  DEFAULT_BRANDING,
  normalizeChatSceneProject,
} from "../types";

describe("tipos de mensagem", () => {
  it("todo tipo tem rótulo e ajuda", () => {
    for (const k of MESSAGE_KINDS) {
      expect(k.label.length).toBeGreaterThan(2);
      expect(k.hint.length).toBeGreaterThan(5);
      if (k.needsMedia) expect(k.accept).toBeTruthy();
    }
  });

  it("tipo desconhecido cai em texto", () => {
    expect(messageKind(undefined).id).toBe("text");
  });

  it("a duração da voz é estimada pelo texto e respeita o valor escolhido", () => {
    const auto = voiceSeconds(createMessage("p", { kind: "voice", text: "um dois três quatro cinco seis" }));
    expect(auto).toBeGreaterThanOrEqual(2);
    const manual = voiceSeconds(createMessage("p", { kind: "voice", durationSec: 47 }));
    expect(manual).toBe(47);
  });

  it("a onda do áudio é sempre a mesma para a mesma mensagem", () => {
    const a = voiceWave("m1", 20);
    const b = voiceWave("m1", 20);
    expect(a).toEqual(b);
    expect(voiceWave("m2", 20)).not.toEqual(a);
    expect(Math.max(...a)).toBeLessThanOrEqual(1);
    expect(Math.min(...a)).toBeGreaterThan(0);
  });

  it("a duração aparece como minuto:segundo", () => {
    expect(durationLabel(7)).toBe("0:07");
    expect(durationLabel(75)).toBe("1:15");
  });
});

describe("fundo e marca", () => {
  it("vídeo de fundo sobrevive ao salvar e reabrir", () => {
    const project = createChatSceneProject({
      background: { kind: "video", videoUrl: "https://exemplo/loop.mp4", loop: true },
    });
    const reopened = normalizeChatSceneProject(JSON.parse(JSON.stringify(project)));
    expect(reopened.background).toMatchObject({ kind: "video", videoUrl: "https://exemplo/loop.mp4", loop: true });
  });

  it("conversa antiga ganha marca desligada, sem quebrar", () => {
    const old = normalizeChatSceneProject({ title: "antiga" } as never);
    expect(old.branding).toEqual(DEFAULT_BRANDING);
    expect(old.branding?.enabled).toBe(false);
  });

  it("a resposta guarda o id da mensagem citada", () => {
    const project = createChatSceneProject();
    const first = project.messages[0]!;
    const answer = createMessage(project.messages[1]!.participantId, { replyToId: first.id, text: "isso" });
    const reopened = normalizeChatSceneProject({ ...project, messages: [...project.messages, answer] });
    expect(reopened.messages.at(-1)?.replyToId).toBe(first.id);
  });
});
