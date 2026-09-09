import { decodeSourceAudio, type AudioTrack } from "@/lib/audio-track";
import { duckGainAt, type AudioClip, type EditorAudio } from "./audio";

export type AudioRange = { start: number; end: number; speed?: number };

export function clipGain(clip: AudioClip, localTime: number, duration: number): number {
  if (clip.muted || localTime < 0 || localTime >= duration) return 0;
  const fadeIn = clip.fadeIn > 0 ? Math.min(1, localTime / clip.fadeIn) : 1;
  const fadeOut = clip.fadeOut > 0 ? Math.min(1, (duration - localTime) / clip.fadeOut) : 1;
  return Math.max(0, Math.min(1.5, clip.volume)) * Math.max(0, Math.min(fadeIn, fadeOut));
}

/** Clip times refer to original source time, like the editor's playhead. */
export function clipWindows(clip: AudioClip, mediaDuration: number, segments: AudioRange[]) {
  const end = Math.max(0, ...segments.map((s) => s.end));
  const duration =
    clip.duration > 0 ? clip.duration : clip.loop ? end - clip.startTime : mediaDuration;
  let cursor = 0;
  return segments.flatMap((segment) => {
    const start = Math.max(segment.start, clip.startTime);
    const finish = Math.min(
      segment.end,
      clip.startTime + duration,
      clip.loop ? Infinity : clip.startTime + mediaDuration,
    );
    const speed = Math.max(0.05, segment.speed ?? 1);
    const window = {
      when: cursor + (start - segment.start) / speed,
      offset: start - clip.startTime,
      duration: (finish - start) / speed,
      clipDuration: duration,
      sourceTime: start,
    };
    cursor += Math.max(0, segment.end - segment.start) / speed;
    return window.duration > 0 ? [window] : [];
  });
}

export async function renderEditorAudio(
  file: File,
  segments: AudioRange[],
  audio: EditorAudio,
  speech: AudioRange[] = [],
): Promise<AudioTrack | null> {
  const duration = segments.reduce((sum, s) => sum + Math.max(0, s.end - s.start), 0);
  if (duration <= 0) return null;
  const sampleRate = 48000;
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
  const master = audio.masterCompression !== false && typeof ctx.createDynamicsCompressor === "function"
    ? ctx.createDynamicsCompressor()
    : null;
  if (master) {
    master.threshold.value = -18;
    master.knee.value = 18;
    master.ratio.value = 4;
    master.attack.value = 0.003;
    master.release.value = 0.2;
    master.connect(ctx.destination);
  }
  const output = master ?? ctx.destination;
  let hasAudio = false;
  if (!audio.originalMuted && audio.originalVolume > 0) {
    const original = await decodeSourceAudio(file);
    if (original) {
      let cursor = 0;
      for (const segment of segments) {
        const source = ctx.createBufferSource();
        source.buffer = original;
        source.playbackRate.value = Math.max(0.05, segment.speed ?? 1);
        const gain = ctx.createGain();
        gain.gain.value = Math.max(0, Math.min(1.5, audio.originalVolume));
        source.connect(gain).connect(output);
        const length = Math.max(0, Math.min(segment.end, original.duration) - segment.start);
        if (length > 0) {
          source.start(cursor, segment.start, length);
          hasAudio = true;
        }
        cursor += Math.max(0, segment.end - segment.start) / Math.max(0.05, segment.speed ?? 1);
      }
    }
  }
  for (const clip of audio.tracks) {
    if (clip.muted || clip.volume <= 0) continue;
    const response = await fetch(clip.url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Não consegui carregar a trilha ${clip.name}.`);
    const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
    for (const window of clipWindows(clip, buffer.duration, segments)) {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = clip.loop;
      const gain = ctx.createGain();
      const count = Math.max(2, Math.ceil(window.duration * 40));
      const curve = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const t = (i / (count - 1)) * window.duration;
        curve[i] =
          clipGain(clip, window.offset + t, window.clipDuration) *
          (audio.duckUnderSpeech && clip.kind === "music"
            ? duckGainAt(speech, window.sourceTime + t, audio.duckAmount)
            : 1);
      }
      gain.gain.setValueCurveAtTime(curve, window.when, window.duration);
      source.connect(gain).connect(output);
      source.start(
        window.when,
        clip.loop ? window.offset % buffer.duration : window.offset,
        window.duration,
      );
      hasAudio = true;
    }
  }
  if (!hasAudio) return null;
  return { rendered: await ctx.startRendering(), channels: 2, sampleRate };
}
