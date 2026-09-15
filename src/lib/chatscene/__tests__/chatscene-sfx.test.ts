import { describe, expect, it } from "vitest";
import { sfxSchedule, SOUND_EFFECTS } from "../sfx";
import { buildPlan } from "../clock";
import { createDemoChatSceneProject } from "../types";

const demo = () => createDemoChatSceneProject();

describe("sfxSchedule", () => {
  it("não toca nada quando o som está desligado", () => {
    const project = { ...demo(), sound: { enabled: false, volume: 0.5 } };
    expect(sfxSchedule(project, buildPlan(project))).toHaveLength(0);
  });

  it("dá um som para cada mensagem quando ligado", () => {
    const project = { ...demo(), sound: { enabled: true, volume: 0.5 } };
    const schedule = sfxSchedule(project, buildPlan(project));
    expect(schedule.length).toBe(project.messages.length);
  });

  it("fica em ordem de tempo", () => {
    const project = { ...demo(), sound: { enabled: true, volume: 0.5 } };
    const schedule = sfxSchedule(project, buildPlan(project));
    const times = schedule.map((s) => s.startSec);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("usa envio para quem escreve e recebida para os outros", () => {
    const project = { ...demo(), sound: { enabled: true, volume: 0.5 } };
    const schedule = sfxSchedule(project, buildPlan(project));
    expect(schedule.some((s) => s.effect === "send")).toBe(true);
    expect(schedule.some((s) => s.effect === "receive")).toBe(true);
  });

  it("lista três efeitos disponíveis", () => {
    expect(SOUND_EFFECTS.map((s) => s.id)).toEqual(["send", "receive", "alert"]);
  });
});
