/**
 * Edge-safe adapter for the private ChatScene voice service.
 *
 * Keep this module free of node:fs, node:child_process, FFmpeg and Buffer so a
 * published Nitro/Cloudflare build can still reach the remote GPU service.
 * The local Chatterbox worker remains in voice-clone.server.ts and is loaded
 * only when a Node runtime explicitly has a local voice configuration.
 */

export interface RemoteVoiceEngineStatus {
  installed: boolean;
  genericInstalled?: boolean;
  piperVoices?: string[];
  catalogLicenseApproved?: boolean;
  catalogVoices?: Array<string | { id: string; name?: string }>;
  pitchTransform?: boolean;
  device: string;
  modelLoaded: boolean;
  warming: boolean;
}

interface RemoteVoiceServiceConfig {
  baseUrl: string;
  secret: string;
}

function remoteVoiceServiceConfig(): RemoteVoiceServiceConfig | null {
  const configuredUrl =
    process.env["CHATSCENE_VOICE_SERVICE_URL"] ??
    process.env["CLEANER_WORKER_PUBLIC_URL"] ??
    process.env["CLEANER_WORKER_URL"];
  const secret =
    process.env["CHATSCENE_VOICE_SERVICE_SECRET"] ?? process.env["CLEANER_WORKER_SECRET"];
  if (!configuredUrl || !secret || secret.length < 32) return null;
  const baseUrl = configuredUrl.replace(/\/+$/, "");
  if (!/^https:\/\//i.test(baseUrl) && process.env["NODE_ENV"] === "production") return null;
  return { baseUrl: `${baseUrl}/v1/voice`, secret };
}

export function remoteVoiceServiceConfigured() {
  return remoteVoiceServiceConfig() !== null;
}

async function remoteVoiceRequest<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 30_000,
): Promise<T> {
  const config = remoteVoiceServiceConfig();
  if (!config) throw new Error("O serviço seguro de clonagem não está configurado.");
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.secret}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const result = (await response.json().catch(() => null)) as (T & { detail?: string }) | null;
  if (!response.ok) {
    throw new Error(result?.detail || "O serviço de clonagem não conseguiu concluir a operação.");
  }
  if (!result) throw new Error("O serviço de clonagem retornou uma resposta inválida.");
  return result;
}

export async function remoteCloneEngineStatus(): Promise<RemoteVoiceEngineStatus | null> {
  if (!remoteVoiceServiceConfigured()) return null;
  try {
    return await remoteVoiceRequest<RemoteVoiceEngineStatus>("/health", {}, 5_000);
  } catch {
    return {
      installed: false,
      device: "remote-unavailable",
      modelLoaded: false,
      warming: false,
    };
  }
}

export async function warmRemoteCloneEngine() {
  return await remoteVoiceRequest<{ warming: boolean }>(
    "/warm",
    { method: "POST", body: "{}" },
    10_000,
  );
}

export async function saveRemoteVoiceReference(userId: string, audioBase64: string) {
  return await remoteVoiceRequest<{ id: string; durationSec: number }>("/references", {
    method: "POST",
    body: JSON.stringify({ userId, audio: audioBase64 }),
  });
}

export async function deleteRemoteVoiceReference(userId: string, id: string) {
  await remoteVoiceRequest<{ removed: boolean }>("/references", {
    method: "DELETE",
    body: JSON.stringify({ userId, referenceId: id }),
  });
}

export async function synthesizeRemoteVoice(userId: string, referenceId: string, text: string) {
  const result = await remoteVoiceRequest<{ audio: string; device: string }>(
    "/synthesize",
    {
      method: "POST",
      body: JSON.stringify({ userId, referenceId, text }),
    },
    300_000,
  );
  return result.audio;
}

export async function synthesizeRemoteGenericVoice(text: string, speed = 1, voice = "pt_BR-faber-medium") {
  const result = await remoteVoiceRequest<{ audio: string; device: string }>(
    "/generic",
    {
      method: "POST",
      body: JSON.stringify({ text, speed, voice }),
    },
    90_000,
  );
  return result.audio;
}

export async function synthesizeRemoteCatalogVoice(text: string, speed = 1, voice: string) {
  const result = await remoteVoiceRequest<{ audio: string; device: string }>(
    "/catalog/synthesize",
    {
      method: "POST",
      body: JSON.stringify({ text, speed, voice }),
    },
    300_000,
  );
  return result.audio;
}

let transformCapability: { value: boolean; expiresAt: number } | null = null;
export async function remoteVoiceTransformSupported(): Promise<boolean> {
  if (!remoteVoiceServiceConfigured()) return false;
  if (transformCapability && transformCapability.expiresAt > Date.now()) return transformCapability.value;
  const status = await remoteCloneEngineStatus();
  const value = status?.pitchTransform === true;
  transformCapability = { value, expiresAt: Date.now() + 15_000 };
  return value;
}

export async function transformRemoteVoice(audio: string, config: {
  mode: string;
  speedMultiplier: number;
  pitchSemitones: number;
  linkedPitchToSpeed: boolean;
  effect?: "none" | "radio" | "telephone" | "megaphone" | "robot" | "cave" | "horror";
  normalization: { enabled: boolean };
}) {
  return remoteVoiceRequest<{ audio: string; mime: string }>(
    "/transform",
    { method: "POST", body: JSON.stringify({ audio, config }) },
    90_000,
  );
}
