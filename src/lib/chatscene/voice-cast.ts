/**
 * Provedor de vozes e cache das falas (lado do navegador).
 *
 * O contrato `VoiceProvider` existe para o resto do sistema não saber quem
 * sintetiza. Toda fala devolve o áudio **e a duração medida** — é essa duração
 * que o motor de ritmo usa para segurar a bolha na tela, nunca uma estimativa.
 */
import type { ChatSceneProject } from "./types";
import { participantOf } from "./types";
import { speakableText, voiceDirection, voiceKey, voicePreset, type VoiceProfile } from "./voice";

export interface VoiceClip {
  key: string;
  blob: Blob;
  /** duração real do áudio, medida depois de decodificar */
  durationSec: number;
  buffer: AudioBuffer;
}

export interface VoiceProvider {
  readonly id: string;
  synthesize(text: string, profile: VoiceProfile, signal?: AbortSignal): Promise<VoiceClip>;
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

/** Provedor padrão: IA da Lovable, sempre passando pelo servidor. */
export function createGatewayVoiceProvider(
  call: (input: { text: string; voice: string; direction?: string; speed?: number }) => Promise<{
    audio: string;
    mime: string;
  }>,
): VoiceProvider {
  return {
    id: "lovable-ai",
    async synthesize(text, profile) {
      const key = voiceKey(text, profile);
      const hit = cache.get(key);
      if (hit) return hit;

      const preset = voicePreset(profile.presetId);
      const { audio, mime } = await call({
        text,
        voice: preset.providerVoice,
        direction: voiceDirection(profile.style),
        speed: profile.speed,
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
        const author = participantOf(project, message.participantId);
        const profile = author.voice ?? undefined;
        if (!profile) return;
        const key = voiceKey(text, profile);
        const hit = cachedClip(key);
        options.onProgress?.({ done, total: items.length, current: message.id });
        try {
          const clip = hit ?? (await provider.synthesize(text, profile, options.signal));
          if (hit) result.reused += 1;
          else result.generated += 1;
          result.clips.set(message.id, clip);
          result.durations[message.id] = Math.round(clip.durationSec * 1000);
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
