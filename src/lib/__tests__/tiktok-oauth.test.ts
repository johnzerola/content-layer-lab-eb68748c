import { describe, expect, it, vi } from "vitest";
import {
  refreshTikTokTokens,
  tiktokAuthorizationUrl,
  verifyTikTokOAuthState,
} from "@/lib/tiktok-oauth.server";

const environment = {
  TIKTOK_CLIENT_KEY: "client-key",
  TIKTOK_CLIENT_SECRET: "server-only-secret",
  TIKTOK_REDIRECT_URI: "https://content-layer-lab.lovable.app/integracoes/tiktok/callback",
} as NodeJS.ProcessEnv;

describe("TikTok OAuth", () => {
  it("requests official upload and publish permissions without exposing the secret", () => {
    const url = new URL(tiktokAuthorizationUrl("user-1", environment));
    expect(url.searchParams.get("scope")?.split(",")).toEqual([
      "user.info.basic",
      "user.info.profile",
      "video.upload",
      "video.publish",
    ]);
    expect(url.toString()).not.toContain("server-only-secret");
    verifyTikTokOAuthState(url.searchParams.get("state") ?? "", "user-1", environment);
  });

  it("refreshes the rotating access and refresh tokens", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "new-access",
          refresh_token: "new-refresh",
          open_id: "open-id",
          expires_in: 86400,
          refresh_expires_in: 31536000,
          scope: "video.publish",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await refreshTikTokTokens({
      refreshToken: "old-refresh",
      environment,
      fetch: request,
      now: 0,
    });
    expect(result).toMatchObject({ accessToken: "new-access", refreshToken: "new-refresh" });
    const body = request.mock.calls[0]?.[1]?.body;
    expect(body).toBeInstanceOf(URLSearchParams);
    expect((body as URLSearchParams).get("grant_type")).toBe("refresh_token");
  });
});