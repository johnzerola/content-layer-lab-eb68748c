import { describe, expect, it, vi } from "vitest";
import {
  createInstagramOAuthState,
  exchangeInstagramAuthorizationCode,
  exchangeLongLivedInstagramToken,
  fetchOAuthInstagramIdentity,
  instagramConfigChecklist,
  instagramAuthorizationUrl,
  verifyInstagramOAuthState,
  refreshLongLivedInstagramToken,
} from "@/lib/meta-oauth.server";

const environment = {
  INSTAGRAM_APP_ID: "ig-app-123",
  INSTAGRAM_APP_SECRET: "server-only-secret",
  INSTAGRAM_REDIRECT_URI: "https://app.example/integracoes/instagram/callback",
  META_GRAPH_VERSION: "v26.0",
} as NodeJS.ProcessEnv;

describe("Instagram OAuth", () => {
  it("creates the official authorization URL with required publishing scopes", () => {
    const url = new URL(instagramAuthorizationUrl("user-123", environment));
    expect(url.origin + url.pathname).toBe("https://api.instagram.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("ig-app-123");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example/integracoes/instagram/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")?.split(",")).toEqual([
      "instagram_business_basic",
      "instagram_business_content_publish",
    ]);
    expect(url.toString()).not.toContain("server-only-secret");
  });

  it("derives the Instagram callback when only the Facebook callback env is set", () => {
    const url = new URL(
      instagramAuthorizationUrl("user-123", {
        ...environment,
        INSTAGRAM_REDIRECT_URI: "",
        META_REDIRECT_URI: "https://app.example/integracoes/facebook/callback",
      }),
    );
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example/integracoes/instagram/callback",
    );
  });

  it("reports the Lovable and Meta settings needed for direct Instagram login", () => {
    const check = instagramConfigChecklist({
      ...environment,
      INSTAGRAM_APP_ID: "1057465633312906",
    });
    expect(check.issues).toEqual([]);
    expect(check.authEndpoint).toBe("https://api.instagram.com/oauth/authorize");
    expect(check.redirectUri).toBe("https://app.example/integracoes/instagram/callback");
    expect(check.requiredScopes).toEqual([
      "instagram_business_basic",
      "instagram_business_content_publish",
    ]);
    expect(check.authorizationUrl).toContain("client_id=1057465633312906");
  });

  it("flags missing direct Instagram credentials for Lovable", () => {
    const check = instagramConfigChecklist({
      PUBLIC_SITE_URL: "https://app.example",
    } as NodeJS.ProcessEnv);
    expect(check.issues).toContain("INSTAGRAM_APP_ID não está definido no Lovable.");
    expect(check.issues).toContain("INSTAGRAM_APP_SECRET não está definido no Lovable.");
    expect(check.redirectUri).toBe("https://app.example/integracoes/instagram/callback");
  });

  it("binds state to the authenticated user and expiry", () => {
    const state = createInstagramOAuthState("user-123", environment, 1_000);
    expect(() => verifyInstagramOAuthState(state, "user-123", environment, 2_000)).not.toThrow();
    expect(() => verifyInstagramOAuthState(state, "other-user", environment, 2_000)).toThrow();
    expect(() => verifyInstagramOAuthState(state, "user-123", environment, 700_000)).toThrow();
    expect(() => verifyInstagramOAuthState(`${state}x`, "user-123", environment, 2_000)).toThrow();
  });

  it("exchanges the code server-side as form data", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "oauth-token", user_id: 12345 }), { status: 200 }),
    );
    await expect(
      exchangeInstagramAuthorizationCode({ code: "authorization-code#_", environment, fetch: request }),
    ).resolves.toEqual({ accessToken: "oauth-token", userId: "12345" });

    expect(request).toHaveBeenCalledWith(
      "https://api.instagram.com/oauth/access_token",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
    );
    const body = request.mock.calls[0]?.[1]?.body;
    expect(body).toBeInstanceOf(URLSearchParams);
    expect(String(body)).toContain("code=authorization-code");
    expect(String(body)).toContain("client_secret=server-only-secret");
  });

  it("validates the authorized identity with Bearer authentication", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: "12345", username: "Minha.Conta" }), { status: 200 }),
    );
    await expect(
      fetchOAuthInstagramIdentity({ accessToken: "oauth-token", environment, fetch: request }),
    ).resolves.toEqual({ id: "12345", username: "minha.conta" });
    expect(request).toHaveBeenCalledWith(
      "https://graph.instagram.com/v26.0/me?fields=id,username",
      { headers: { authorization: "Bearer oauth-token" } },
    );
  });

  it("exchanges and refreshes long-lived user tokens server-side", async () => {
    const exchangeRequest = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "long-token", expires_in: 5_184_000 }), { status: 200 }),
    );
    await expect(exchangeLongLivedInstagramToken({
      accessToken: "short-token",
      environment,
      fetch: exchangeRequest,
      now: 1_000,
    })).resolves.toEqual({ accessToken: "long-token", expiresAt: new Date(5_184_001_000) });
    const exchangeUrl = new URL(String(exchangeRequest.mock.calls[0]?.[0]));
    expect(exchangeUrl.origin + exchangeUrl.pathname).toBe("https://graph.instagram.com/access_token");
    expect(exchangeUrl.searchParams.get("grant_type")).toBe("ig_exchange_token");

    const refreshRequest = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "refreshed-token", expires_in: 5_184_000 }), { status: 200 }),
    );
    await expect(refreshLongLivedInstagramToken({ accessToken: "long-token", fetch: refreshRequest, now: 2_000 }))
      .resolves.toEqual({ accessToken: "refreshed-token", expiresAt: new Date(5_184_002_000) });
    expect(new URL(String(refreshRequest.mock.calls[0]?.[0])).searchParams.get("grant_type"))
      .toBe("ig_refresh_token");
  });
});
