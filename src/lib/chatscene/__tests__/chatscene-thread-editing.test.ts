import { describe, expect, it } from "vitest";
import { appendThreadMessage, duplicateThread, removeThreadKeepingMessages } from "../threads";
import {
  createChatSceneProject,
  createMessage,
  createThread,
  threadIdOf,
  threadsOf,
} from "../types";
import { serializeChatSceneProject, deserializeChatSceneProject } from "../serialize";
import { buildPlan } from "../clock";
import { threadFrame } from "../draw";

describe("edição por chat", () => {
  function fixture() {
    const first = createThread({ id: "main", name: "Ana" });
    const second = createThread({ id: "group", name: "Família", kind: "group" });
    const project = createChatSceneProject({ threads: [first, second] });
    project.messages = [
      createMessage(project.participants[0]!.id, { text: "Chat principal" }),
      createMessage(project.participants[1]!.id, { text: "No grupo", threadId: second.id }),
    ];
    return project;
  }
  it("preserva threads fornecidas ao criar e reabrir um projeto", () => {
    const p = fixture();
    expect(threadsOf(deserializeChatSceneProject(serializeChatSceneProject(p)))).toEqual(
      threadsOf(p),
    );
    expect(threadsOf(p)).toHaveLength(2);
  });
  it("insere no chat escolhido antes do próximo chat, sem alterar IDs existentes", () => {
    const p = fixture();
    const { project, message } = appendThreadMessage(p, "main");
    expect(project.messages.map((m) => m.id)).toEqual([
      p.messages[0]!.id,
      message.id,
      p.messages[1]!.id,
    ]);
    expect(threadIdOf(project, message)).toBe("main");
  });
  it("adiciona ao grupo vazio no fim da sequência", () => {
    const p = fixture();
    p.messages.pop();
    const result = appendThreadMessage(p, "group");
    expect(result.project.messages.at(-1)?.threadId).toBe("group");
  });
  it("duplicação usa novos IDs e remapeia respostas internas", () => {
    const p = fixture();
    p.messages.push(
      createMessage(p.participants[0]!.id, {
        text: "Resposta",
        threadId: "group",
        replyToId: p.messages[1]!.id,
        soundEffect: "alert",
      }),
    );
    const result = duplicateThread(p, "group");
    const copies = result.project.messages.slice(p.messages.length);
    expect(copies).toHaveLength(2);
    expect(copies[1]!.replyToId).toBe(copies[0]!.id);
    expect(copies[1]!.soundEffect).toBe("alert");
    expect(
      copies.every(
        (m) => m.threadId === result.thread.id && !p.messages.some((old) => old.id === m.id),
      ),
    ).toBe(true);
    expect(result.thread.kind).toBe("group");
  });
  it("remove o primeiro chat migrando também mensagens antigas sem threadId", () => {
    const p = fixture();
    const next = removeThreadKeepingMessages(p, "main");
    expect(next.messages).toHaveLength(p.messages.length);
    expect(next.messages.every((m) => threadIdOf(next, m) === "group")).toBe(true);
    expect(next.messages[0]!.threadId).toBe("group");
    expect(removeThreadKeepingMessages(next, "group")).toBe(next);
  });
  it("preview e plano de exportação mudam para o grupo na sua mensagem", () => {
    const p = fixture();
    const plan = buildPlan(p);
    const view = threadFrame(p, plan, plan.byId[p.messages[1]!.id]!.endFrame);
    expect(view.thread.id).toBe("group");
    expect(view.thread.kind).toBe("group");
    expect(view.messages.map((m) => m.text)).toEqual(["No grupo"]);
  });
});
