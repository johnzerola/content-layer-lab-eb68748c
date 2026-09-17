import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_MODEL_NAME = "pt_BR-faber-medium.onnx";
const MAX_AUDIO_BYTES = 64 * 1024 * 1024;
const MAX_ERROR_BYTES = 64 * 1024;

export interface PiperLocalStatus {
  available: boolean;
  pythonPath: string;
  modelPath: string;
  configPath: string;
  sampleRate: number;
}

function localPaths(env: NodeJS.ProcessEnv = process.env) {
  const pythonPath = resolve(env["PIPER_PYTHON_PATH"] ?? (process.platform === "win32" ? "backend/.venv/Scripts/python.exe" : "backend/.venv/bin/python"));
  const modelPath = resolve(env["PIPER_MODEL_PATH"] ?? `backend/models/piper/${DEFAULT_MODEL_NAME}`);
  const configPath = resolve(env["PIPER_CONFIG_PATH"] ?? `${modelPath}.json`);
  return { pythonPath, modelPath, configPath };
}

function sampleRateFromConfig(configPath: string): number {
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as { audio?: { sample_rate?: unknown } };
    const value = Number(parsed.audio?.sample_rate);
    return Number.isFinite(value) && value >= 8_000 && value <= 192_000 ? value : 22_050;
  } catch {
    return 22_050;
  }
}

export function getPiperLocalStatus(env: NodeJS.ProcessEnv = process.env): PiperLocalStatus {
  const paths = localPaths(env);
  return { ...paths, sampleRate: sampleRateFromConfig(paths.configPath), available: existsSync(paths.pythonPath) && existsSync(paths.modelPath) && existsSync(paths.configPath) };
}

function pcm16MonoToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Local, generic PT-BR synthesis. Text is sent through stdin, never interpolated into a shell. */
export async function synthesizePiperWav(text: string, speed = 1): Promise<Buffer> {
  const status = getPiperLocalStatus();
  if (!status.available) throw new Error("A voz local Piper não está instalada neste servidor.");

  const safeSpeed = Math.max(0.7, Math.min(1.3, speed));
  const args = ["-m", "piper", "-m", status.modelPath, "-c", status.configPath, "--output-raw", "--length-scale", String(1 / safeSpeed)];

  return await new Promise<Buffer>((resolvePromise, reject) => {
    const child = spawn(status.pythonPath, args, { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const audio: Buffer[] = [];
    const errors: Buffer[] = [];
    let audioBytes = 0;
    let errorBytes = 0;
    let settled = false;
    const finishError = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const timer = setTimeout(() => {
      child.kill();
      finishError(new Error("A voz local demorou demais para responder."));
    }, 45_000);

    child.stdout.on("data", (chunk: Buffer) => {
      audioBytes += chunk.length;
      if (audioBytes > MAX_AUDIO_BYTES) {
        child.kill();
        finishError(new Error("A voz local gerou um áudio maior que o limite permitido."));
        return;
      }
      audio.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      errorBytes += chunk.length;
      if (errorBytes <= MAX_ERROR_BYTES) errors.push(chunk);
    });
    child.on("error", finishError);
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0 || audioBytes === 0) {
        const detail = Buffer.concat(errors).toString("utf8").trim();
        reject(new Error(detail ? `A voz local falhou: ${detail}` : "A voz local não produziu áudio."));
        return;
      }
      resolvePromise(pcm16MonoToWav(Buffer.concat(audio), status.sampleRate));
    });
    child.stdin.on("error", finishError);
    child.stdin.end(`${text.trim()}\n`, "utf8");
  });
}
