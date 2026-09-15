import { afterEach, describe, expect, it, vi } from "vitest";
import { expandTikTokUrl, resolveTikTok } from "@/lib/resolvers.server";

afterEach(() => vi.unstubAllGlobals());

describe("TikTok resolver", () => {
  it("expands a short TikTok URL before asking the media resolver", async () => {
    const canonical = "https://www.tiktok.com/@canal/video/123456789";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: canonical } }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            data: { hdplay: "https://v16.tiktokcdn.com/video.mp4", title: "Vídeo" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const hit = await resolveTikTok("https://vt.tiktok.com/ABC123/");

    expect(hit?.videoUrl).toBe("https://v16.tiktokcdn.com/video.mp4");
    expect(hit?.headers?.referer).toBe("https://www.tiktok.com/");
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain(encodeURIComponent(canonical));
  });

  it("refuses a redirect that leaves TikTok", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(null, { status: 301, headers: { location: "https://example.com/private" } }),
        ),
    );
    await expect(expandTikTokUrl("https://vt.tiktok.com/ABC123/")).resolves.toBe(
      "https://vt.tiktok.com/ABC123/",
    );
  });
});
