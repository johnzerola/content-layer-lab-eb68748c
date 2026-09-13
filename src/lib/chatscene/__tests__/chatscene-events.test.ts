import { describe, expect, it } from "vitest";

import { buildPlan, visibleAt } from "../clock";
import { conversationEvents, deliveryStateAt, getStateAt } from "../events";
import { createHistory, canRedo, canUndo, pushHistory, redo, undo } from "../history";
import { PERSONALITY_PRESETS, splitByPersonality } from "../personality";
import { createDemoChatSceneProject, createMessage, createParticipant, normalizeChatSceneProject } from "../types";

function baseProject() {
  const eu = createParticipant({ name: "Eu", isSelf: true });
  const outro = createParticipant({ name: "Pedro" });
  return normalizeChatSceneProject({
    ...createDemoChatSceneProject(),
    participants: [eu, outro],
    messages: [
      createMessage(eu.id, { text: "Oi, tudo certo?", initial: true }),
      createMessage(outro.id, { text: "Cheguei agora" }),
      createMessage(eu.id, { text: "Beleza, te espero" }),
    ],
  });
}

describe("histórico inicial", () => {
  it("mensagem marcada como histórico já está na tela no primeiro quadro", () => {
    const project = baseProject();
    const plan = buildPlan(project);
    const visible = visibleAt(project, plan, 0);
    expect(visible.map((m) => m.text)).toContain("Oi, tudo certo?");
    expect(visible).toHaveLength(1);
  });
});

describe("estados de entrega", () => {
  it("vai de enviado para entregue e depois lido", () => {
    const project = baseProject();
    const plan = buildPlan(project);
    const enviada = project.messages[2]!;
    const entry = plan.byId[enviada.id]!;
    expect(deliveryStateAt(project, plan, enviada, entry.appearFrame)).toBe("sent");
    expect(deliveryStateAt(project, plan, enviada, entry.appearFrame + plan.fps)).not.toBe("sent");
    expect(deliveryStateAt(project, plan, enviada, entry.appearFrame + plan.fps * 5)).toBe("read");
  });
});

describe("linha de eventos e estado do relógio", () => {
  it("gera eventos em ordem e um estado coerente", () => {
    const project = baseProject();
    const plan = buildPlan(project);
    const events = conversationEvents(project, plan);
    expect(events.length).toBeGreaterThan(3);
    expect(events.map((e) => e.frame)).toEqual([...events.map((e) => e.frame)].sort((a, b) => a - b));

    const state = getStateAt(project, plan, plan.totalFrames - 1);
    expect(state.visibleMessages).toHaveLength(3);
    expect(state.deliveryStates[project.messages[2]!.id]).toBe("read");
    expect(state.activeTyping).toBeNull();
  });
});

describe("personalidade", () => {
  it("quebra frases longas de quem escreve curto e mantém o texto inteiro", () => {
    const filho = PERSONALITY_PRESETS.find((p) => p.id === "filho")!.value;
    const texto = "tio, a porta tava aberta e eu entrei, mas tem um cachorro enorme aqui dentro agora";
    const partes = splitByPersonality(texto, filho, "m1");
    expect(partes.join(" ").replace(/\s+/g, " ")).toContain("cachorro enorme");
    const chefe = PERSONALITY_PRESETS.find((p) => p.id === "chefe")!.value;
    expect(splitByPersonality(texto, chefe, "m1")).toEqual(splitByPersonality(texto, chefe, "m1"));
  });
});

describe("desfazer e refazer", () => {
  it("volta e avança o documento", () => {
    const a = baseProject();
    const b = { ...a, title: "Outro" };
    let h = createHistory(a);
    h = pushHistory(h, b);
    expect(canUndo(h)).toBe(true);
    h = undo(h);
    expect(h.present.title).toBe(a.title);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present.title).toBe("Outro");
  });
});
