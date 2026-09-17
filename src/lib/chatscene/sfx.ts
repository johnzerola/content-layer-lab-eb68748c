/**
 * Efeitos sonoros curtos da conversa (envio, recebido, aviso).
 *
 * São gerados por cálculo, sem arquivo de áudio: cada efeito é uma pequena
 * sequência de tons com queda rápida de volume. Assim a exportação continua
 * determinística e não depende de nenhum arquivo externo ou licença.
 */
import type { ConversationPlan } from "./clock";
import type { ChatSceneProject } from "./types";
import { participantOf, threadIdOf } from "./types";

export type SoundEffectId = "send" | "receive" | "alert";

export const SOUND_EFFECTS: { id: SoundEffectId; label: string }[] = [
  { id: "send", label: "Enviada" },
  { id: "receive", label: "Recebida" },
  { id: "alert", label: "Aviso" },
];

interface Tone {
  freq: number;
  /** início relativo, em segundos */
  at: number;
  dur: number;
  gain: number;
}

const RECIPES: Record<SoundEffectId, Tone[]> = {
  send: [{ freq: 1180, at: 0, dur: 0.09, gain: 0.5 }],
  receive: [
    { freq: 740, at: 0, dur: 0.08, gain: 0.45 },
    { freq: 990, at: 0.07, dur: 0.12, gain: 0.45 },
  ],
  alert: [
    { freq: 520, at: 0, dur: 0.1, gain: 0.5 },
    { freq: 660, at: 0.1, dur: 0.1, gain: 0.5 },
    { freq: 880, at: 0.2, dur: 0.16, gain: 0.5 },
  ],
};

export const SFX_DURATION_SEC = 0.4;

/** Constrói o efeito em um buffer curto de áudio. */
export function renderSoundEffect(
  ctx: BaseAudioContext,
  id: SoundEffectId,
  volume = 1,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.ceil(SFX_DURATION_SEC * rate), rate);
  const data = buffer.getChannelData(0);
  for (const tone of RECIPES[id] ?? RECIPES.send) {
    const start = Math.floor(tone.at * rate);
    const length = Math.floor(tone.dur * rate);
    for (let i = 0; i < length; i += 1) {
      const idx = start + i;
      if (idx >= data.length) break;
      const t = i / rate;
      const decay = Math.exp(-t * 22);
      data[idx] =
        (data[idx] ?? 0) +
        Math.sin(2 * Math.PI * tone.freq * t) * tone.gain * decay * Math.max(0, volume);
    }
  }
  return buffer;
}

export interface ScheduledSfx {
  id: string;
  effect: SoundEffectId;
  startSec: number;
}

/**
 * Quais efeitos tocam e quando. Uma mensagem pode escolher o efeito; quando o
 * projeto pede efeitos automáticos, quem envia ganha "Enviada" e os demais
 * "Recebida".
 */
export function sfxSchedule(project: ChatSceneProject, plan: ConversationPlan): ScheduledSfx[] {
  if (!project.sound?.enabled) return [];
  const sparse = project.sound.mode === "transitions";
  const out: ScheduledSfx[] = [];
  let previousThread = "";
  for (const message of project.messages) {
    const entry = plan.byId[message.id];
    if (!entry || (sparse && message.initial)) continue;
    const thread = threadIdOf(project, message);
    const transition = previousThread !== "" && previousThread !== thread;
    previousThread = thread;
    let effect: SoundEffectId | null = (message.soundEffect as SoundEffectId | undefined) ?? null;
    if (effect && !SOUND_EFFECTS.some((item) => item.id === effect)) effect = null;
    if (!effect && (!sparse || transition || message.kind === "card" || message.kind === "system")) {
      if (message.kind === "system" || message.kind === "card") effect = "alert";
      else effect = participantOf(project, message.participantId).isSelf ? "send" : "receive";
    }
    if (!effect) continue;
    out.push({ id: message.id, effect, startSec: entry.appearFrame / plan.fps });
  }
  return out.sort((a, b) => a.startSec - b.startSec);
}
