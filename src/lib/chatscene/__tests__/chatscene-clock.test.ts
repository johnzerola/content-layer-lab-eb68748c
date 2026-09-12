import { describe, expect, it } from "vitest";
import { buildPlan, readMs, typingAt, typingMsOf, visibleAt } from "../clock";
import {
  createChatSceneProject,
  createMessage,
  createParticipant,
  normalizeChatSceneProject,
  renderSize,
} from "../types";
import { resolveTheme, CHAT_THEMES } from "../theme";

function project() {
  const me = createParticipant({ id: "me", name: "Eu", isSelf: true });
  const other = createParticipant({ id: "ana", name: "Ana" });
  return createChatSceneProject({
    participants: [me, other],
    messages: [
      createMessage("ana", { text: "oi" }),
      createMessage("me", { text: "oi, tudo bem?" }),
      createMessage("ana", { text: "não" }),
    ],
  });
}

describe("ConversationClock", () => {
  it("é determinístico: o mesmo documento gera o mesmo plano", () => {
    const p = project();
    expect(buildPlan(p)).toEqual(buildPlan(p));
  });

  it("mantém a ordem do roteiro e termina depois da última mensagem", () => {
    const plan = buildPlan(project());
    const frames = plan.entries.map((e) => e.appearFrame);
    expect(frames).toEqual([...frames].sort((a, b) => a - b));
    expect(plan.totalFrames).toBeGreaterThan(plan.entries.at(-1)!.endFrame);
  });

  it("aplica 'digitando…' só para quem não é o autor da história", () => {
    const p = project();
    expect(typingMsOf(p.messages[0]!, p)).toBeGreaterThan(0);
    expect(typingMsOf(p.messages[1]!, p)).toBe(0);
  });

  it("velocidade dobrada corta a duração pela metade (com arredondamento)", () => {
    const base = buildPlan(project());
    const fast = buildPlan({ ...project(), timing: { ...project().timing, speed: 2 } });
    expect(fast.totalFrames).toBeLessThanOrEqual(Math.ceil(base.totalFrames / 2) + 1);
  });

  it("revela as mensagens progressivamente", () => {
    const p = project();
    const plan = buildPlan(p);
    expect(visibleAt(p, plan, 0)).toHaveLength(0);
    expect(visibleAt(p, plan, plan.totalFrames)).toHaveLength(3);
    const first = plan.byId[p.messages[0]!.id]!;
    const typing = typingAt(p, plan, first.typingFrame + 1);
    expect(typing?.id).toBe(p.messages[0]!.id);
  });

  it("limita o tempo de leitura entre o mínimo e o máximo", () => {
    const p = project();
    expect(readMs(createMessage("ana", { text: "a" }), p.timing)).toBe(p.timing.minReadMs);
    expect(readMs(createMessage("ana", { text: "a".repeat(9999) }), p.timing)).toBe(p.timing.maxReadMs);
  });
});

describe("documento", () => {
  it("recupera documentos antigos sem quebrar", () => {
    const doc = normalizeChatSceneProject({ messages: [{ id: "x", participantId: "sumiu", kind: "text", text: "oi" }] as never });
    expect(doc.participants.length).toBeGreaterThan(0);
    expect(doc.messages[0]!.participantId).toBe(doc.participants[0]!.id);
  });

  it("gera dimensões pares para o codificador", () => {
    const { width, height } = renderSize({ aspect: "9:16", fps: 30, height: 1921, safeZones: true });
    expect(width % 2).toBe(0);
    expect(height % 2).toBe(0);
  });
});

describe("temas", () => {
  it("resolve variantes clara e escura de todos os temas", () => {
    for (const t of CHAT_THEMES) {
      expect(resolveTheme(t.id, true).background).toBeTruthy();
      expect(resolveTheme(t.id, false).background).toBeTruthy();
    }
    expect(resolveTheme("inexistente", true).id).toBe(CHAT_THEMES[0]!.id);
  });
});
