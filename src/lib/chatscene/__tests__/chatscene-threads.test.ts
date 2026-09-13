import { describe, expect, it } from "vitest";
import { threadFrame } from "../draw";
import { buildPlan } from "../clock";
import {
  createChatSceneProject,
  createMessage,
  createThread,
  threadsOf,
  type ChatSceneProject,
} from "../types";

function twoThreadProject(): ChatSceneProject {
  const base = createChatSceneProject();
  const work = createThread({ name: "Chefe" });
  const friend = createThread({ name: "Pedro" });
  const [a, b] = base.participants;
  return {
    ...base,
    threads: [work, friend],
    messages: [
      createMessage(a!.id, { text: "Bom dia, chefe", threadId: work.id }),
      createMessage(b!.id, { text: "Chegou o dia", threadId: work.id }),
      createMessage(a!.id, { text: "E aí, Pedro", threadId: friend.id }),
    ],
  };
}

describe("conversas paralelas", () => {
  it("normaliza uma conversa padrão quando o projeto não define nenhuma", () => {
    expect(threadsOf(createChatSceneProject())).toHaveLength(1);
  });

  it("mostra só as mensagens da conversa no ar", () => {
    const project = twoThreadProject();
    const plan = buildPlan(project);
    const last = plan.byId[project.messages[2]!.id]!;
    const view = threadFrame(project, plan, last.endFrame);
    expect(view.messages).toHaveLength(1);
    expect(view.thread.name).toBe("Pedro");
  });

  it("faz o corte entre conversas com a anterior saindo", () => {
    const project = twoThreadProject();
    const plan = buildPlan(project);
    const cutStart = plan.byId[project.messages[2]!.id]!.appearFrame;
    const view = threadFrame(project, plan, cutStart);
    expect(view.cut).toBeLessThan(1);
    expect(view.previousThread?.name).toBe("Chefe");
    expect(view.previousMessages).toHaveLength(2);
  });
});
