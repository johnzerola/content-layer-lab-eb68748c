import { encodeStereoWav } from "@/lib/audio-wav";
import { createStemAsset, summarizeWaveform, type WaveformAnalysis } from "./audio";
import { asProjectTime, type AudioSourceGroup, type Clip, type MediaAsset } from "./types";

export const LOCAL_AUDIO_EXTRACTION_LIMITS = {
  maxBytes: 128 * 1024 * 1024,
  maxDuration: 180,
  maxChannels: 2,
} as const;

export interface ExtractedAudioResult {
  wav: Blob;
  duration: number;
  sampleRate: number;
  channels: number;
  peaks: number[];
  rms: number;
  peak: number;
}

export interface ExtractAudioOptions {
  signal?: AbortSignal;
  onStage?: (stage: "reading" | "decoding" | "encoding") => void;
  maxBytes?: number;
  maxDuration?: number;
  waveformBuckets?: number;
  sourceIn?: number;
  sourceOut?: number;
}

export const AUDIO_SEPARATION_SAMPLE_RATE = 44_100;

function groupOwnsVideoClip(group: AudioSourceGroup, clip: Clip, sourceAssetId: string) {
  return clip.assetId === sourceAssetId
    && (group.sourceVideoClipId === clip.id || clip.audioGroupId === group.id);
}

/**
 * Produces the strict PCM WAV accepted by the separation service without
 * replacing the editor's original extracted asset. Camera and phone audio is
 * commonly 48 kHz, while the current Demucs worker contract is 44.1 kHz.
 */
export async function prepareAudioForSeparation(
  file: Blob,
  options: Pick<ExtractAudioOptions, "signal" | "maxDuration"> & { targetSampleRate?: 44_100 | 48_000 } = {},
): Promise<Blob> {
  options.signal?.throwIfAborted();
  const AudioCtx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Error("Este navegador não oferece decodificação de áudio local.");
  const context = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error("Não foi possível preparar o áudio para separar diálogo e música.");
  } finally {
    await context.close();
  }
  options.signal?.throwIfAborted();
  const maxDuration = options.maxDuration ?? LOCAL_AUDIO_EXTRACTION_LIMITS.maxDuration;
  const targetSampleRate = options.targetSampleRate ?? AUDIO_SEPARATION_SAMPLE_RATE;
  if (!Number.isFinite(decoded.duration) || decoded.duration <= 0)
    throw new Error("A mídia não contém uma faixa de áudio utilizável.");
  if (decoded.duration > maxDuration)
    throw new Error(`Separe um trecho de até ${maxDuration} segundos por vez.`);
  const channelCount = Math.min(
    LOCAL_AUDIO_EXTRACTION_LIMITS.maxChannels,
    decoded.numberOfChannels,
  );
  if (channelCount < 1) throw new Error("A mídia não contém canais de áudio.");

  if (decoded.sampleRate === targetSampleRate) {
    return encodeStereoWav(
      Array.from({ length: channelCount }, (_, index) => decoded.getChannelData(index).slice()),
      targetSampleRate,
    );
  }

  const OfflineCtx =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  if (!OfflineCtx)
    throw new Error("Este navegador não oferece conversão de áudio para 44.100 Hz.");
  const resampleContext = new OfflineCtx(
    channelCount,
    Math.ceil(decoded.duration * targetSampleRate),
    targetSampleRate,
  );
  const source = resampleContext.createBufferSource();
  source.buffer = decoded;
  source.connect(resampleContext.destination);
  source.start();
  const resampled = await resampleContext.startRendering();
  options.signal?.throwIfAborted();
  return encodeStereoWav(
    Array.from({ length: channelCount }, (_, index) => resampled.getChannelData(index)),
    targetSampleRate,
  );
}

export async function extractAudioFromMediaFile(file: File, options: ExtractAudioOptions = {}): Promise<ExtractedAudioResult> {
  const maxBytes = options.maxBytes ?? LOCAL_AUDIO_EXTRACTION_LIMITS.maxBytes;
  const maxDuration = options.maxDuration ?? LOCAL_AUDIO_EXTRACTION_LIMITS.maxDuration;
  if (file.size > maxBytes) throw new Error(`A extração local aceita até ${Math.round(maxBytes / 1024 / 1024)} MB nesta fase.`);
  options.signal?.throwIfAborted();
  options.onStage?.("reading");
  const bytes = await file.arrayBuffer();
  options.signal?.throwIfAborted();
  options.onStage?.("decoding");
  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Error("Este navegador não oferece decodificação de áudio local.");
  const context = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(bytes);
  } catch {
    throw new Error("Não foi possível ler o áudio. Tente MP4 com AAC, WAV, MP3 ou extração no servidor.");
  } finally {
    await context.close();
  }
  options.signal?.throwIfAborted();
  if (!Number.isFinite(decoded.duration) || decoded.duration <= 0) throw new Error("A mídia não contém uma faixa de áudio utilizável.");
  const sourceIn = Math.max(0, options.sourceIn ?? 0);
  const sourceOut = Math.min(decoded.duration, options.sourceOut ?? decoded.duration);
  if (!Number.isFinite(sourceIn) || !Number.isFinite(sourceOut) || sourceOut <= sourceIn)
    throw new Error("O intervalo de áudio selecionado é inválido.");
  const selectedDuration = sourceOut - sourceIn;
  if (selectedDuration > maxDuration) throw new Error(`Extraia um trecho de até ${maxDuration} segundos nesta fase.`);
  const channelCount = Math.min(LOCAL_AUDIO_EXTRACTION_LIMITS.maxChannels, decoded.numberOfChannels);
  if (channelCount < 1) throw new Error("A mídia não contém canais de áudio.");
  options.onStage?.("encoding");
  const startFrame = Math.floor(sourceIn * decoded.sampleRate);
  const endFrame = Math.min(decoded.length, Math.ceil(sourceOut * decoded.sampleRate));
  const channels = Array.from({ length: channelCount }, (_, index) => decoded.getChannelData(index).slice(startFrame, endFrame));
  const summary = summarizeWaveform(channels, options.waveformBuckets ?? 180);
  const wav = encodeStereoWav(channels, decoded.sampleRate);
  options.signal?.throwIfAborted();
  return { wav, duration: selectedDuration, sampleRate: decoded.sampleRate, channels: channelCount, ...summary };
}

export function buildExtractedAudioMedia(input: {
  sourceAsset: MediaAsset;
  sourceClip: Clip;
  group: AudioSourceGroup;
  result: ExtractedAudioResult;
  revision: number;
}): { asset: MediaAsset; clip: Clip; group: AudioSourceGroup } {
  const { sourceAsset, sourceClip, result } = input;
  if (sourceAsset.kind !== "video" || sourceClip.kind !== "video" || sourceClip.assetId !== sourceAsset.id) throw new Error("Selecione um clipe de vídeo válido.");
  if (input.group.sourceAssetId !== sourceAsset.id || !groupOwnsVideoClip(input.group, sourceClip, sourceAsset.id)) throw new Error("O grupo de áudio não pertence ao vídeo selecionado.");
  const revision = Math.max(1, Math.floor(input.revision));
  const id = `${sourceAsset.id}-audio-s${input.group.sourceStreamIndex}-r${revision}`;
  const asset: MediaAsset = {
    id,
    kind: "audio",
    name: `${sourceAsset.name} · Áudio original`,
    mimeType: "audio/wav",
    storagePath: `local-session://${id}`,
    duration: result.duration,
    hash: `${id}.wav:${result.wav.size}:0`,
    sourceAudio: {
      sourceAssetId: sourceAsset.id,
      streamIndex: input.group.sourceStreamIndex,
      sourceIn: sourceClip.sourceIn,
      sourceOut: sourceClip.sourceOut,
    },
    audioAnalysis: { cacheKey: `${id}:${result.sampleRate}:${result.channels}:180`, status: "ready", sampleRate: result.sampleRate, channels: result.channels, peaks: result.peaks },
    license: structuredClone(sourceAsset.license),
  };
  const clip: Clip = {
    id: `clip-${id}`,
    kind: "audio",
    trackId: "track-voice",
    assetId: asset.id,
    audioGroupId: input.group.id,
    name: "Áudio original",
    projectStart: asProjectTime(Number(sourceClip.projectStart)),
    projectEnd: asProjectTime(Number(sourceClip.projectEnd)),
    // The WAV contains only the selected source interval, so its own clock
    // starts at zero even when the video was trimmed from the middle.
    sourceIn: 0,
    sourceOut: result.duration,
    playbackRate: sourceClip.playbackRate,
    enabled: true,
    effects: [],
    animations: [],
    audio: { gain: 1, muted: false, fadeIn: 0, fadeOut: 0, loop: false, stemRole: "original", envelope: [] },
    metadata: {
      derivedFromClipId: sourceClip.id,
      extractionRevision: revision,
      rebasedSource: true,
      sourceRangeIn: sourceClip.sourceIn,
      sourceRangeOut: sourceClip.sourceOut,
    },
  };
  return {
    asset,
    clip,
    group: { ...structuredClone(input.group), originalAudioAssetId: asset.id, extractedClipId: clip.id, activeRepresentation: "extracted", sourceRevision: revision },
  };
}

export function buildSeparatedAudioMedia(input: {
  sourceAsset: MediaAsset;
  sourceClip: Clip;
  group: AudioSourceGroup;
  duration: number;
  revision: number;
  dialogue: { storagePath: string; mimeType?: string; hash: string; analysis: WaveformAnalysis };
  music: { storagePath: string; mimeType?: string; hash: string; analysis: WaveformAnalysis };
  jobId?: string;
  engine?: string;
  model?: string;
}): { dialogueAsset: MediaAsset; musicAsset: MediaAsset; dialogueClip: Clip; musicClip: Clip } {
  const { sourceAsset, sourceClip, group } = input;
  if (sourceAsset.kind !== "video" || sourceClip.kind !== "video" || sourceClip.assetId !== sourceAsset.id) throw new Error("Selecione um clipe de vídeo válido.");
  if (group.sourceAssetId !== sourceAsset.id || !groupOwnsVideoClip(group, sourceClip, sourceAsset.id)) throw new Error("O grupo de áudio não pertence ao vídeo selecionado.");
  if (!Number.isFinite(input.duration) || input.duration <= 0) throw new Error("As trilhas separadas têm duração inválida.");
  const revision = Math.max(1, Math.floor(input.revision));
  const createAsset = (role: "voice" | "music", data: typeof input.dialogue) => {
    const asset = createStemAsset(sourceAsset, role, revision, data.storagePath);
    asset.mimeType = data.mimeType ?? "audio/wav";
    asset.name = role === "voice" ? `${sourceAsset.name} · Diálogo` : `${sourceAsset.name} · Música e ambiente`;
    asset.duration = input.duration;
    asset.hash = data.hash;
    asset.audioAnalysis = {
      cacheKey: data.analysis.cacheKey,
      status: "ready",
      sampleRate: data.analysis.sampleRate,
      channels: data.analysis.channels,
      durationMs: data.analysis.durationMs,
      peaks: data.analysis.peaks,
    };
    asset.stem = {
      ...asset.stem!,
      status: "ready",
      ...(input.jobId ? { jobId: input.jobId } : {}),
      ...(input.engine ? { engine: input.engine } : {}),
      ...(input.model ? { model: input.model } : {}),
    };
    return asset;
  };
  const dialogueAsset = createAsset("voice", input.dialogue);
  const musicAsset = createAsset("music", input.music);
  const createClip = (role: "voice" | "music", asset: MediaAsset, trackId: "track-voice" | "track-music"): Clip => ({
    id: `clip-${asset.id}`,
    kind: "audio",
    trackId,
    assetId: asset.id,
    audioGroupId: group.id,
    name: role === "voice" ? "Diálogo" : "Música e ambiente",
    projectStart: asProjectTime(Number(sourceClip.projectStart)),
    projectEnd: asProjectTime(Number(sourceClip.projectEnd)),
    // Worker stems are returned for the cropped upload and therefore also
    // start at zero. Keeping the video's old source offset here skips audio.
    sourceIn: 0,
    sourceOut: input.duration,
    playbackRate: sourceClip.playbackRate,
    enabled: true,
    effects: [],
    animations: [],
    audio: {
      gain: sourceClip.audio?.gain ?? 1,
      muted: false,
      fadeIn: sourceClip.audio?.fadeIn ?? 0,
      fadeOut: sourceClip.audio?.fadeOut ?? 0,
      loop: false,
      stemRole: role,
      envelope: [],
    },
    metadata: {
      derivedFromClipId: sourceClip.id,
      separationRevision: revision,
      rebasedSource: true,
      sourceRangeIn: sourceClip.sourceIn,
      sourceRangeOut: sourceClip.sourceOut,
    },
  });
  return {
    dialogueAsset,
    musicAsset,
    dialogueClip: createClip("voice", dialogueAsset, "track-voice"),
    musicClip: createClip("music", musicAsset, "track-music"),
  };
}
