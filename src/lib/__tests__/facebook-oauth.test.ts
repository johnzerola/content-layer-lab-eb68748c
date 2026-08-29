import { describe, expect, it, vi } from "vitest";
import {
  createFacebookOAuthState,
  diagnoseFacebookOAuth,
  exchangeFacebookAuthorizationCode,
  facebookAuthorizationUrl,
  facebookConfigChecklist,
  facebookLoginMode,
  facebookOAuthConfiguration,
  fetchFacebookPages,
  validateFacebookAccessTokenScopes,
  verifyFacebookOAuthState,
} from "@/lib/facebook-oauth.server";

const environment = {
  META_APP_ID: "37730893806558210",
  META_APP_SECRET: "server-only-secret",
  META_LOGIN_CONFIG_ID: "2291311094966424",
  FACEBOOK_REDIRECT_URI: "https://content-layer-lab.lovable.app/integracoes/facebook/callback",
  META_GRAPH_VERSION: "v26.0",
} as NodeJS.ProcessEnv;

const businessEnvironment = {
  ...environment,
  META_LOGIN_MODE: "business",
} as NodeJS.ProcessEnv;

describe("Facebook Login", () => {
  it("builds the versioned business login URL without manual scopes", () => {
    const url = new URL(facebookAuthorizationUrl("user-123", businessEnvironment));
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

  it("keeps every required scope even when an environment override is incomplete", () => {
    const url = new URL(
      facebookAuthorizationUrl("user-123", {
        ...environment,
        META_LOGIN_MODE: "classic",
        META_LOGIN_SCOPES: "pages_read_engagement,pages_manage_posts,unknown_scope",
      }),
    );
    expect(url.searchParams.get("scope")).toBe(
      "pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish",
    );
    expect(url.searchParams.get("scope")).not.toContain("unknown_scope");
  });

  it("forces classic mode without config_id and with the exact configured safe scopes", () => {
    const url = new URL(
      facebookAuthorizationUrl("user-123", {
        ...environment,
        META_LOGIN_MODE: "classic",
        META_LOGIN_SCOPES:
          "pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish",
      }),
    );
    expect(url.searchParams.has("config_id")).toBe(false);
    expect(url.searchParams.has("override_default_response_type")).toBe(false);
    expect(url.searchParams.get("scope")).toBe(
      "pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish",
    );
    expect(url.searchParams.get("auth_type")).toBe("rerequest");
  });

  it("defaults to classic and ignores an old config id unless business is explicit", () => {
    expect(facebookLoginMode(environment)).toBe("classic");
    expect(
      facebookOAuthConfiguration({
        ...environment,
      }).configId,
    ).toBeNull();
  });

  it("does not let an override remove scopes required by account discovery", () => {
    const url = new URL(
      facebookAuthorizationUrl("user-123", {
        ...environment,
        META_LOGIN_MODE: "classic",
        META_LOGIN_SCOPES:
          "unknown_scope,instagram_content_publish,pages_read_engagement,pages_show_list,instagram_content_publish",
      }),
    );
    expect(url.searchParams.get("scope")).toBe(
      "pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish",
    );
  });

  it("uses the complete safe allowlist when no scope override exists", () => {
    const url = new URL(
      facebookAuthorizationUrl("user-123", {
        ...environment,
        META_LOGIN_MODE: "classic",
        META_LOGIN_SCOPES: undefined,
      }),
    );
    expect(url.searchParams.get("scope")?.split(",")).toEqual([
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "instagram_basic",
      "instagram_content_publish",
    ]);
  });

  it("falls back to the safe allowlist when an override contains only invalid scopes", () => {
    const url = new URL(
      facebookAuthorizationUrl("user-123", {
        ...environment,
        META_LOGIN_MODE: "classic",
        META_LOGIN_SCOPES: "pages_read_engagement,unknown_scope",
      }),
    );
    expect(url.searchParams.get("scope")).toBe(
      "pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish",
    );
  });

  it("returns only safe diagnostics", () => {
    const diagnostics = diagnoseFacebookOAuth(environment);
    expect(diagnostics).toEqual({
      ready: true,
      flowVersion: "facebook-login-v2",
      graphVersion: "v26.0",
      redirectOrigin: "https://content-layer-lab.lovable.app",
      redirectPath: "/integracoes/facebook/callback",
      mode: "classic",
      usesConfigId: false,
      requestedScopes: [
        "pages_show_list",
        "pages_read_engagement",
        "pages_manage_posts",
        "instagram_basic",
        "instagram_content_publish",
      ],
    });
    expect(JSON.stringify(diagnostics)).not.toContain("37730893806558210");
    expect(JSON.stringify(diagnostics)).not.toContain("2291311094966424");
    expect(JSON.stringify(diagnostics)).not.toContain("server-only-secret");
  });

  it("reports that classic mode ignores a configured business login", () => {
    const diagnostics = facebookConfigChecklist({
      ...environment,
      META_LOGIN_MODE: "classic",
      META_LOGIN_SCOPES:
        "pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish",
    });
    expect(diagnostics.mode).toBe("classic");
    expect(diagnostics.usesConfigId).toBe(false);
    expect(diagnostics.configId).toBeNull();
    expect(diagnostics.effectiveScopes).toEqual([
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "instagram_basic",
      "instagram_content_publish",
    ]);
    expect(diagnostics.permissionWarning).toContain("App Dashboard");
  });

  it("reports that business mode delegates permissions to the Meta configuration", () => {
    const diagnostics = facebookConfigChecklist(businessEnvironment);
    expect(diagnostics.mode).toBe("business");
    expect(diagnostics.usesConfigId).toBe(true);
    expect(diagnostics.effectiveScopes).toEqual([]);
    expect(diagnostics.permissionWarning).toContain("pages_read_engagement");
  });

  it("rejects malformed IDs and callback URLs before redirecting", () => {
    expect(() =>
      facebookAuthorizationUrl("user-123", {
        ...businessEnvironment,
        META_LOGIN_CONFIG_ID: "wrong",
      }),
    ).toThrow("ID da configuração empresarial");
    expect(() =>
      facebookAuthorizationUrl("user-123", {
        ...environment,
        FACEBOOK_REDIRECT_URI: "http://content-layer-lab.lovable.app/integracoes/facebook/callback",
      }),
    ).toThrow("deve ser HTTPS");
    expect(() =>
      facebookAuthorizationUrl("user-123", {
        ...environment,
        FACEBOOK_REDIRECT_URI:
          "https://content-layer-lab.lovable.app/integracoes/instagram/callback",
      }),
    ).toThrow("terminar exatamente");
  });

  it("requires config id only when business mode is explicitly selected", () => {
    expect(() =>
      facebookOAuthConfiguration({
        ...environment,
        META_LOGIN_MODE: "business",
        META_LOGIN_CONFIG_ID: undefined,
      }),
    ).toThrow("META_LOGIN_CONFIG_ID");
  });

  it("binds state to the signed-in user and expires it", () => {
    const state = createFacebookOAuthState("user-123", environment, 1_000);
    expect(() => verifyFacebookOAuthState(state, "user-123", environment, 2_000)).not.toThrow();
    expect(() => verifyFacebookOAuthState(state, "other-user", environment, 2_000)).toThrow();
    expect(() => verifyFacebookOAuthState(state, "user-123", environment, 700_000)).toThrow();
  });

  it("exchanges the returned code with the exact callback", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "short", expires_in: 3600 })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "long", expires_in: 5_184_000 })),
      );
    const result = await exchangeFacebookAuthorizationCode({
      code: "authorization-code#_",
      environment,
      fetch: request,
      now: 1_000,
    });
    expect(result.accessToken).toBe("long");
    const firstUrl = new URL(String(request.mock.calls[0]?.[0]));
    const firstInit = request.mock.calls[0]?.[1];
    const firstBody = new URLSearchParams(String(firstInit?.body));
    expect(firstUrl.search).toBe("");
    expect(firstInit?.method).toBe("POST");
    expect(firstBody.get("redirect_uri")).toBe(environment["FACEBOOK_REDIRECT_URI"]);
    expect(firstBody.get("code")).toBe("authorization-code");
  });

  it("accepts a valid token only when every publishing scope was granted", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            app_id: environment["META_APP_ID"],
            is_valid: true,
            scopes: [
              "pages_show_list",
              "pages_read_engagement",
              "pages_manage_posts",
              "instagram_basic",
              "instagram_content_publish",
            ],
          },
        }),
      ),
    );
    await expect(
      validateFacebookAccessTokenScopes({
        accessToken: "user-token",
        environment,
        fetch: request,
      }),
    ).resolves.toContain("pages_read_engagement");
  });

  it("explains which permission is missing before account discovery", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            app_id: environment["META_APP_ID"],
            is_valid: true,
            scopes: [
              "pages_show_list",
              "pages_manage_posts",
              "instagram_basic",
              "instagram_content_publish",
            ],
          },
        }),
      ),
    );
    await expect(
      validateFacebookAccessTokenScopes({
        accessToken: "user-token",
        environment,
        fetch: request,
      }),
    ).rejects.toThrow("pages_read_engagement");
  });

  it("discovers both Facebook Pages and linked Instagram Business accounts", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "page-1",
              name: "Minha Página",
              access_token: "page-token",
              instagram_business_account: { id: "ig-1", username: "Minha.Conta" },
            },
          ],
        }),
      ),
    );
    await expect(
      fetchFacebookPages({ accessToken: "user-token", environment, fetch: request }),
    ).resolves.toEqual([
      {
        pageId: "page-1",
        name: "Minha Página",
        pageAccessToken: "page-token",
        instagram: { id: "ig-1", username: "minha.conta" },
      },
    ]);
  });
});
