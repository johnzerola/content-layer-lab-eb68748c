import { describe, expect, it } from "vitest";
import { buildPlan } from "../clock";
import { chatRect, entranceTransform, sceneExitAt } from "../draw";
import { computeMessageTimings, entranceMsOf, humanTypingMs, DEFAULT_TYPING_PROFILE, totalDurationMs } from "../timing";
import { applyConversationTimingPreset } from "../timing-presets";
import {
  createChatSceneProject,
  createMessage,
  createDemoChatSceneProject,
  createParticipant,
  DEFAULT_LAYOUT,
  DEFAULT_MOTION,
  LAYOUT_PRESETS,
} from "../types";

function scene(count = 6) {
  const me = createParticipant({ name: "Você", isSelf: true });
  const ana = createParticipant({ name: "Ana" });
  const messages = Array.from({ length: count }, (_, i) =>
    createMessage(i % 2 ? me.id : ana.id, { id: `m${i}`, text: `mensagem número ${i}, com um pouco de texto.` }),
  );
  return createChatSceneProject({ participants: [me, ana], messages });
}

describe("ritmo humano", () => {
  it("é determinístico: mesmo texto, mesmo tempo", () => {
    const a = humanTypingMs("oi, tudo bem?", DEFAULT_TYPING_PROFILE, "m1");
    const b = humanTypingMs("oi, tudo bem?", DEFAULT_TYPING_PROFILE, "m1");
    expect(a).toBe(b);
  });

  it("texto maior leva mais tempo para digitar", () => {
    const curto = humanTypingMs("oi", DEFAULT_TYPING_PROFILE, "m1");
    const longo = humanTypingMs("oi".repeat(60), DEFAULT_TYPING_PROFILE, "m1");
    expect(longo).toBeGreaterThan(curto);
  });

  it("pontuação acrescenta pausas", () => {
    const seco = humanTypingMs("vamos hoje mesmo agora", DEFAULT_TYPING_PROFILE, "x");
    const pausado = humanTypingMs("vamos, hoje. mesmo. agora.", DEFAULT_TYPING_PROFILE, "x");
    expect(pausado).toBeGreaterThan(seco);
  });

  it("cada mensagem tem as etapas na ordem certa", () => {
    const timings = computeMessageTimings(scene());
    for (const t of timings) {
      expect(t.typingStartMs).toBeLessThanOrEqual(t.appearMs);
      expect(t.appearMs).toBeLessThan(t.endMs);
    }
    for (let i = 1; i < timings.length; i += 1) {
      expect(timings[i]!.typingStartMs).toBeGreaterThanOrEqual(timings[i - 1]!.endMs);
    }
  });

  it("mensagem com peso fica mais tempo na tela", () => {
    const base = scene(2);
    const marcada = {
      ...base,
      messages: base.messages.map((m, i) => (i === 0 ? { ...m, emphasis: true } : m)),
    };
    const a = computeMessageTimings(base)[0]!;
    const b = computeMessageTimings(marcada)[0]!;
    expect(b.readingMs).toBeGreaterThanOrEqual(a.readingMs);
  });

  it("aguenta uma conversa longa sem perder a ordem", () => {
    const plan = buildPlan(scene(100));
    expect(plan.entries).toHaveLength(100);
    expect(plan.totalFrames).toBeGreaterThan(plan.entries[99]!.appearFrame);
  });

  it("usa a duração de áudio medida sem acrescentar uma leitura estimada", () => {
    const base = scene(2);
    const audio = {
      ...base,
      timing: { ...base.timing, audioDriven: true },
      messages: base.messages.map((message, index) => index === 1 ? { ...message, voiceMs: 2400 } : message),
    };
    const timing = computeMessageTimings(audio)[1]!;
    expect(timing.readingMs).toBe(2400);
    expect(timing.endMs - timing.appearMs).toBe(2400 + timing.pauseAfterMs);
  });

  it("oferece o modo longo para 46 falas e garante pelo menos dois minutos", () => {
    const base = scene(46);
    const long = applyConversationTimingPreset(base, "long-2m");
    const timings = computeMessageTimings(long);

    expect(long.timing.mode).toBe("long-2m");
    expect(long.timing.audioDriven).toBe(true);
    expect(long.messages).toHaveLength(46);
    expect(totalDurationMs(long, timings)).toBeGreaterThanOrEqual(120_000);
    expect(buildPlan(long).durationMs).toBeGreaterThanOrEqual(120_000);
  });

  it("voltar ao padrão remove a duração mínima sem tocar no conteúdo", () => {
    const base = scene(3);
    const long = applyConversationTimingPreset(base, "long-2m");
    const standard = applyConversationTimingPreset(long, "standard");

    expect(standard.timing.mode).toBe("standard");
    expect(standard.timing.minimumDurationMs).toBeUndefined();
    expect(standard.messages.map((message) => message.text)).toEqual(
      base.messages.map((message) => message.text),
    );
    expect(buildPlan(standard).durationMs).toBeLessThan(120_000);
  });
});

describe("animação e enquadramento", () => {
  it("a entrada começa invisível e termina no lugar", () => {
    for (const anim of ["fade", "slide-up", "bubble-pop", "fast-pop", "soft-spring"] as const) {
      const start = entranceTransform(anim, 0);
      const end = entranceTransform(anim, 1);
      expect(start.alpha).toBeLessThan(0.3);
      expect(end.alpha).toBe(1);
      expect(Math.abs(end.scale - 1)).toBeLessThan(0.02);
      expect(Math.abs(end.dy)).toBeLessThan(0.02);
    }
  });

  it("os enquadramentos cabem dentro do vídeo", () => {
    for (const preset of LAYOUT_PRESETS) {
      const rect = chatRect({ ...preset.value, preset: preset.id }, 1080, 1920);
      expect(rect.x + rect.w).toBeLessThanOrEqual(1080);
      expect(rect.h).toBeGreaterThan(200);
    }
  });

  it("tela cheia ocupa o vídeo inteiro", () => {
    const rect = chatRect(DEFAULT_LAYOUT, 1080, 1920);
    expect(rect).toMatchObject({ x: 0, y: 0, w: 1080, h: 1920 });
  });
});

describe("cartão de cena", () => {
  it("não digita, não é falado e fica pelo menos 1,5s na tela", async () => {
    const { createChatSceneProject, createMessage } = await import("../types");
    const { computeMessageTimings } = await import("../timing");
    const { speakableText } = await import("../voice");
    const project = createChatSceneProject({
      messages: [createMessage(project0Id(), { kind: "card", text: "Momentos antes" })],
    });
    function project0Id() {
      return "unused";
    }
    const t = computeMessageTimings(project)[0]!;
    expect(t.typingMs).toBe(0);
    expect(t.readingMs).toBeGreaterThanOrEqual(1500);
    expect(speakableText("card", "Momentos antes")).toBe("");
  });
});

describe("efeitos de entrada e saída", () => {
  it("aplica a intensidade no deslocamento da entrada", () => {
    const soft = entranceTransform("slide-up", 0, 1);
    const strong = entranceTransform("slide-up", 0, 2);
    expect(Math.abs(strong.dy)).toBeGreaterThan(Math.abs(soft.dy));
  });

  it("respeita a duração de entrada escolhida", () => {
    const base = createDemoChatSceneProject();
    expect(entranceMsOf({ ...base, motion: { ...DEFAULT_MOTION, enterMs: 520 } })).toBe(520);
  });

  it("esmaece a cena só no fim, conforme a duração da saída", () => {
    const project = { ...createDemoChatSceneProject(), motion: { ...DEFAULT_MOTION, exit: "fade" as const, exitMs: 1000 } };
    const plan = buildPlan(project);
    expect(sceneExitAt(project, plan, 0).alpha).toBe(1);
    expect(sceneExitAt(project, plan, plan.totalFrames - 1).alpha).toBeLessThan(0.2);
  });
});
