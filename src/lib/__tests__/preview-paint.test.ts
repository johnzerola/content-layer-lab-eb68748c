import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { previewSize, watchVideoPaint } from '../editor/preview-paint';

class Video extends EventTarget {
  paused = true;
  ended = false;
  frames = new Map<number, () => void>();
  id = 0;
  requestVideoFrameCallback = (fn: () => void) => { this.frames.set(++this.id, fn); return this.id; };
  cancelVideoFrameCallback = (id: number) => { this.frames.delete(id); };
  frame() { const callbacks = [...this.frames.values()]; this.frames.clear(); callbacks.forEach(fn => fn()); }
}

describe('preview paint scheduling', () => {
  let rafs: Map<number, FrameRequestCallback>;
  let page: EventTarget & { visibilityState: string };
  const flush = () => { const callbacks = [...rafs.values()]; rafs.clear(); callbacks.forEach(fn => fn(0)); };
  beforeEach(() => {
    rafs = new Map(); let id = 0;
    page = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    vi.stubGlobal('document', page);
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { rafs.set(++id, fn); return id; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => rafs.delete(id));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('paints a paused video once and coalesces multiple edits into one repaint', () => {
    const video = new Video(); const paint = vi.fn();
    const watcher = watchVideoPaint(video as unknown as HTMLVideoElement, paint);
    flush();
    expect(paint).toHaveBeenCalledTimes(1);
    expect(rafs.size + video.frames.size).toBe(0);
    for (let i = 0; i < 100; i++) watcher.invalidate();
    flush();
    expect(paint).toHaveBeenCalledTimes(2);
    watcher.dispose();
  });
  it('follows decoded frames and stops all callbacks when paused', () => {
    const video = new Video(); const paint = vi.fn();
    const watcher = watchVideoPaint(video as unknown as HTMLVideoElement, paint);
    video.paused = false; video.dispatchEvent(new Event('play')); flush();
    video.frame(); video.frame();
    expect(paint).toHaveBeenCalledTimes(3);
    expect(video.frames.size).toBe(1);
    video.paused = true; video.dispatchEvent(new Event('pause')); flush();
    expect(video.frames.size + rafs.size).toBe(0);
    watcher.dispose();
  });
  it('repaints seeks while paused and stops in hidden tabs, then restores', () => {
    const video = new Video(); const paint = vi.fn();
    const watcher = watchVideoPaint(video as unknown as HTMLVideoElement, paint);
    flush(); video.dispatchEvent(new Event('seeked')); flush();
    expect(paint).toHaveBeenCalledTimes(2);
    page.visibilityState = 'hidden'; page.dispatchEvent(new Event('visibilitychange'));
    watcher.invalidate(); flush(); expect(paint).toHaveBeenCalledTimes(2);
    page.visibilityState = 'visible'; page.dispatchEvent(new Event('visibilitychange')); flush();
    expect(paint).toHaveBeenCalledTimes(3);
    watcher.dispose(); video.dispatchEvent(new Event('seeked')); flush();
    expect(paint).toHaveBeenCalledTimes(3);
  });
  it('uses animation frames only during playback in older browsers', () => {
    const video = Object.assign(new EventTarget(), { paused: false, ended: false });
    const watcher = watchVideoPaint(video as unknown as HTMLVideoElement, vi.fn());
    flush(); expect(rafs.size).toBe(1);
    video.paused = true; video.dispatchEvent(new Event('pause')); flush();
    expect(rafs.size).toBe(0);
    watcher.dispose();
  });
  it('can invalidate an empty stage without starting a loop', () => {
    const paint = vi.fn(); const watcher = watchVideoPaint(null, paint);
    flush(); expect(paint).toHaveBeenCalledOnce(); expect(rafs.size).toBe(0);
    watcher.dispose(); watcher.invalidate(); expect(rafs.size).toBe(0);
  });
});

describe('preview resolution', () => {
  it('scales to the screen and caps high DPI without changing output dimensions', () => {
    expect(previewSize(1080, 1920, 360, 640, 3)).toEqual({ width: 540, height: 960 });
    expect(previewSize(1920, 1080, 320, 180, 1)).toEqual({ width: 320, height: 180 });
    expect(previewSize(320, 180, 1920, 1080, 2)).toEqual({ width: 320, height: 180 });
    expect(previewSize(1080, 1920, 0, 0)).toEqual({ width: 2, height: 2 });
  });
});
