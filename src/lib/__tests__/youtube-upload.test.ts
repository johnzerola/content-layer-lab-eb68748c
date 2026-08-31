import { describe, expect, it } from "vitest";
import {
  nextOffsetFromRange,
  uploadYoutubeVideo,
  youtubeTitleFromCaption,
} from "@/lib/youtube-upload.server";

const VIDEO_URL = "https://storage.test/video.mp4";
const SESSION_URL = "https://upload.test/session";

function fakeSource(totalBytes: number) {
  return new Uint8Array(totalBytes).fill(7);
}

describe("youtube resumable upload", () => {
  it("derives a valid title from the caption", () => {
    expect(youtubeTitleFromCaption("Primeira linha\nsegunda")).toBe("Primeira linha");
    expect(youtubeTitleFromCaption("")).toBe("Novo vídeo");
    expect(youtubeTitleFromCaption("x".repeat(200)).length).toBe(100);
  });

  it("reads the next offset from the Range header", () => {
    expect(nextOffsetFromRange("bytes=0-262143", 0)).toBe(262144);
    expect(nextOffsetFromRange(null, 512)).toBe(512);
  });

  it("uploads the video in chunks and returns the permalink", async () => {
    const total = 700 * 1024;
    const source = fakeSource(total);
    const ranges: string[] = [];

    const request: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : String(input);
      const method = init?.method ?? "GET";
      if (url === VIDEO_URL && method === "HEAD") {
        return new Response(null, { headers: { "content-length": String(total) } });
      }
      if (url === VIDEO_URL) {
        const header = new Headers(init?.headers).get("range") ?? "";
        const [, start, end] = /bytes=(\d+)-(\d+)/.exec(header) ?? [];
        return new Response(source.slice(Number(start), Number(end) + 1), { status: 206 });
      }
      if (url.startsWith("https://www.googleapis.com/upload/youtube/v3/videos")) {
        return new Response(null, { status: 200, headers: { location: SESSION_URL } });
      }
      const contentRange = new Headers(init?.headers).get("content-range") ?? "";
      ranges.push(contentRange);
      if (!contentRange.endsWith(`/${total}`) || !contentRange.includes(`${total - 1}`)) {
        const uploaded = Number(/bytes \d+-(\d+)\//.exec(contentRange)?.[1] ?? 0);
        return new Response(null, { status: 308, headers: { range: `bytes=0-${uploaded}` } });
      }
      return Response.json({ id: "abc123" });
    };

    const result = await uploadYoutubeVideo({
      accessToken: "token",
      videoUrl: VIDEO_URL,
      title: "Meu Short",
      description: "descrição",
      chunkBytes: 256 * 1024,
      fetch: request,
    });

    expect(result).toEqual({
      ok: true,
      videoId: "abc123",
      permalink: "https://www.youtube.com/watch?v=abc123",
    });
    expect(ranges).toHaveLength(3);
    expect(ranges[0]).toBe(`bytes 0-${256 * 1024 - 1}/${total}`);
    expect(ranges[2]).toBe(`bytes ${512 * 1024}-${total - 1}/${total}`);
  });

  it("reports an unauthorized session as non retryable", async () => {
    const request: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : String(input);
      if (url === VIDEO_URL && init?.method === "HEAD") {
        return new Response(null, { headers: { "content-length": "1024" } });
      }
      return new Response("invalid credentials", { status: 401 });
    };

    const result = await uploadYoutubeVideo({
      accessToken: "expired",
      videoUrl: VIDEO_URL,
      title: "t",
      description: "d",
      fetch: request,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryable).toBe(false);
      expect(result.status).toBe(401);
    }
  });
});
