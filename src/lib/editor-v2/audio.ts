import type { AudioEnvelopePoint, AudioRepresentation, Clip, EditorProjectV2, MediaAsset } from "./types";

export interface WaveformAnalysis {
  cacheKey: string;
  peaks: number[];
  rms: number;
  peak: number;
  sampleRate: number;
  channels: number;
  duration: number;
  durationMs: number;
}

export interface ResolvedAudioLayer {
  clipId: string;
  assetId: string;
  audioGroupId?: string;
  representation: AudioRepresentation | "independent";
  sourceKind: "embedded" | "asset";
  sourceTime: number;
  playbackRate: number;
  gain: number;
  muted: boolean;
  role: "original" | "voice" | "music" | "sfx";
}

const waveformCache = new Map<string, WaveformAnalysis>();

export function envelopeGainAt(points: AudioEnvelopePoint[], localTime: number): number {
  if (!points.length) return 1;
  const ordered = [...points].sort((a, b) => Number(a.time) - Number(b.time));
  if (localTime <= Number(ordered[0]!.time)) return ordered[0]!.gain;
  if (localTime >= Number(ordered.at(-1)!.time)) return ordered.at(-1)!.gain;
  const rightIndex = ordered.findIndex((point) => Number(point.time) >= localTime);
  const left = ordered[rightIndex - 1]!;
  const right = ordered[rightIndex]!;
  const progress = (localTime - Number(left.time)) / Math.max(1e-6, Number(right.time) - Number(left.time));
  return left.gain + (right.gain - left.gain) * progress;
}

export function clipAudioGainAt(clip: Clip, projectTime: number): number {
  if (!clip.audio || clip.audio.muted) return 0;
  const local = Math.max(0, projectTime - Number(clip.projectStart));
  const duration = Number(clip.projectEnd) - Number(clip.projectStart);
  const fadeIn = clip.audio.fadeIn > 0 ? Math.min(1, local / clip.audio.fadeIn) : 1;
  const fadeOut = clip.audio.fadeOut > 0 ? Math.min(1, Math.max(0, duration - local) / clip.audio.fadeOut) : 1;
  return Math.max(0, Math.min(2, clip.audio.gain)) * envelopeGainAt(clip.audio.envelope, local) * fadeIn * fadeOut;
}

export function resolveAudioMixFrame(project: EditorProjectV2, projectTime: number): ResolvedAudioLayer[] {
  const groups = project.audioGroups ?? [];
  const explicit = project.tracks
    .filter((track) => track.kind === "voice" || track.kind === "music" || track.kind === "sfx")
    .flatMap((track) => track.clips.map((clip) => ({ track, clip, group: groupForClip(groups, clip.id, clip.audioGroupId) })))
    .filter(({ clip, group }) => clip.kind === "audio" && clip.enabled && isActiveAt(clip, projectTime) && isSelectedRepresentation(group, clip.id));

  const embedded = groups.flatMap((group) => {
    if (group.activeRepresentation !== "embedded" || !group.sourceVideoClipId) return [];
    const owner = project.tracks.find((candidate) => candidate.clips.some((clip) => clip.id === group.sourceVideoClipId));
    const clip = owner?.clips.find((candidate) => candidate.id === group.sourceVideoClipId);
    if (!owner || !clip?.assetId || !clip.enabled || !isActiveAt(clip, projectTime)) return [];
    return [{ track: owner, clip, group }];
  });

  const active = [...explicit, ...embedded];
  const sourceTracks = new Set(active.map(({ track }) => track.id));
  const soloActive = project.tracks.some((track) => sourceTracks.has(track.id) && track.solo);
  const voiceActive = explicit.some(({ track, clip }) => (clip.audio?.stemRole === "voice" || track.kind === "voice") && !track.muted && (!soloActive || track.solo) && clipAudioGainAt(clip, projectTime) > 0);
  return active.filter(({ clip }) => Boolean(clip.assetId)).map(({ track, clip, group }) => {
    const role = clip.audio?.stemRole ?? (track.kind === "voice" ? "voice" : track.kind === "sfx" ? "sfx" : "music");
    const muted = track.muted || (soloActive && !track.solo) || Boolean(clip.audio?.muted);
    const duck = project.settings.audio.duckingEnabled && voiceActive && role === "music" ? 1 - project.settings.audio.duckAmount : 1;
    const clipGain = clip.audio ? clipAudioGainAt(clip, projectTime) : 1;
    const gain = muted ? 0 : Math.max(0, Math.min(2, track.gain * clipGain * project.settings.audio.masterGain * duck));
    return {
      clipId: clip.id,
      assetId: clip.assetId!,
      ...(group ? { audioGroupId: group.id } : {}),
      representation: group?.activeRepresentation ?? "independent",
      sourceKind: group?.activeRepresentation === "embedded" ? "embedded" : "asset",
      sourceTime: clip.sourceIn + (projectTime - Number(clip.projectStart)) * clip.playbackRate,
      playbackRate: clip.playbackRate,
      gain,
      muted: gain <= 0,
      role: group?.activeRepresentation === "embedded" ? "original" : role,
    };
  });
}

function isActiveAt(clip: Clip, projectTime: number) {
  return projectTime >= Number(clip.projectStart) && projectTime < Number(clip.projectEnd);
}

function groupForClip(groups: EditorProjectV2["audioGroups"], clipId: string, audioGroupId?: string) {
  return groups.find((group) => group.id === audioGroupId || group.extractedClipId === clipId || group.dialogueClipId === clipId || group.musicClipId === clipId);
}

function isSelectedRepresentation(group: EditorProjectV2["audioGroups"][number] | undefined, clipId: string) {
  if (!group) return true;
  if (group.activeRepresentation === "extracted") return group.extractedClipId === clipId;
  if (group.activeRepresentation === "separated") return group.dialogueClipId === clipId || group.musicClipId === clipId;
  return false;
}

export function summarizeWaveform(channels: Float32Array[], buckets: number): Pick<WaveformAnalysis, "peaks" | "rms" | "peak"> {
  const length = Math.max(0, ...channels.map((channel) => channel.length));
  const count = Math.max(1, Math.min(Math.max(1, length), Math.floor(buckets)));
  const peaks = Array.from({ length: count }, () => 0);
  let squares = 0;
  let samples = 0;
  let peak = 0;
  channels.forEach((channel) => {
    for (let index = 0; index < channel.length; index += 1) {
      const value = Math.abs(channel[index] ?? 0);
      const bucket = Math.min(count - 1, Math.floor(index / Math.max(1, channel.length) * count));
      peaks[bucket] = Math.max(peaks[bucket]!, value);
      peak = Math.max(peak, value);
      squares += value * value;
      samples += 1;
    }
  });
  return { peaks, rms: samples ? Math.sqrt(squares / samples) : 0, peak };
}

export async function analyzeAudioFile(file: File, buckets = 180): Promise<WaveformAnalysis> {
  const cacheKey = `${file.name}:${file.size}:${file.lastModified}:${buckets}`;
  const cached = waveformCache.get(cacheKey);
  if (cached) return structuredClone(cached);
  const started = performance.now();
  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Error("Análise de áudio não é suportada neste navegador.");
  const context = new AudioCtx();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index).slice());
    const summary = await summarizeInWorker(channels, buckets);
    const result: WaveformAnalysis = { cacheKey, ...summary, sampleRate: decoded.sampleRate, channels: decoded.numberOfChannels, duration: decoded.duration, durationMs: performance.now() - started };
    waveformCache.set(cacheKey, structuredClone(result));
    return result;
  } finally {
    void context.close();
  }
}

export function clearWaveformCache() { waveformCache.clear(); }

export function createStemAsset(source: MediaAsset, role: "voice" | "music", revision: number, storagePath: string): MediaAsset {
  const stem = structuredClone(source);
  stem.id = `${source.id}-stem-${role}-r${revision}`;
  stem.name = `${source.name} · ${role === "voice" ? "Voz" : "Música"}`;
  stem.storagePath = storagePath;
  stem.kind = "audio";
  stem.mimeType = "audio/wav";
  stem.stem = { role, sourceAssetId: source.id, revision, status: "ready" };
  delete stem.sourceUrl;
  delete stem.proxyUrl;
  delete stem.thumbnailUrl;
  delete stem.width;
  delete stem.height;
  delete stem.hash;
  delete stem.audioAnalysis;
  return stem;
}

function summarizeInWorker(channels: Float32Array[], buckets: number): Promise<Pick<WaveformAnalysis, "peaks" | "rms" | "peak">> {
  if (typeof Worker === "undefined") return Promise.resolve(summarizeWaveform(channels, buckets));
  const source = `self.onmessage=e=>{const {channels,buckets}=e.data;const length=Math.max(0,...channels.map(c=>c.length));const count=Math.max(1,Math.min(Math.max(1,length),Math.floor(buckets)));const peaks=Array(count).fill(0);let squares=0,samples=0,peak=0;channels.forEach(channel=>{for(let i=0;i<channel.length;i++){const value=Math.abs(channel[i]||0);const bucket=Math.min(count-1,Math.floor(i/Math.max(1,channel.length)*count));peaks[bucket]=Math.max(peaks[bucket],value);peak=Math.max(peak,value);squares+=value*value;samples++}});self.postMessage({peaks,rms:samples?Math.sqrt(squares/samples):0,peak})}`;
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  return new Promise((resolve, reject) => {
    const worker = new Worker(url);
    worker.onmessage = (event) => { resolve(event.data as Pick<WaveformAnalysis, "peaks" | "rms" | "peak">); worker.terminate(); URL.revokeObjectURL(url); };
    worker.onerror = () => { reject(new Error("Falha ao analisar a waveform.")); worker.terminate(); URL.revokeObjectURL(url); };
    worker.postMessage({ channels, buckets }, channels.map((channel) => channel.buffer));
  });
}
