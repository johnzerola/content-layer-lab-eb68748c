import { describe, expect, it } from "vitest";
import {
  DEFAULT_VOICE,
  DEFAULT_VOICE_MIX,
  speakableText,
  voiceDirection,
  voiceKey,
  voicePreset,
  VOICE_PRESETS,
} from "../voice";
import { applyVoiceDurations, speakingMessages } from "../voice-cast";
import { duckingCurve, voiceSchedule } from "../audio-mix";
import { buildPlan } from "../clock";
import { createChatSceneProject, createMessage, normalizeChatSceneProject } from "../types";

describe("elenco de vozes", () => {
  it("as vozes do elenco são genéricas e distintas", () => {
    const ids = VOICE_PRESETS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(VOICE_PRESETS.every((v) => v.providerVoice.length > 2)).toBe(true);
    expect(voicePreset("não-existe").id).toBeTruthy();
  });

  it("cada jeito de falar tem uma direção em português", () => {
    expect(voiceDirection("assustada")).toMatch(/português/i);
    expect(voiceDirection(undefined)).toMatch(/português/i);
  });

  it("o mesmo texto com a mesma voz gera a mesma chave (não sintetiza duas vezes)", () => {
    const a = voiceKey("bora hoje?", DEFAULT_VOICE);
    const b = voiceKey(" bora hoje? ", DEFAULT_VOICE);
    expect(a).toBe(b);
    expect(voiceKey("bora hoje?", { ...DEFAULT_VOICE, style: "nervosa" })).not.toBe(a);
    expect(voiceKey("bora hoje?", { ...DEFAULT_VOICE, speed: 1.2 })).not.toBe(a);
  });

  it("avisos do app e figurinhas não têm fala", () => {
    expect(speakableText("system", "Ana entrou no grupo")).toBe("");
    expect(speakableText("sticker", "kkk")).toBe("");
    expect(speakableText("text", "  oi   gente ")).toBe("oi gente");
  });

  it("só mensagens com texto entram na geração", () => {
    const project = createChatSceneProject();
    const messages = [
      ...project.messages,
      createMessage(project.participants[0]!.id, { kind: "system", text: "Ana saiu" }),
      createMessage(project.participants[0]!.id, { kind: "image", text: "" }),
    ];
    const list = speakingMessages({ ...project, messages });
    expect(list.every((m) => m.text.length > 0)).toBe(true);
    expect(list.some((m) => m.message.kind === "system")).toBe(false);
  });

  it("a mixagem tem ajustes padrão e sobrevive ao reabrir", () => {
    const reopened = normalizeChatSceneProject({ title: "antiga" } as never);
    expect(reopened.voiceMix).toEqual(DEFAULT_VOICE_MIX);
  });
});

describe("ritmo e trilha", () => {
  it("a duração medida da fala segura a bolha na tela", () => {
    const project = createChatSceneProject();
    const id = project.messages[0]!.id;
    const antes = buildPlan(project).totalFrames;
    const comVoz = applyVoiceDurations(project, { [id]: 9000 });
    expect(comVoz.messages[0]!.voiceMs).toBe(9000);
    expect(buildPlan(comVoz).totalFrames).toBeGreaterThan(antes);
  });

  it("cada fala começa quando a bolha aparece", () => {
    const project = createChatSceneProject();
    const plan = buildPlan(project);
    const clips = new Map(
      project.messages.slice(0, 2).map((m) => [
        m.id,
        { key: m.id, blob: new Blob(), durationSec: 2, buffer: {} as AudioBuffer },
      ]),
    );
    const schedule = voiceSchedule(project, plan, clips);
    expect(schedule).toHaveLength(2);
    for (const item of schedule) {
      expect(item.startSec).toBeCloseTo(plan.byId[item.id]!.appearFrame / plan.fps, 5);
    }
    expect(schedule[0]!.startSec).toBeLessThan(schedule[1]!.startSec);
  });

  it("a música abaixa enquanto alguém fala e volta depois", () => {
    const curve = duckingCurve([{ startSec: 2, clip: { durationSec: 3 } }], true);
    const at = (t: number) => curve.filter((p) => p.time <= t).at(-1)!.value;
    expect(at(0)).toBe(1);
    expect(at(3)).toBeLessThan(0.5);
    expect(at(6)).toBe(1);
    expect(duckingCurve([{ startSec: 2, clip: { durationSec: 3 } }], false)).toEqual([
      { time: 0, value: 1 },
    ]);
  });
});
