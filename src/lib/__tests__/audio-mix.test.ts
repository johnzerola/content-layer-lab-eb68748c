import { afterEach, describe, expect, it, vi } from "vitest";
import { clipGain, clipWindows, renderEditorAudio } from "@/lib/editor/audio-mix";
import { createAudioClip, defaultEditorAudio } from "@/lib/editor/audio";
import { decodeSourceAudio } from "@/lib/audio-track";

vi.mock("@/lib/audio-track", () => ({ decodeSourceAudio: vi.fn() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("editor stems follow exported cuts", () => {
  const clip = createAudioClip({
    name: "voice",
    url: "data:audio/mpeg;base64,",
    kind: "voice",
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    duration: 30,
  });
  it("removes the same intervals from voice and video", () => {
    const windows = clipWindows(clip, 30, [
      { start: 10, end: 15 },
      { start: 20, end: 25 },
    ]);
    expect(windows.map(({ when, offset, duration }) => ({ when, offset, duration }))).toEqual([
      { when: 0, offset: 10, duration: 5 },
      { when: 5, offset: 20, duration: 5 },
    ]);
  });
  it("does not read beyond a non-looping stem", () => {
    expect(clipWindows(clip, 12, [{ start: 10, end: 15 }])[0]?.duration).toBe(2);
    expect(clipWindows(clip, 5, [{ start: 10, end: 15 }])).toEqual([]);
  });
  it("respects mute, volume and fades", () => {
    expect(clipGain({ ...clip, muted: true }, 3, 30)).toBe(0);
    expect(clipGain({ ...clip, volume: 0.4 }, 3, 30)).toBeCloseTo(0.4);
    expect(clipGain({ ...clip, fadeIn: 2 }, 1, 30)).toBeCloseTo(0.5);
    expect(clipGain({ ...clip, fadeOut: 2 }, 29, 30)).toBeCloseTo(0.5);
  });
  it("exports the selected stem without decoding the muted original mix", async () => {
    const start = vi.fn();
    const curve = vi.fn();
    const rendered = { duration: 5 };
    const gain = { gain: { setValueCurveAtTime: curve }, connect: vi.fn() };
    const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array(200)));
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal(
      "OfflineAudioContext",
      class {
        destination = {};
        createBufferSource() {
          return { connect: () => gain, start };
        }
        createGain() {
          return gain;
        }
        async decodeAudioData() {
          return { duration: 30 };
        }
        async startRendering() {
          return rendered;
        }
      },
    );
    const result = await renderEditorAudio({} as File, [{ start: 10, end: 15 }], {
      ...defaultEditorAudio(),
      originalMuted: true,
      tracks: [clip, { ...clip, id: "music", muted: true }],
    });
    expect(decodeSourceAudio).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(0, 10, 5);
    expect(curve).toHaveBeenCalledTimes(1);
    expect(result?.rendered).toBe(rendered);
  });
  it("rejects a missing stem instead of exporting the original music", async () => {
    vi.stubGlobal("OfflineAudioContext", class {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(
      renderEditorAudio({} as File, [{ start: 0, end: 5 }], {
        ...defaultEditorAudio(),
        originalMuted: true,
        tracks: [clip],
      }),
    ).rejects.toThrow("trilha");
    expect(decodeSourceAudio).not.toHaveBeenCalled();
  });
});
