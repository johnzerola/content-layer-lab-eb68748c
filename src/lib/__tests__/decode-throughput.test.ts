import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FrameReader } from '../decode';
import { demuxMp4 } from '../mp4demux';

vi.mock('../mp4demux', () => ({ demuxMp4: vi.fn() }));

describe('decoder read-ahead', () => {
  let frames: { timestamp: number; duration: number; close: ReturnType<typeof vi.fn> }[];
  beforeEach(() => {
    frames = [];
    vi.mocked(demuxMp4).mockResolvedValue({ codec: 'avc1.42001f', width: 640, height: 360, duration: 10, description: undefined,
      samples: Array.from({ length: 300 }, (_, i) => ({ offset: i, size: 1, cts: i / 30, dts: i / 30, duration: 1 / 30, sync: i % 30 === 0 })) });
    class Decoder {
      decodeQueueSize = 0;
      static isConfigSupported = async () => ({ supported: true });
      constructor(private callbacks: { output: (frame: unknown) => void }) {}
      configure() {}
      reset() {}
      close() {}
      async flush() {}
      decode(chunk: { timestamp: number; duration: number }) {
        const frame = { timestamp: chunk.timestamp, duration: chunk.duration, close: vi.fn() };
        frames.push(frame); this.callbacks.output(frame);
      }
    }
    vi.stubGlobal('VideoDecoder', Decoder);
    vi.stubGlobal('EncodedVideoChunk', class { constructor(data: object) { Object.assign(this, data); } });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('does not decode the whole file when the decoder is faster than the consumer', async () => {
    const reader = await FrameReader.open(new File([new Uint8Array(300)], 'test.mp4'));
    const delay = vi.spyOn(globalThis, 'setTimeout');
    const first = await reader!.read();
    expect(first?.time).toBe(0);
    expect(frames.length).toBe(12);
    expect(delay).not.toHaveBeenCalled();
    first!.frame.close(); reader!.close();
    expect(frames.every(f => f.close.mock.calls.length === 1)).toBe(true);
  });
  it('keeps source order, reaches EOF and closes every decoded frame', async () => {
    const reader = await FrameReader.open(new File([new Uint8Array(300)], 'test.mp4'));
    let count = 0; let previous = -1;
    for (;;) {
      const frame = await reader!.read(); if (!frame) break;
      expect(frame.time).toBeGreaterThan(previous);
      expect(frames.filter(f => !f.close.mock.calls.length).length).toBeLessThanOrEqual(12);
      previous = frame.time; count++; frame.frame.close();
    }
    expect(count).toBe(300); reader!.close();
    expect(frames.every(f => f.close.mock.calls.length === 1)).toBe(true);
  });
});
