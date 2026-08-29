import { describe, expect, it, vi } from "vitest";
import {
  createFacebookOAuthState,
  diagnoseFacebookOAuth,
  exchangeFacebookAuthorizationCode,
  facebookAuthorizationUrl,
  fetchFacebookPages,
  verifyFacebookOAuthState,
} from "@/lib/facebook-oauth.server";

const environment = {
  META_APP_ID: "37730893806558210",
  META_APP_SECRET: "server-only-secret",
  META_LOGIN_CONFIG_ID: "2291311094966424",
  FACEBOOK_REDIRECT_URI: "https://content-layer-lab.lovable.app/integracoes/facebook/callback",
  META_GRAPH_VERSION: "v26.0",
} as NodeJS.ProcessEnv;

describe("Facebook Login for Business", () => {
  it("builds the versioned business login URL without manual scopes", () => {
    const url = new URL(facebookAuthorizationUrl("user-123", environment));
    expect(url.origin + url.pathname).toBe("https://www.facebook.com/v26.0/dialog/oauth");
    expect(url.searchParams.get("client_id")).toBe("37730893806558210");
    expect(url.searchParams.get("config_id")).toBe("2291311094966424");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://content-layer-lab.lovable.app/integracoes/facebook/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("override_default_response_type")).toBe("true");
    expect(url.searchParams.has("scope")).toBe(false);
    expect(url.toString()).not.toContain("server-only-secret");
  });

  it("never restores unsupported scopes from an environment override", () => {
    const url = new URL(facebookAuthorizationUrl("user-123", {
      ...environment,
      META_LOGIN_MODE: "classic",
      META_LOGIN_SCOPES: "pages_read_engagement,pages_manage_posts,unknown_scope",
    }));
    expect(url.searchParams.get("scope")).toBe("pages_manage_posts");
    expect(url.searchParams.get("scope")).not.toContain("pages_read_engagement");
    expect(url.searchParams.get("scope")).not.toContain("unknown_scope");
  });

  it("returns only safe diagnostics", () => {
    const diagnostics = diagnoseFacebookOAuth(environment);
    expect(diagnostics).toEqual({
      ready: true,
      flowVersion: "facebook-login-for-business-v1",
      graphVersion: "v26.0",
      redirectOrigin: "https://content-layer-lab.lovable.app",
      redirectPath: "/integracoes/facebook/callback",
    });
    expect(JSON.stringify(diagnostics)).not.toContain("37730893806558210");
    expect(JSON.stringify(diagnostics)).not.toContain("2291311094966424");
    expect(JSON.stringify(diagnostics)).not.toContain("server-only-secret");
  });

  it("rejects malformed IDs and callback URLs before redirecting", () => {
    expect(() => facebookAuthorizationUrl("user-123", { ...environment, META_LOGIN_CONFIG_ID: "wrong" }))
      .toThrow("ID da configuração empresarial");
    expect(() => facebookAuthorizationUrl("user-123", {
      ...environment,
      FACEBOOK_REDIRECT_URI: "http://content-layer-lab.lovable.app/integracoes/facebook/callback",
    })).toThrow("deve ser HTTPS");
    expect(() => facebookAuthorizationUrl("user-123", {
      ...environment,
      FACEBOOK_REDIRECT_URI: "https://content-layer-lab.lovable.app/integracoes/instagram/callback",
    })).toThrow("terminar exatamente");
  });

  it("binds state to the signed-in user and expires it", () => {
    const state = createFacebookOAuthState("user-123", environment, 1_000);
    expect(() => verifyFacebookOAuthState(state, "user-123", environment, 2_000)).not.toThrow();
    expect(() => verifyFacebookOAuthState(state, "other-user", environment, 2_000)).toThrow();
    expect(() => verifyFacebookOAuthState(state, "user-123", environment, 700_000)).toThrow();
  });

  it("exchanges the returned code with the exact callback", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "short", expires_in: 3600 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "long", expires_in: 5_184_000 })));
    const result = await exchangeFacebookAuthorizationCode({
      code: "authorization-code#_",
      environment,
      fetch: request,
      now: 1_000,
    });
    expect(result.accessToken).toBe("long");
    const firstUrl = new URL(String(request.mock.calls[0]?.[0]));
    expect(firstUrl.searchParams.get("redirect_uri")).toBe(environment["FACEBOOK_REDIRECT_URI"]);
    expect(firstUrl.searchParams.get("code")).toBe("authorization-code");
  });

  it("discovers both Facebook Pages and linked Instagram Business accounts", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      data: [{
        id: "page-1",
        name: "Minha Página",
        access_token: "page-token",
        instagram_business_account: { id: "ig-1", username: "Minha.Conta" },
      }],
    })));
    await expect(fetchFacebookPages({ accessToken: "user-token", environment, fetch: request }))
      .resolves.toEqual([{ pageId: "page-1", name: "Minha Página", pageAccessToken: "page-token", instagram: { id: "ig-1", username: "minha.conta" } }]);
  });
});