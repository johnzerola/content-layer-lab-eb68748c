import { describe, expect, it } from "vitest";
import { parseConversationScript } from "../import-script";
import { createChatSceneProject, participantOf } from "../types";

describe("parseConversationScript", () => {
  it("cria uma mensagem por linha com Nome:", () => {
    const project = createChatSceneProject();
    const { messages } = parseConversationScript("Ana: oi\nBruno: tudo bem?", project);
    expect(messages).toHaveLength(2);
    expect(messages[0]!.text).toBe("oi");
  });

  it("reaproveita participantes já existentes", () => {
    const project = createChatSceneProject();
    const name = project.participants[0]!.name;
    const parsed = parseConversationScript(`${name}: oi`, project);
    expect(parsed.participants).toHaveLength(project.participants.length);
    expect(participantOf({ ...project, participants: parsed.participants }, parsed.messages[0]!.participantId).name).toBe(name);
  });

  it("cria participante novo quando o nome é desconhecido", () => {
    const project = createChatSceneProject();
    const parsed = parseConversationScript("Zezinho: eaí", project);
    expect(parsed.participants.length).toBe(project.participants.length + 1);
  });

  it("linha com * vira aviso do sistema", () => {
    const project = createChatSceneProject();
    const { messages } = parseConversationScript("* Ana entrou no grupo", project);
    expect(messages[0]!.kind).toBe("system");
    expect(messages[0]!.text).toBe("Ana entrou no grupo");
  });

  it("linha solta continua a mensagem anterior", () => {
    const project = createChatSceneProject();
    const { messages } = parseConversationScript("Ana: oi\nde novo", project);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.text).toBe("oi\nde novo");
  });

  it("ignora linhas vazias", () => {
    const project = createChatSceneProject();
    const { messages } = parseConversationScript("\n\nAna: oi\n\n", project);
    expect(messages).toHaveLength(1);
  });
});
