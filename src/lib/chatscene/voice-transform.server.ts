import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import ffmpegStaticPath from "ffmpeg-static";
import {
  VOICE_TRANSFORM_ENGINE_VERSION,
  buildAtempoChain,
  effectiveTransformPitch,
  semitonesToRatio,
  validateVoiceTransformConfig,
  type VoiceTransformConfig,
} from "./voice-transform";

export interface VoiceAudioAnalysis {
  durationSec: number;
  sampleRate: number;
  channels: number;
  peakDb: number | null;
  meanVolumeDb: number | null;
}

export interface VoiceTransformCapabilities {
  engine: "FFMPEG_BASELINE";
  engineVersion: string;
  ffmpegVersion: string;
  platform: NodeJS.Platform;
  filters: string[];
  preserveFormants: false;
  outputCodecs: ["mp3"];
}

export interface VoiceTransformResult {
  audio: Buffer;
  mime: "audio/mpeg";
  cacheKey: string;
  cacheHit: boolean;
  sourceAudioHash: string;
  source: VoiceAudioAnalysis;
  output: VoiceAudioAnalysis;
  effectivePitchSemitones: number;
  processingMs: number;
}

type ProcessResult = { stdout: Buffer; stderr: string };

const transformCache = new Map<string, Omit<VoiceTransformResult, "cacheHit" | "processingMs">>();
const MAX_CACHE_ENTRIES = 64;
let capabilitiesPromise: Promise<VoiceTransformCapabilities> | null = null;

function ffmpegPath(): string {
  const configured = process.env["FFMPEG_PATH"]?.trim();
  const resolved = configured || ffmpegStaticPath;
  if (!resolved) throw new Error("FFmpeg não está disponível no servidor. Configure FFMPEG_PATH.");
  return resolved;
}

function runFfmpeg(args: string[], input?: Buffer): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { shell: false, windowsHide: true });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > 64 * 1024 * 1024) {
        child.kill();
        reject(new Error("A saída de áudio excedeu o limite seguro de 64 MB."));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const detail = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) {
        reject(new Error(`FFmpeg encerrou com código ${code}: ${detail.slice(-1200)}`));
        return;
      }
      resolve({ stdout: Buffer.concat(stdout), stderr: detail });
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

function parseDuration(stderr: string): number {
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (match) return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  const progress = [...stderr.matchAll(/out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)].at(-1);
  if (!progress) return 0;
  return Number(progress[1]) * 3600 + Number(progress[2]) * 60 + Number(progress[3]);
}

function parseStream(stderr: string): Pick<VoiceAudioAnalysis, "sampleRate" | "channels"> {
  const audioLine = stderr.split(/\r?\n/).find((line) => line.includes("Audio:")) ?? "";
  const sampleRate = Number(audioLine.match(/(\d+)\s*Hz/)?.[1] ?? 0);
  const channels = /\bmono\b/i.test(audioLine)
    ? 1
    : /\bstereo\b/i.test(audioLine)
      ? 2
      : Number(audioLine.match(/(\d+)\s*channels?/i)?.[1] ?? 0);
  return { sampleRate, channels };
}

async function probeAudio(audio: Buffer, volume = false): Promise<VoiceAudioAnalysis> {
  const args = ["-hide_banner", "-i", "pipe:0", "-vn"];
  if (volume) args.push("-af", "volumedetect");
  args.push("-f", "null", "-", "-progress", "pipe:2", "-nostats");
  const { stderr } = await runFfmpeg(args, audio);
  const stream = parseStream(stderr);
  const peak = stderr.match(/max_volume:\s*(-?(?:\d+(?:\.\d+)?|inf))\s*dB/i)?.[1];
  const mean = stderr.match(/mean_volume:\s*(-?(?:\d+(?:\.\d+)?|inf))\s*dB/i)?.[1];
  const toMetric = (value: string | undefined) => value && value !== "-inf" ? Number(value) : null;
  return {
    durationSec: parseDuration(stderr),
    sampleRate: stream.sampleRate,
    channels: stream.channels,
    peakDb: toMetric(peak),
    meanVolumeDb: toMetric(mean),
  };
}

function atempoFilters(multiplier: number): string[] {
  return buildAtempoChain(multiplier).map((stage) => `atempo=${stage}`);
}

function effectFilters(effect: VoiceTransformConfig["effect"]): string[] {
  switch (effect) {
    case "radio":
      return ["highpass=f=220", "lowpass=f=3800", "acompressor=threshold=-18dB:ratio=4:attack=5:release=80"];
    case "telephone":
      return ["highpass=f=450", "lowpass=f=3200", "acompressor=threshold=-20dB:ratio=6:attack=3:release=60"];
    case "megaphone":
      return ["highpass=f=500", "lowpass=f=5200", "acompressor=threshold=-16dB:ratio=5:attack=3:release=80", "volume=1.35"];
    case "robot":
      return ["aecho=0.8:0.88:40:0.4"];
    case "cave":
      return ["aecho=0.8:0.9:90:0.35"];
    case "horror":
      return ["highpass=f=70", "lowpass=f=8500", "aecho=0.8:0.88:70:0.4"];
    case "none":
    default:
      return [];
  }
}

/** Build a single decode → PCM filters → final encode graph. */
export function buildVoiceTransformFilters(configInput: VoiceTransformConfig, sampleRate: number): string[] {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error("A taxa de amostragem da origem é inválida.");
  const config = validateVoiceTransformConfig(configInput);
  const speed = config.speedMultiplier;
  const pitchRatio = semitonesToRatio(effectiveTransformPitch(config));
  const filters: string[] = [];
  const addPitchStage = (ratio: number) => {
    filters.push(`asetrate=${Math.max(1, Math.round(sampleRate * ratio))}`);
    filters.push(`aresample=${sampleRate}`);
  };

  switch (config.mode) {
    case "VARISPEED":
      addPitchStage(pitchRatio);
      break;
    case "TEMPO_ONLY":
      filters.push(...atempoFilters(speed));
      break;
    case "PITCH_ONLY":
      addPitchStage(pitchRatio);
      filters.push(...atempoFilters(1 / pitchRatio));
      break;
    case "SPEED_AND_PITCH":
      addPitchStage(pitchRatio);
      filters.push(...atempoFilters(speed / pitchRatio));
      break;
    case "VARISPEED_THEN_RESTORE_TEMPO":
      addPitchStage(pitchRatio);
      filters.push(...atempoFilters(1 / pitchRatio));
      break;
  }

  filters.push(...effectFilters(config.effect));
  if (config.normalization.enabled) {
    filters.push(
      `loudnorm=I=${config.normalization.integratedLufs}:TP=${config.normalization.truePeakDb}:LRA=${config.normalization.loudnessRange}`,
    );
  }
  return filters;
}

function cacheKey(sourceAudioHash: string, presetId: string, config: VoiceTransformConfig): string {
  const normalizationConfig = config.normalization;
  return createHash("sha256").update(JSON.stringify({
    sourceAudioHash,
    transformEngineVersion: VOICE_TRANSFORM_ENGINE_VERSION,
    presetId,
    speedMultiplier: config.speedMultiplier,
    pitchSemitones: config.pitchSemitones,
    linkedPitch: config.linkedPitchToSpeed,
    preservePitch: config.preservePitch,
    preserveFormants: config.preserveFormants,
    effect: config.effect,
    normalizationConfig,
    mode: config.mode,
    outputCodec: config.outputCodec,
  })).digest("hex");
}

export class VoiceTransformEngine {
  async getCapabilities(): Promise<VoiceTransformCapabilities> {
    capabilitiesPromise ??= (async () => {
      const [{ stdout: versionOut }, { stdout: filtersOut }] = await Promise.all([
        runFfmpeg(["-version"]),
        runFfmpeg(["-hide_banner", "-filters"]),
      ]);
      const version = versionOut.toString("utf8").split(/\r?\n/)[0] ?? "unknown";
      const filtersText = filtersOut.toString("utf8");
      const required = ["asetrate", "atempo", "loudnorm", "volumedetect"];
      const filters = required.filter((name) => new RegExp(`\\b${name}\\b`).test(filtersText));
      const missing = required.filter((name) => !filters.includes(name));
      if (missing.length) throw new Error(`FFmpeg não oferece os filtros necessários: ${missing.join(", ")}.`);
      return {
        engine: "FFMPEG_BASELINE",
        engineVersion: VOICE_TRANSFORM_ENGINE_VERSION,
        ffmpegVersion: version,
        platform: process.platform,
        filters,
        preserveFormants: false,
        outputCodecs: ["mp3"],
      };
    })();
    return capabilitiesPromise;
  }

  analyze(inputAudio: Buffer): Promise<VoiceAudioAnalysis> {
    if (!inputAudio.length) throw new Error("O áudio de origem está vazio.");
    return probeAudio(inputAudio, true);
  }

  async transform(inputAudio: Buffer, configInput: VoiceTransformConfig, presetId = "custom"): Promise<VoiceTransformResult> {
    if (!inputAudio.length) throw new Error("O áudio de origem está vazio.");
    await this.getCapabilities();
    const startedAt = performance.now();
    const config = validateVoiceTransformConfig(configInput);
    const sourceAudioHash = createHash("sha256").update(inputAudio).digest("hex");
    const key = cacheKey(sourceAudioHash, presetId, config);
    const cached = transformCache.get(key);
    if (cached) return { ...cached, cacheHit: true, processingMs: Math.round(performance.now() - startedAt) };

    const source = await probeAudio(inputAudio);
    if (!source.sampleRate || !source.durationSec) throw new Error("Não foi possível medir o áudio de origem.");
    const filters = buildVoiceTransformFilters(config, source.sampleRate);
    const { stdout } = await runFfmpeg([
      "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-vn",
      "-af", filters.join(","),
      "-ar", String(source.sampleRate), "-c:a", "libmp3lame", "-q:a", "2", "-f", "mp3", "pipe:1",
    ], inputAudio);
    if (!stdout.length) throw new Error("FFmpeg produziu um arquivo de áudio vazio.");
    const output = await probeAudio(stdout, true);
    if (!output.durationSec || !output.sampleRate || !output.channels) throw new Error("O áudio transformado está malformado.");
    if (output.peakDb !== null && output.peakDb > 0.01) throw new Error("O áudio transformado apresentou clipping.");

    const stable = {
      audio: stdout,
      mime: "audio/mpeg" as const,
      cacheKey: key,
      sourceAudioHash,
      source,
      output,
      effectivePitchSemitones: effectiveTransformPitch(config),
    };
    if (transformCache.size >= MAX_CACHE_ENTRIES) transformCache.delete(transformCache.keys().next().value!);
    transformCache.set(key, stable);
    const processingMs = Math.round(performance.now() - startedAt);
    console.info("voice_transform", {
      engine: "FFMPEG_BASELINE",
      preset: presetId,
      sourceDuration: source.durationSec,
      outputDuration: output.durationSec,
      speed: config.speedMultiplier,
      pitchSemitones: stable.effectivePitchSemitones,
      processingMs,
      cacheHit: false,
    });
    return { ...stable, cacheHit: false, processingMs };
  }
}

export const voiceTransformEngine = new VoiceTransformEngine();
