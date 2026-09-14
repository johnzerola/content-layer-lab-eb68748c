import { asProjectTime, type Clip, type ProjectTime } from "./types";

export interface ClockSnapshot {
  projectTime: ProjectTime;
  sourceTime: number | null;
  activeClipId: string | null;
  playing: boolean;
}

export function projectToSourceTime(clip: Clip, time: ProjectTime): number | null {
  const value = Number(time);
  if (value < Number(clip.projectStart) || value > Number(clip.projectEnd)) return null;
  const elapsed = Math.max(0, value - Number(clip.projectStart));
  const sourceTime = clip.reversed
    ? clip.sourceOut - elapsed * clip.playbackRate
    : clip.sourceIn + elapsed * clip.playbackRate;
  return Math.max(clip.sourceIn, Math.min(clip.sourceOut, sourceTime));
}

export function sourceToProjectTime(clip: Clip, sourceTime: number): ProjectTime | null {
  if (sourceTime < clip.sourceIn || sourceTime > clip.sourceOut) return null;
  const elapsed = clip.reversed
    ? (clip.sourceOut - sourceTime) / clip.playbackRate
    : (sourceTime - clip.sourceIn) / clip.playbackRate;
  return asProjectTime(Number(clip.projectStart) + elapsed);
}

export class CompositionClock {
  private projectTime = asProjectTime(0);
  private playing = false;
  private listeners = new Set<(snapshot: ClockSnapshot) => void>();

  constructor(private readonly clips: () => Clip[]) {}

  getSnapshot(): ClockSnapshot {
    const clip = this.clips().find((item) => projectToSourceTime(item, this.projectTime) !== null) ?? null;
    return {
      projectTime: this.projectTime,
      sourceTime: clip ? projectToSourceTime(clip, this.projectTime) : null,
      activeClipId: clip?.id ?? null,
      playing: this.playing,
    };
  }

  seek(time: number): ClockSnapshot {
    this.projectTime = asProjectTime(time);
    return this.emit();
  }

  play(): ClockSnapshot {
    this.playing = true;
    return this.emit();
  }

  pause(): ClockSnapshot {
    this.playing = false;
    return this.emit();
  }

  tick(deltaSeconds: number): ClockSnapshot {
    if (this.playing) this.projectTime = asProjectTime(Number(this.projectTime) + Math.max(0, deltaSeconds));
    return this.emit();
  }

  subscribe(listener: (snapshot: ClockSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): ClockSnapshot {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
    return snapshot;
  }
}
