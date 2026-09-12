/**
 * Provedor de vozes e cache das falas (lado do navegador).
 *
 * O contrato `VoiceProvider` existe para o resto do sistema não saber quem
 * sintetiza. Toda fala devolve o áudio **e a duração medida** — é essa duração
 * que o motor de ritmo usa para segurar a bolha na tela, nunca uma estimativa.
 */
import type { ChatSceneProject } from "./types";
import { effectiveVoice } from "./voice-resolution";
import {
  pitchRate,
  speakableText,
  voiceDirection,
  voiceKey,
  voicePreset,
  VOICE_SAMPLE_TEXT,
  type MessageVoiceDirection,
  type VoiceProfile,
  type VoiceProviderCapabilities,
} from "./voice";

export interface VoiceClip {
  key: string;
  blob: Blob;
  /** duração real do áudio, medida depois de decodificar */
  durationSec: number;
  buffer: AudioBuffer;
}

export interface VoiceProvider {
  readonly id: string;
  listVoices(): Promise<{ id: string; label: string }[]>;
  getCapabilities(): VoiceProviderCapabilities;
  previewVoice(profile: VoiceProfile, text: string, signal?: AbortSignal): Promise<VoiceClip>;
  synthesize(text: string, profile: VoiceProfile, direction?: MessageVoiceDirection, signal?: AbortSignal): Promise<VoiceClip>;
  estimateCost?(characters: number): number | null;
}

const cache = new Map<string, VoiceClip>();
let audioCtx: AudioContext | null = null;

function context(): AudioContext {
  const Ctor =
    (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ??
    (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error("Este navegador não consegue trabalhar com áudio.");
  audioCtx ??= new Ctor();
  return audioCtx;
}

export async function decodeClip(key: string, blob: Blob): Promise<VoiceClip> {
  const data = await blob.arrayBuffer();
  const buffer = await context().decodeAudioData(data.slice(0));
  return { key, blob, durationSec: buffer.duration, buffer };
}

export function cachedClip(key: string): VoiceClip | undefined {
  return cache.get(key);
}

export function cacheSize(): number {
  return cache.size;
}

export function clearVoiceCache() {
  cache.clear();
}

/** Duração real da fala já com o tom aplicado, em milissegundos. */
export function clipDurationMs(clip: VoiceClip, profile: VoiceProfile | null | undefined): number {
  return Math.round((clip.durationSec / pitchRate(profile?.pitch)) * 1000);
}

/**
 * Toca uma fala no navegador com o tom e o volume da pessoa. Devolve uma
 * função para parar no meio.
 */
export function playClip(clip: VoiceClip, profile?: VoiceProfile | null): () => void {
  const ctx = context();
  void ctx.resume().catch(() => {});
  const source = ctx.createBufferSource();
  source.buffer = clip.buffer;
  source.playbackRate.value = pitchRate(profile?.pitch);
  const gain = ctx.createGain();
  gain.gain.value = Math.max(0.2, Math.min(1.5, profile?.gain ?? 1));
  source.connect(gain).connect(ctx.destination);
  source.start();
  return () => {
    try {
      source.stop();
    } catch {
      /* já parou */
    }
  };
}

/** Gera (ou reaproveita) uma frase curta e toca, para ouvir a voz escolhida. */
export async function previewVoice(
  provider: VoiceProvider,
  profile: VoiceProfile,
  text = VOICE_SAMPLE_TEXT,
): Promise<() => void> {
  const clip = await provider.synthesize(text.slice(0, 160), profile);
  return playClip(clip, profile);
}

/** Provedor padrão: IA da Lovable, sempre passando pelo servidor. */
export function createGatewayVoiceProvider(
  call: (input: { text: string; voice: string; direction?: string; speed?: number }) => Promise<{
    audio: string;
    mime: string;
  }>,
): VoiceProvider {
  return {
    id: "lovable-ai",
    async listVoices() {
      return [];
    },
    getCapabilities() {
      return { languages: ["pt-BR"], maxCharacters: 600, controls: { speed: true, pitch: true, energy: false, expressiveness: true, roughness: false, warmth: false, brightness: false, emotion: true }, costEstimate: false, local: false };
    },
    previewVoice(profile, text, signal) {
      return this.synthesize(text, profile, undefined, signal);
    },
    async synthesize(text, profile, direction) {
      const key = voiceKey(text, profile, direction);
      const hit = cache.get(key);
      if (hit) return hit;

      const preset = voicePreset(profile.presetId);
      const { audio, mime } = await call({
        text,
        voice: preset.providerVoice,
        direction: voiceDirection(profile.style, direction?.emotion),
        speed: Math.max(0.7, Math.min(1.3, profile.speed * (direction?.speedMultiplier ?? 1))),
      });
      const bytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: mime || "audio/mpeg" });
      const clip = await decodeClip(key, blob);
      cache.set(key, clip);
      return clip;
    },
  };
}

export interface CastProgress {
  done: number;
  total: number;
  /** id da mensagem sendo gerada */
  current: string | null;
}

export interface CastResult {
  /** fala de cada mensagem, por id */
  clips: Map<string, VoiceClip>;
  /** duração medida de cada mensagem, em milissegundos */
  durations: Record<string, number>;
  reused: number;
  generated: number;
  failures: { id: string; reason: string }[];
}

/** Mensagens que têm fala, na ordem da conversa. */
export function speakingMessages(project: ChatSceneProject) {
  return project.messages
    .map((message) => ({ message, text: speakableText(message.kind, message.text) }))
    .filter((m) => m.text.length > 0);
}

/**
 * Gera (ou reaproveita) a fala de todas as mensagens. Em lotes pequenos, para
 * não sobrecarregar o provedor nem travar a interface.
 */
export async function generateCast(
  project: ChatSceneProject,
  provider: VoiceProvider,
  options: { batch?: number; onProgress?: (p: CastProgress) => void; signal?: AbortSignal } = {},
): Promise<CastResult> {
  const items = speakingMessages(project);
  const batch = Math.max(1, options.batch ?? 3);
  const result: CastResult = {
    clips: new Map(),
    durations: {},
    reused: 0,
    generated: 0,
    failures: [],
  };
  let done = 0;

  for (let i = 0; i < items.length; i += batch) {
    if (options.signal?.aborted) throw new DOMException("Geração cancelada", "AbortError");
    const slice = items.slice(i, i + batch);
    await Promise.all(
      slice.map(async ({ message, text }) => {
        const resolved = effectiveVoice(project, message);
        if (!resolved) return;
        const { profile, direction } = resolved;
        const key = voiceKey(text, profile, direction);
        const hit = cachedClip(key);
        options.onProgress?.({ done, total: items.length, current: message.id });
        try {
          const clip = hit ?? (await provider.synthesize(text, profile, direction, options.signal));
          if (hit) result.reused += 1;
          else result.generated += 1;
          result.clips.set(message.id, clip);
          result.durations[message.id] = clipDurationMs(clip, profile);
        } catch (err) {
          result.failures.push({
            id: message.id,
            reason: err instanceof Error ? err.message : "falhou",
          });
        } finally {
          done += 1;
          options.onProgress?.({ done, total: items.length, current: null });
        }
      }),
    );
  }

  return result;
}

/** Aplica as durações medidas no documento, para o ritmo bater com a fala. */
export function applyVoiceDurations(
  project: ChatSceneProject,
  durations: Record<string, number>,
): ChatSceneProject {
  return {
    ...project,
    messages: project.messages.map((m) =>
      durations[m.id] ? { ...m, voiceMs: durations[m.id]! } : m,
    ),
  };
}
