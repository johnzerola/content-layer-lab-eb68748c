import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUDIO_SEPARATION_SAMPLE_RATE,
  prepareAudioForSeparation,
} from "@/lib/editor-v2/audio-extraction";

afterEach(() => vi.unstubAllGlobals());

describe("audio prepared for separation", () => {
  it("resamples 48 kHz camera audio to the worker's 44.1 kHz WAV contract", async () => {
    const decoded = {
      duration: 1,
      sampleRate: 48_000,
      numberOfChannels: 2,
      getChannelData: () => new Float32Array(48_000),
    } as unknown as AudioBuffer;
    const renderedChannels = [new Float32Array(44_100), new Float32Array(44_100)];
    const close = vi.fn();
    vi.stubGlobal("window", {
      AudioContext: class {
        decodeAudioData = vi.fn().mockResolvedValue(decoded);
        close = close;
      },
      OfflineAudioContext: class {
        destination = {};
        createBufferSource() {
          return { buffer: null, connect: vi.fn(), start: vi.fn() };
        }
        startRendering = vi.fn().mockResolvedValue({
          getChannelData: (index: number) => renderedChannels[index]!,
        });
      },
    });

    const wav = await prepareAudioForSeparation(new Blob(["source"]));
    const header = new DataView(await wav.arrayBuffer());

    expect(header.getUint16(22, true)).toBe(2);
    expect(header.getUint32(24, true)).toBe(AUDIO_SEPARATION_SAMPLE_RATE);
    expect(header.getUint32(40, true)).toBe(44_100 * 2 * 2);
    expect(close).toHaveBeenCalledOnce();
  });

  it("keeps valid 44.1 kHz audio stereo and skips resampling", async () => {
    const channels = [new Float32Array([0.25, -0.25]), new Float32Array([0.5, -0.5])];
    vi.stubGlobal("window", {
      AudioContext: class {
        decodeAudioData = vi.fn().mockResolvedValue({
          duration: 2 / AUDIO_SEPARATION_SAMPLE_RATE,
          sampleRate: AUDIO_SEPARATION_SAMPLE_RATE,
          numberOfChannels: 2,
          getChannelData: (index: number) => channels[index]!,
        });
        close = vi.fn();
      },
    });

    const wav = await prepareAudioForSeparation(new Blob(["source"]));
    const header = new DataView(await wav.arrayBuffer());

    expect(header.getUint16(22, true)).toBe(2);
    expect(header.getUint32(24, true)).toBe(AUDIO_SEPARATION_SAMPLE_RATE);
    expect(header.getUint32(40, true)).toBe(8);
  });
});
