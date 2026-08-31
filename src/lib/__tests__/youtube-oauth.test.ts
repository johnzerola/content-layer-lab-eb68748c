import { describe, expect, it, vi } from "vitest";
import {
  exchangeYoutubeAuthorizationCode,
  fetchYoutubeChannels,
  youtubeAuthorizationUrl,
} from "@/lib/youtube-oauth.server";

const environment = {
  YOUTUBE_CLIENT_ID: "google-client-id",
  YOUTUBE_CLIENT_SECRET: "server-only-secret",
  YOUTUBE_REDIRECT_URI: "https://content-layer-lab.lovable.app/integracoes/youtube/callback",
} as NodeJS.ProcessEnv;

describe("YouTube OAuth multi-channel flow", () => {
  it("reopens the Google selector when adding another channel", () => {
    const url = new URL(youtubeAuthorizationUrl("user-1", environment));
    expect(url.searchParams.get("prompt")).toBe("consent select_account");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube",
    ]);
    expect(url.searchParams.has("include_granted_scopes")).toBe(false);
    expect(url.toString()).not.toContain("server-only-secret");
  });

  it("rejects the authorization if Google omits a required YouTube scope", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/youtube.readonly",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      exchangeYoutubeAuthorizationCode({
        code: "code",
        environment,
        fetch: request,
      }),
    ).rejects.toThrow("youtube.upload");
  });

  it("accepts Google's broad YouTube scope as full channel access", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/youtube",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      exchangeYoutubeAuthorizationCode({
        code: "code",
        environment,
        fetch: request,
      }),
    ).resolves.toMatchObject({ accessToken: "access-token", refreshToken: "refresh-token" });
  });

  it("keeps every distinct channel returned by the authorized identity", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            { id: "UC-1", snippet: { title: "Canal A", customUrl: "@canala" } },
            { id: "UC-2", snippet: { title: "Canal B", customUrl: "@canalb" } },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const channels = await fetchYoutubeChannels({ accessToken: "token", fetch: request });
    expect(channels.map((channel) => channel.channelId)).toEqual(["UC-1", "UC-2"]);
  });

  it("uses the stable channel id when Google does not return a custom handle", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [{ id: "UC-stable", snippet: { title: "Mesmo nome" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const channels = await fetchYoutubeChannels({ accessToken: "token", fetch: request });
    expect(channels[0]).toMatchObject({
      channelId: "UC-stable",
      title: "Mesmo nome",
      handle: "UC-stable",
    });
  });
});
