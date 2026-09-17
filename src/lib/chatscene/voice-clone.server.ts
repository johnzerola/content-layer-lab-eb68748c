import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createInterface } from "node:readline";
import ffmpegStaticPath from "ffmpeg-static";

export interface VoiceRuntimeConfig {
  pythonPath: string;
  modelPath: string;
  storagePath: string;
  device: "auto" | "cpu" | "cuda";
  ready?: boolean;
}
const requiredModelFiles = [
  "ve.pt",
  "s3gen.pt",
  "t3_mtl23ls_v2.safetensors",
  "grapheme_mtl_merged_expanded_v1.json",
];

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
export function voiceRuntimeConfig(): VoiceRuntimeConfig | null {
  try {
    const env = process.env;
    if (
      env["CHATSCENE_VOICE_PYTHON_PATH"] &&
      env["CHATSCENE_VOICE_MODEL_PATH"] &&
      env["CHATSCENE_VOICE_STORAGE_PATH"]
    ) {
      const requestedDevice = env["CHATSCENE_VOICE_DEVICE"] ?? "auto";
      const device =
        requestedDevice === "cpu" || requestedDevice === "cuda" || requestedDevice === "auto"
          ? requestedDevice
          : "auto";
      return {
        pythonPath: env["CHATSCENE_VOICE_PYTHON_PATH"],
        modelPath: env["CHATSCENE_VOICE_MODEL_PATH"],
        storagePath: env["CHATSCENE_VOICE_STORAGE_PATH"],
        device,
        ready: env["CHATSCENE_VOICE_READY"] === "true",
      };
    }
    const config = JSON.parse(
      readFileSync(
        resolve(
          process.env["CHATSCENE_VOICE_CONFIG"] ?? "backend/data/chatscene-voices/runtime.json",
        ),
        "utf8",
      ).replace(/^\uFEFF/, ""),
    ) as VoiceRuntimeConfig;
    return config.pythonPath && config.modelPath && config.storagePath ? config : null;
  } catch {
    return null;
  }
}
function localCloneEngineInstalled(config: VoiceRuntimeConfig | null) {
  return (
    !!config?.ready &&
    existsSync(config.pythonPath) &&
    requiredModelFiles.every((file) => existsSync(join(config.modelPath, file)))
  );
}
export function cloneEngineStatus() {
  const c = voiceRuntimeConfig();
  const remote =
    Boolean(remoteVoiceServiceConfig()) ||
    Boolean(process.env["CHATSCENE_GPU_RELAY_URL"] && process.env["CHATSCENE_GPU_RELAY_TOKEN"]);
  return {
    installed: remote || localCloneEngineInstalled(c),
    device: remote ? "remote-cuda" : (c?.device ?? "auto"),
    modelLoaded: workerReady,
    warming: ready !== null && !workerReady,
  };
}

export async function verifiedCloneEngineStatus() {
  if (!remoteVoiceServiceConfig()) return cloneEngineStatus();
  try {
    return await remoteVoiceRequest<{
      installed: boolean;
      device: string;
      modelLoaded: boolean;
      warming: boolean;
    }>("/health", {}, 5_000);
  } catch {
    return {
      installed: false,
      device: "remote-unavailable",
      modelLoaded: false,
      warming: false,
    };
  }
}

export async function warmCloneEngine() {
  if (remoteVoiceServiceConfig()) {
    return await remoteVoiceRequest<{ warming: boolean }>(
      "/warm",
      { method: "POST", body: "{}" },
      10_000,
    );
  }
  if (!cloneEngineStatus().installed) throw new Error("O motor de clonagem não está instalado.");
  void startWorker().catch((error) => {
    console.error("[ChatScene voice] falha ao preparar o modelo local", error);
  });
  return { warming: true };
}
function referenceDirectory(userId: string) {
  const config = voiceRuntimeConfig();
  if (!config)
    throw new Error("O motor de voz de referência ainda não está instalado neste servidor.");
  return join(resolve(config.storagePath), createHash("sha256").update(userId).digest("hex"));
}
export function referencePath(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Referência de voz inválida.");
  return join(referenceDirectory(userId), `${id}.wav`);
}

export async function saveVoiceReference(userId: string, audioBase64: string) {
  if (remoteVoiceServiceConfig()) {
    return await remoteVoiceRequest<{ id: string; durationSec: number }>("/references", {
      method: "POST",
      body: JSON.stringify({ userId, audio: audioBase64 }),
    });
  }
  if (!cloneEngineStatus().installed)
    throw new Error("Instale o motor de clonagem antes de enviar a referência.");
  const input = Buffer.from(audioBase64, "base64");
  if (input.length === 0 || input.length > 12 * 1024 * 1024)
    throw new Error("Envie um áudio de até 12 MB.");
  // Decode only local bytes. Playlists and remote protocols are not accepted.
  const pcm = await new Promise<Buffer>((accept, reject) => {
    const ffmpeg = process.env["FFMPEG_PATH"] || ffmpegStaticPath;
    if (!ffmpeg) {
      reject(new Error("FFmpeg indisponível."));
      return;
    }
    const child = spawn(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-protocol_whitelist",
        "pipe",
        "-i",
        "pipe:0",
        "-t",
        "30.1",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "24000",
        "-f",
        "s16le",
        "pipe:1",
      ],
      { windowsHide: true, shell: false },
    );
    const chunks: Buffer[] = [];
    let bytes = 0;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Não foi possível ler o áudio a tempo."));
    }, 20_000);
    child.stdout.on("data", (data: Buffer) => {
      bytes += data.length;
      if (bytes > 1_500_000) child.kill();
      else chunks.push(data);
    });
    child.stderr.resume();
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.stdin.on("error", () => {});
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error("Formato de áudio inválido. Envie WAV, MP3, M4A ou OGG."));
      else accept(Buffer.concat(chunks));
    });
    child.stdin.end(input);
  });
  const durationSec = pcm.length / 48000;
  if (durationSec < 3 || durationSec > 30)
    throw new Error("Use uma amostra com 3 a 30 segundos de fala limpa.");
  let power = 0;
  for (let i = 0; i < pcm.length; i += 2) power += (pcm.readInt16LE(i) / 32768) ** 2;
  if (Math.sqrt(power / (pcm.length / 2)) < 0.001)
    throw new Error("O áudio está silencioso. Envie uma amostra com fala audível.");
  const header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24);
  header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  const id = randomUUID();
  await mkdir(referenceDirectory(userId), { recursive: true });
  await writeFile(referencePath(userId, id), Buffer.concat([header, pcm]), {
    flag: "wx",
    mode: 0o600,
  });
  try {
    await writeFile(
      join(referenceDirectory(userId), `${id}.json`),
      JSON.stringify({
        authorized: true,
        authorizationVersion: "adult-own-or-written-1",
        createdAt: new Date().toISOString(),
        durationSec,
      }),
      { flag: "wx", mode: 0o600 },
    );
  } catch (error) {
    await rm(referencePath(userId, id), { force: true });
    throw error;
  }
  return { id, durationSec };
}
export async function deleteVoiceReference(userId: string, id: string) {
  if (remoteVoiceServiceConfig()) {
    await remoteVoiceRequest<{ removed: boolean }>("/references", {
      method: "DELETE",
      body: JSON.stringify({ userId, referenceId: id }),
    });
    return;
  }
  await rm(referencePath(userId, id), { force: true });
  await rm(join(referenceDirectory(userId), `${id}.json`), { force: true });
}

let worker: ChildProcessWithoutNullStreams | null = null;
let ready: Promise<void> | null = null;
let workerReady = false;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let queued = 0;
let queue: Promise<unknown> = Promise.resolve();
const pending = new Map<
  string,
  { resolve: (audio: Buffer) => void; reject: (error: Error) => void }
>();
function stopWorker() {
  worker?.kill();
  worker = null;
  ready = null;
  workerReady = false;
}
export function shutdownVoiceWorker() {
  if (queued !== 0) throw new Error("Ainda existem falas na fila.");
  clearTimeout(idleTimer);
  stopWorker();
}
async function startWorker() {
  if (ready) return ready;
  const config = voiceRuntimeConfig();
  if (!config || !cloneEngineStatus().installed)
    throw new Error("O motor de voz de referência não está instalado.");
  const child = spawn(
    config.pythonPath,
    [
      "-u",
      resolve("backend/chatscene_voice/worker.py"),
      resolve(
        process.env["CHATSCENE_VOICE_CONFIG"] ?? "backend/data/chatscene-voices/runtime.json",
      ),
    ],
    { windowsHide: true, shell: false, env: { ...process.env, HF_HUB_OFFLINE: "1" } },
  );
  worker = child;
  ready = new Promise<void>((accept, reject) => {
    child.stderr.resume();
    // Large checkpoints on an HDD/exFAT volume can take several minutes to map.
    // This is only the one-time worker startup; individual generations keep their
    // separate five-minute timeout below.
    const timer = setTimeout(() => {
      stopWorker();
      reject(
        new Error(
          "O carregamento do modelo demorou demais. Verifique o disco e a memória disponíveis.",
        ),
      );
    }, 600_000);
    const fail = () => {
      clearTimeout(timer);
      const error = new Error(
        "O motor local encerrou. Tente novamente e verifique a memória disponível.",
      );
      reject(error);
      if (worker === child) {
        for (const entry of pending.values()) entry.reject(error);
        pending.clear();
        worker = null;
        ready = null;
        workerReady = false;
      }
    };
    child.on("error", fail);
    child.on("exit", fail);
    child.stdin.on("error", fail);
    createInterface({ input: child.stdout }).on("line", (line) => {
      try {
        const message = JSON.parse(line);
        if (message.ready) {
          clearTimeout(timer);
          workerReady = true;
          accept();
          return;
        }
        if (message.error && pending.size === 0) {
          clearTimeout(timer);
          reject(new Error("O motor local não conseguiu carregar os pesos instalados."));
          if (worker === child) {
            worker = null;
            ready = null;
            workerReady = false;
          }
          child.kill();
          return;
        }
        const entry = pending.get(message.id);
        if (!entry) return;
        pending.delete(message.id);
        if (message.error) entry.reject(new Error(message.error));
        else {
          console.info("[ChatScene voice]", {
            device: message.device,
            processingMs: message.processingMs,
            durationSec: message.durationSec,
            peakVramMb: message.peakVramMb,
          });
          entry.resolve(Buffer.from(message.audio, "base64"));
        }
      } catch {
        /* library log, never a protocol response */
      }
    });
  });
  return ready;
}
export async function synthesizeClonedVoice(
  userId: string,
  referenceId: string,
  text: string,
): Promise<Buffer> {
  if (remoteVoiceServiceConfig()) {
    const result = await remoteVoiceRequest<{ audio: string; device: string }>(
      "/synthesize",
      {
        method: "POST",
        body: JSON.stringify({ userId, referenceId, text }),
      },
      300_000,
    );
    return Buffer.from(result.audio, "base64");
  }
  const path = referencePath(userId, referenceId);
  const reference = await readFile(path).catch(() => {
    throw new Error("Voice reference is unavailable for this account.");
  });
  const relayUrl = process.env["CHATSCENE_GPU_RELAY_URL"]?.replace(/\/$/, "");
  const relayToken = process.env["CHATSCENE_GPU_RELAY_TOKEN"];
  if (relayUrl && relayToken) {
    try {
      const response = await fetch(`${relayUrl}/synthesize`, {
        method: "POST",
        headers: { Authorization: `Bearer ${relayToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text, referenceAudio: reference.toString("base64") }),
        signal: AbortSignal.timeout(300_000),
      });
      if (!response.ok) throw new Error("O relay da GPU não conseguiu gerar a fala.");
      const message = (await response.json()) as { audio?: string };
      if (!message.audio) throw new Error("O relay da GPU retornou uma resposta inválida.");
      return Buffer.from(message.audio, "base64");
    } catch (error) {
      if (!localCloneEngineInstalled(voiceRuntimeConfig())) throw error;
      console.warn("[ChatScene voice] relay CUDA indisponivel; usando fallback local", {
        fallback: "cpu",
      });
    }
  }
  if (queued >= 8) throw new Error("A fila de vozes está cheia. Aguarde as gerações em andamento.");
  queued++;
  clearTimeout(idleTimer);
  const task = queue
    .catch(() => {})
    .then(async () => {
      await startWorker();
      const id = randomUUID();
      return await new Promise<Buffer>((accept, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          stopWorker();
          reject(new Error("A geração excedeu 5 minutos. Reduza o texto ou utilize GPU."));
        }, 300_000);
        pending.set(id, {
          resolve: (audio) => {
            clearTimeout(timer);
            accept(audio);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        });
        worker!.stdin.write(JSON.stringify({ id, text, referencePath: path }) + "\n");
      });
    });
  queue = task;
  try {
    return await task;
  } finally {
    queued--;
    if (queued === 0) idleTimer = setTimeout(stopWorker, 120_000);
  }
}
