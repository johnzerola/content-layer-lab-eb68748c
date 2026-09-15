import { describe, expect, it } from "vitest";
import { buildPlan } from "../clock";
import { backgroundLabel, messagesPerMinute, rhythmBySecond, timeLabel } from "../rhythm";
import { createDemoChatSceneProject, createDemoChatSceneProjectB } from "../types";

describe("ritmo por segundo", () => {
  const a = createDemoChatSceneProject();
  const planA = buildPlan(a);

  it("cobre toda a duração da cena", () => {
    const rows = rhythmBySecond(a, planA);
    expect(rows.length).toBe(Math.ceil(planA.totalFrames / planA.fps));
    expect(rows[0]!.label).toBe("0:00");
  });

  it("lista cada mensagem uma única vez", () => {
    const ids = rhythmBySecond(a, planA).flatMap((r) => r.events.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(a.messages.length);
  });

  it("descreve fundo e cadência", () => {
    expect(backgroundLabel(a.background)).toContain("Vídeo");
    expect(messagesPerMinute(a, planA)).toBeGreaterThan(0);
    expect(timeLabel(67)).toBe("1:07");
  });
});

describe("segundo demo", () => {
  it("mantém a mesma família com outro fundo e outras vozes", () => {
    const a = createDemoChatSceneProject();
    const b = createDemoChatSceneProjectB();
    expect(b.messages.length).toBe(a.messages.length);
    expect(b.participants.map((p) => p.name)).toEqual(a.participants.map((p) => p.name));
    expect(b.background?.videoUrl).not.toBe(a.background?.videoUrl);
    const voicesA = (a.voiceProfiles ?? []).map((v) => v.providerVoiceId);
    const voicesB = (b.voiceProfiles ?? []).map((v) => v.providerVoiceId);
    voicesB.forEach((v, i) => expect(v).not.toBe(voicesA[i]));
  });
});
