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

describe("ritmo dinamico de referencia", () => {
  it("mantem 46 falas curtas mesmo quando o provedor devolve audios longos", () => {
    const dynamic = applyConversationTimingPreset(referenceScene(), "dynamic-fast");
    const withLongAudio = {
      ...dynamic,
      messages: dynamic.messages.map((message) => ({ ...message, voiceMs: 6_000 })),
    };
    const timings = computeMessageTimings(withLongAudio);

    expect(withLongAudio.timing.fitVoiceToTiming).toBe(true);
    expect(timings.every((item) => item.readingMs < 6_000)).toBe(true);
    expect(buildPlan(withLongAudio).durationMs).toBeLessThan(120_000);
  });

  it("acelera apenas o clip que nao cabe na janela de texto", () => {
    const dynamic = applyConversationTimingPreset(referenceScene(1), "dynamic-fast");
    const message = dynamic.messages[0]!;
    const project = {
      ...dynamic,
      messages: [{ ...message, voiceMs: 900 }],
    };
    const plan = buildPlan(project);
    const schedule = voiceSchedule(project, plan, new Map([[message.id, {
      key: message.id,
      blob: new Blob(),
      durationSec: 3,
      buffer: {} as AudioBuffer,
    }]]));

    expect(schedule[0]!.rate).toBeGreaterThan(1);
    expect(schedule[0]!.durationSec).toBeLessThan(schedule[0]!.clip.durationSec);
  });

  it("nao aplica um segundo playbackRate quando o transform ja preserva o tom", () => {
    const dynamic = applyConversationTimingPreset(referenceScene(1), "dynamic-fast");
    const message = dynamic.messages[0]!;
    const profile = profileFromPreset("adult-male-casual", { id: "test-profile" });
    const project = {
      ...dynamic,
      participants: dynamic.participants.map((participant) => participant.id === message.participantId
        ? { ...participant, voice: { ...participant.voice, transform: {
            presetId: "dialogue_fast",
            config: {
              mode: "TEMPO_ONLY" as const,
              speedMultiplier: 1.3,
              pitchSemitones: 0,
              linkedPitchToSpeed: false,
              preservePitch: true,
              preserveFormants: false,
              normalization: { enabled: true, integratedLufs: -18, truePeakDb: -1.5, loudnessRange: 11 },
              outputCodec: "mp3" as const,
            },
          } } }
        : participant),
      messages: [{ ...message, voiceMs: 900 }],
    };
    const plan = buildPlan(project);
    const schedule = voiceSchedule(project, plan, new Map([[message.id, {
      key: message.id,
      blob: new Blob(),
      durationSec: 3,
      buffer: {} as AudioBuffer,
    }]]));

    expect(schedule[0]!.rate).toBe(1);
  });
});
