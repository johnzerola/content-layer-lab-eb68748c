import { describe, expect, it } from "vitest";
import { captionTimingSummary, timedWordsFor, type CaptionCue } from "@/lib/captions";

describe("caption word timing", () => {
  it("maps ASR timestamps from a chunk back to the source video clock", () => {
    expect(
      timedWordsFor(
        [
          { word: "Olá", start: 0.18, end: 0.52 },
          { word: "Brasil", start: 0.61, end: 1.12 },
        ],
        { start: 12.4, end: 14.4 },
      ),
    ).toEqual([
      { text: "Olá", start: 12.58, end: 12.92 },
      { text: "Brasil", start: 13.01, end: 13.52 },
    ]);
  });

  it("clamps invalid provider timestamps to the transcribed chunk", () => {
    expect(
      timedWordsFor(
        [
          { word: "antes", start: -1, end: 0.2 },
          { word: "depois", start: 1.7, end: 4 },
        ],
        { start: 5, end: 7 },
      ),
    ).toEqual([
      { text: "antes", start: 5, end: 5.2 },
      { text: "depois", start: 6.7, end: 7 },
    ]);
  });

  it("reports when a batch had to use estimated timing", () => {
    const cue = (timing: NonNullable<CaptionCue["timing"]>): CaptionCue => ({
      start: 0,
      end: 1,
      words: [{ text: "teste", start: 0, end: 1 }],
      timing,
    });
    expect(captionTimingSummary([cue("word")])).toBe("sincronia por palavra");
    expect(captionTimingSummary([cue("word"), cue("estimated")])).toBe("sincronia mista");
    expect(captionTimingSummary([cue("estimated")])).toBe("sincronia estimada");
  });
});
