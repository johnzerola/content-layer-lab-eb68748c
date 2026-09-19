import { describe, expect, it } from "vitest";
import { buildPlan } from "../clock";
import { voiceSchedule } from "../audio-mix";
import { applyConversationTimingPreset } from "../timing-presets";
import { computeMessageTimings } from "../timing";
import { createChatSceneProject, createMessage, createParticipant } from "../types";
import { profileFromPreset } from "../voice";

function referenceScene(count = 46) {
  const me = createParticipant({ name: "Voce", isSelf: true });
  const other = createParticipant({ name: "Mae" });
  const messages = Array.from({ length: count }, (_, index) =>
    createMessage(index % 2 ? me.id : other.id, {
      id: `dynamic-${index}`,
      text: "Uma fala curta que mantem o ritmo da conversa.",
    }),
  );
  return createChatSceneProject({ participants: [me, other], messages });
}

function sampleClip(durationSec = 3) {
  return { key: "sample", blob: new Blob(), durationSec, buffer: {} as AudioBuffer };
}

describe("ritmo dinamico de referencia", () => {
  it("respeita as 46 duracoes reais sem sobrepor falas", () => {
    const dynamic = applyConversationTimingPreset(referenceScene(), "dynamic-fast");
    const withLongAudio = {
      ...dynamic,
      messages: dynamic.messages.map((message) => ({ ...message, voiceMs: 6_000 })),
    };
    const timings = computeMessageTimings(withLongAudio);

    expect(timings.every((item) => item.readingMs === 6_000)).toBe(true);
    expect(buildPlan(withLongAudio).durationMs).toBeGreaterThanOrEqual(46 * 6_000);
    expect(timings.slice(1).every((item, index) => item.appearMs >= timings[index]!.endMs)).toBe(true);
  });

  it("nao muda o tom para encaixar o clip no tempo estimado do texto", () => {
    const dynamic = applyConversationTimingPreset(referenceScene(1), "dynamic-fast");
    const message = dynamic.messages[0]!;
    const project = { ...dynamic, messages: [{ ...message, voiceMs: 3_000 }] };
    const schedule = voiceSchedule(project, buildPlan(project), new Map([[message.id, sampleClip()]]));

    expect(schedule[0]!.rate).toBe(1);
    expect(schedule[0]!.durationSec).toBe(3);
  });

  it("mantem voz e bolha sincronizadas quando o usuario acelera as falas", () => {
    const dynamic = applyConversationTimingPreset(referenceScene(2), "dynamic-fast");
    const project = {
      ...dynamic,
      timing: { ...dynamic.timing, speed: 2, voicePlaybackRate: 1.25 },
      messages: dynamic.messages.map((message) => ({ ...message, voiceMs: 4_000 })),
    };
    const plan = buildPlan(project);
    const clips = new Map(project.messages.map((message) => [message.id, sampleClip(4)]));
    const schedule = voiceSchedule(project, plan, clips);
    expect(schedule.map((item) => item.rate)).toEqual([1.25, 1.25]);
    expect(schedule.map((item) => item.durationSec)).toEqual([3.2, 3.2]);
    expect(schedule[1]!.startSec).toBeGreaterThanOrEqual(schedule[0]!.startSec + 3.2 - 1 / plan.fps);
    expect(plan.durationMs).toBeGreaterThanOrEqual(6_400);
  });

  it("permite comparar ate 2x sem mudar o padrao dos projetos existentes", () => {
    const dynamic = applyConversationTimingPreset(referenceScene(1), "dynamic-fast");
    const message = dynamic.messages[0]!;
    const original = { ...dynamic, messages: [{ ...message, voiceMs: 4_000 }] };
    const fast = { ...original, timing: { ...original.timing, voicePlaybackRate: 2 } };
    expect(voiceSchedule(original, buildPlan(original), new Map([[message.id, sampleClip(4)]]))[0]!.rate).toBe(1);
    expect(voiceSchedule(fast, buildPlan(fast), new Map([[message.id, sampleClip(4)]]))[0]!.durationSec).toBe(2);
    expect(buildPlan(fast).durationMs).toBeLessThan(buildPlan(original).durationMs);
  });

  it("nao reaplica pitch em um clip transformado no servidor", () => {
    const dynamic = applyConversationTimingPreset(referenceScene(1), "dynamic-fast");
    const message = dynamic.messages[0]!;
    const profile = profileFromPreset("adult-male-casual", {
      pitch: 2,
      transform: {
        presetId: "dialogue_fast",
        config: {
          mode: "TEMPO_ONLY",
          speedMultiplier: 1.3,
          pitchSemitones: 0,
          linkedPitchToSpeed: false,
          preservePitch: true,
          preserveFormants: false,
          normalization: { enabled: true, integratedLufs: -18, truePeakDb: -1.5, loudnessRange: 11 },
          outputCodec: "mp3",
        },
      },
    });
    const project = {
      ...dynamic,
      participants: dynamic.participants.map((participant) =>
        participant.id === message.participantId ? { ...participant, voice: profile } : participant,
      ),
      messages: [{ ...message, voiceMs: 3_000 }],
    };
    const schedule = voiceSchedule(project, buildPlan(project), new Map([[message.id, sampleClip()]]));

    expect(schedule[0]!.rate).toBe(1);
  });
});
