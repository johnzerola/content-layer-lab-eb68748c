/**
 * Trilha sonora da cena: falas posicionadas no tempo exato de cada bolha,
 * música opcional por baixo, com abaixamento automático enquanto alguém fala.
 *
 * Tudo é montado fora da tela (OfflineAudioContext) e entregue como um único
 * áudio pronto para entrar no MP4 — o resultado é o mesmo em toda exportação.
 */
import type { ConversationPlan } from "./clock";
import type { VoiceClip } from "./voice-cast";
import { pitchRate, type VoiceMixSettings } from "./voice";
import { renderSoundEffect, sfxSchedule } from "./sfx";
import type { ChatSceneProject } from "./types";
import { effectiveVoice } from "./voice-resolution";

export const MIX_SAMPLE_RATE = 48000;
const MAX_DYNAMIC_VOICE_RATE = 2.2;

export interface MixInput {
  project: ChatSceneProject;
  plan: ConversationPlan;
  clips: Map<string, VoiceClip>;
  settings: VoiceMixSettings;
  /** música já decodificada, quando houver */
  music?: AudioBuffer | null;
}

/** Momento, em segundos, em que cada fala começa. */
export interface ScheduledVoice {
  id: string;
  startSec: number;
  clip: VoiceClip;
  gain: number;
  /** velocidade de reprodução que dá o tom escolhido */
  rate: number;
  /** duração já com o tom aplicado */
  durationSec: number;
}

export function voiceSchedule(
  project: ChatSceneProject,
  plan: ConversationPlan,
  clips: Map<string, VoiceClip>,
): ScheduledVoice[] {
  const out: ScheduledVoice[] = [];
  for (const message of project.messages) {
    const clip = clips.get(message.id);
    const entry = plan.byId[message.id];
    if (!clip || !entry) continue;
    const voice = effectiveVoice(project, message);
    const pitch = pitchRate(voice?.profile.pitch);
    const targetSec = entry.timing.readingMs / 1000;
    const fitRate = project.timing.fitVoiceToTiming && targetSec > 0
      ? Math.max(1, Math.min(MAX_DYNAMIC_VOICE_RATE, clip.durationSec / targetSec))
      : 1;
    const rate = pitch * fitRate;
    out.push({
      id: message.id,
      startSec: entry.appearFrame / plan.fps,
      clip,
      gain: Math.max(0.2, Math.min(1.5, (voice?.profile.gain ?? 1) * (voice?.direction.energyMultiplier ?? 1))),
      rate,
      durationSec: clip.durationSec / rate,
    });
  }
  return out.sort((a, b) => a.startSec - b.startSec);
}

/** Fator de volume da música em cada instante (1 = cheia, menor = abaixada). */
export function duckingCurve(
  schedule: { startSec: number; durationSec?: number; clip: { durationSec: number } }[],
  ducking: boolean,
  options: { amount?: number; attackMs?: number; releaseMs?: number } = {},
): { time: number; value: number }[] {
  if (!ducking || !schedule.length) return [{ time: 0, value: 1 }];
  const amount = Math.max(0, Math.min(1, options.amount ?? 0.78));
  const floor = 1 - amount;
  const attack = Math.max(0, (options.attackMs ?? 180) / 1000);
  const release = Math.max(0, (options.releaseMs ?? 240) / 1000);
  const points: { time: number; value: number }[] = [{ time: 0, value: 1 }];
  for (const s of schedule) {
    const dur = s.durationSec ?? s.clip.durationSec;
    const start = Math.max(0, s.startSec - attack);
    const end = s.startSec + dur + release;
    points.push({ time: start, value: 1 }, { time: s.startSec, value: floor });
    points.push({ time: s.startSec + dur, value: floor }, { time: end, value: 1 });
  }
  return points.sort((a, b) => a.time - b.time);
}

function offlineContext(seconds: number): OfflineAudioContext {
  const Ctor = (globalThis as unknown as { OfflineAudioContext?: typeof OfflineAudioContext })
    .OfflineAudioContext;
  if (!Ctor) throw new Error("Este navegador não consegue montar a trilha de áudio.");
  return new Ctor(2, Math.max(1, Math.ceil(seconds * MIX_SAMPLE_RATE)), MIX_SAMPLE_RATE);
}

/** Monta a trilha inteira da cena. Devolve null quando não há som nenhum. */
export async function mixConversationAudio(input: MixInput): Promise<AudioBuffer | null> {
  const schedule = voiceSchedule(input.project, input.plan, input.clips);
  const effects = sfxSchedule(input.project, input.plan);
  if (!schedule.length && !input.music && !effects.length) return null;

  const seconds = input.plan.totalFrames / input.plan.fps;
  const ctx = offlineContext(seconds);
  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);

  for (const item of schedule) {
    const source = ctx.createBufferSource();
    source.buffer = item.clip.buffer;
    source.playbackRate.value = item.rate;
    const gain = ctx.createGain();
    gain.gain.value = item.gain;
    source.connect(gain).connect(master);
    source.start(Math.min(item.startSec, Math.max(0, seconds - 0.05)));
  }

  // sons curtos de envio/recebimento
  if (effects.length) {
    const volume = Math.max(0, Math.min(1, input.project.sound?.volume ?? 0.5));
    const cache = new Map<string, AudioBuffer>();
    for (const fx of effects) {
      let buffer = cache.get(fx.effect);
      if (!buffer) {
        buffer = renderSoundEffect(ctx, fx.effect, volume);
        cache.set(fx.effect, buffer);
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(master);
      source.start(Math.min(fx.startSec, Math.max(0, seconds - 0.05)));
    }
  }


  if (input.music) {
    const source = ctx.createBufferSource();
    source.buffer = input.music;
    source.loop = true;
    const gain = ctx.createGain();
    const base = Math.max(0, Math.min(1, input.settings.musicGain ?? 0.25));
    const curve = duckingCurve(schedule, input.settings.ducking !== false, {
      ...(input.settings.duckingAmount === undefined ? {} : { amount: input.settings.duckingAmount }),
      ...(input.settings.duckingAttackMs === undefined ? {} : { attackMs: input.settings.duckingAttackMs }),
      ...(input.settings.duckingReleaseMs === undefined ? {} : { releaseMs: input.settings.duckingReleaseMs }),
    });
    gain.gain.setValueAtTime(base * (curve[0]?.value ?? 1), 0);
    for (const point of curve) {
      gain.gain.linearRampToValueAtTime(base * point.value, Math.min(point.time, seconds));
    }
    source.connect(gain).connect(master);
    source.start(0);
  }

  const rendered = await ctx.startRendering();
  return input.settings.normalize !== false ? normalize(rendered) : rendered;
}

/** Deixa o pico da trilha em um nível seguro, sem distorcer. */
export function normalize(buffer: AudioBuffer, target = 0.89): AudioBuffer {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i += 1) {
      const v = Math.abs(data[i]!);
      if (v > peak) peak = v;
    }
  }
  if (peak <= 0.0001 || Math.abs(peak - target) < 0.02) return buffer;
  const factor = target / peak;
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i += 1) data[i] = data[i]! * factor;
  }
  return buffer;
}

/** Decodifica uma música de fundo a partir de um endereço. */
export async function loadMusic(url: string): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const data = await res.arrayBuffer();
    const ctx = offlineContext(1);
    return await ctx.decodeAudioData(data);
  } catch {
    return null;
  }
}
