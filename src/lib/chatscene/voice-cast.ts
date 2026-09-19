/**
 * Provedor de vozes e cache das falas (lado do navegador).
 *
 * O contrato `VoiceProvider` existe para o resto do sistema não saber quem
 * sintetiza. Toda fala devolve o áudio **e a duração medida** — é essa duração
 * que o motor de ritmo usa para segurar a bolha na tela, nunca uma estimativa.
 */
import type { ChatSceneProject } from "./types";
import { effectiveVoice } from "./voice-resolution";
import { elevenLabsVoiceSettingsInput, type VoiceSynthesisRequest } from "./voice-request";
import { connectDialogue, dialogueGain } from "./voice-level";
import { compactGeneratedSpeech } from "./voice-pauses";
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
  synthesize(
    text: string,
    profile: VoiceProfile,
    direction?: MessageVoiceDirection,
    signal?: AbortSignal,
  ): Promise<VoiceClip>;
  estimateCost?(characters: number): number | null;
}

const cache = new Map<string, VoiceClip>();
let audioCtx: AudioContext | null = null;
const CACHE_DB = "chatscene-voice-cache-v1";

function openCacheDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(CACHE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("clips");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function persistedBlob(key: string): Promise<Blob | null> {
  const db = await openCacheDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const request = db.transaction("clips", "readonly").objectStore("clips").get(key);
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
    request.onerror = () => resolve(null);
  });
}

async function persistBlob(key: string, blob: Blob): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const request = db.transaction("clips", "readwrite").objectStore("clips").put(blob, key);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}

function context(): AudioContext {
  const Ctor =
    (
      globalThis as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      }
    ).AudioContext ??
    (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error("Este navegador não consegue trabalhar com áudio.");
  audioCtx ??= new Ctor();
  return audioCtx;
}

export async function decodeClip(key: string, blob: Blob, generated = false): Promise<VoiceClip> {
  const data = await blob.arrayBuffer();
  const audio = context();
  const decoded = await audio.decodeAudioData(data.slice(0));
  const buffer = generated
    ? compactGeneratedSpeech(decoded, (channels, length, sampleRate) =>
        audio.createBuffer(channels, length, sampleRate))
    : decoded;
  return { key, blob, durationSec: buffer.duration, buffer };
}

export function cachedClip(key: string): VoiceClip | undefined {
  return cache.get(key);
}

export function cacheSize(): number {
  return cache.size;
}

export function hasCachedClip(key: string): boolean {
  return cache.has(key);
}

export function clearVoiceCache() {
  cache.clear();
}

/** Duração real da fala já com o tom aplicado, em milissegundos. */
export function clipDurationMs(clip: VoiceClip, profile: VoiceProfile | null | undefined): number {
  // Áudio transformado já chega renderizado; sua duração decodificada é autoritativa.
  return Math.round(
    (clip.durationSec / (profile?.transform ? 1 : pitchRate(profile?.pitch))) * 1000,
  );
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
  source.playbackRate.value = profile?.transform ? 1 : pitchRate(profile?.pitch);
  connectDialogue(ctx, source, ctx.destination, dialogueGain(clip.buffer, profile?.gain ?? 1));
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
  // Unlock playback inside the click gesture, before waiting for inference.
  await context().resume();
  const clip = await provider.synthesize(text.slice(0, 160), profile);
  return playClip(clip, profile);
}

/** Provedor padrão: IA da Lovable, sempre passando pelo servidor. */
export function createGatewayVoiceProvider(
  call: (input: {
    text: string;
    voice: string;
    provider?: VoiceProfile["provider"];
    referenceId?: string;
    direction?: string;
    speed?: number;
    providerSettings?: VoiceSynthesisRequest["providerSettings"];
    transform?: VoiceProfile["transform"];
  }) => Promise<{
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
      return {
        languages: ["pt-BR"],
        maxCharacters: 600,
        controls: {
          speed: true,
          pitch: true,
          energy: false,
          expressiveness: true,
          roughness: false,
          warmth: false,
          brightness: false,
          emotion: true,
        },
        costEstimate: false,
        local: false,
      };
    },
    previewVoice(profile, text, signal) {
      return this.synthesize(text, profile, undefined, signal);
    },
    async synthesize(text, profile, direction) {
      const key = voiceKey(text, profile, direction);
      const hit = cache.get(key);
      if (hit) return hit;
      const stored = await persistedBlob(key);
      if (stored) {
        const clip = await decodeClip(key, stored, true);
        cache.set(key, clip);
        return clip;
      }

      const preset = voicePreset(profile.presetId);
      const { audio, mime } = await call({
        text,
        voice: profile.providerVoiceId ?? preset.providerVoice,
        provider: profile.provider,
        ...(profile.reference ? { referenceId: profile.reference.id } : {}),
        direction: voiceDirection(
          profile.style,
          direction?.emotion,
          Math.max(0, Math.min(1, (profile.energy ?? 0.5) * (direction?.energyMultiplier ?? 1))),
          profile.ageStyle ?? preset.age,
          profile.genderStyle ?? preset.gender,
          {
            ...(profile.expressiveness === undefined
              ? {}
              : { expressiveness: profile.expressiveness }),
            ...(profile.roughness === undefined ? {} : { roughness: profile.roughness }),
            ...(profile.warmth === undefined ? {} : { warmth: profile.warmth }),
            ...(profile.brightness === undefined ? {} : { brightness: profile.brightness }),
          },
        ),
        // ElevenLabs rejects values above 1.2 even though the shared project
        // contract allows 1.3 for other providers.
        speed: Math.max(
          0.7,
          Math.min(
            profile.provider === "elevenlabs" ? 1.2 : 1.3,
            profile.speed * (direction?.speedMultiplier ?? 1),
          ),
        ),
        ...(profile.provider === "elevenlabs" && profile.providerSettings
          ? { providerSettings: elevenLabsVoiceSettingsInput.parse(profile.providerSettings) }
          : {}),
        ...(profile.transform ? { transform: profile.transform } : {}),
      });
      const bytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: mime || "audio/mpeg" });
      const clip = await decodeClip(key, blob, true);
      cache.set(key, clip);
      void persistBlob(key, blob);
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

/** Falas cuja versão exata ainda não está em cache. */
export function missingSpeakingMessages(project: ChatSceneProject) {
  return speakingMessages(project).filter(({ message, text }) => {
    const resolved = effectiveVoice(project, message);
    return resolved ? !hasCachedClip(voiceKey(text, resolved.profile, resolved.direction)) : false;
  });
}

/**
 * Gera (ou reaproveita) a fala de todas as mensagens. Em lotes pequenos, para
 * não sobrecarregar o provedor nem travar a interface.
 */
export async function generateCast(
  project: ChatSceneProject,
  provider: VoiceProvider,
  options: {
    batch?: number;
    maxAttempts?: number;
    onProgress?: (p: CastProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<CastResult> {
  const items = speakingMessages(project);
  const batch = Math.max(1, options.batch ?? 3);
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
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
          let clip = hit;
          let lastError: unknown;
          for (let attempt = 0; !clip && attempt < maxAttempts; attempt += 1) {
            try {
              clip = await provider.synthesize(text, profile, direction, options.signal);
            } catch (error) {
              lastError = error;
              if (attempt + 1 < maxAttempts)
                await new Promise((resolve) => setTimeout(resolve, 350 * 2 ** attempt));
            }
          }
          if (!clip) throw lastError ?? new Error("falhou");
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
