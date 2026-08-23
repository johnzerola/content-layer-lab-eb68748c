import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MetaLinkError, linkingServerRuntimeReady } from "@/lib/social-linking.server";
import {
  exchangeTikTokAuthorizationCode,
  fetchTikTokProfile,
  tiktokAuthorizationUrl,
  tiktokConfigured,
  verifyTikTokOAuthState,
} from "@/lib/tiktok-oauth.server";
import { persistTikTokAccount } from "@/lib/tiktok-persistence.server";

function oauthError(error: unknown) {
  if (error instanceof MetaLinkError) {
    return { ok: false as const, code: error.code, error: error.message };
  }
  return {
    ok: false as const,
    code: "META_AUTH_INVALID" as const,
    error: "Não foi possível conectar o TikTok.",
  };
}

export const tiktokIntegrationStatus = createServerFn({ method: "GET" }).handler(async () => ({
  configured: tiktokConfigured(),
}));

export const beginTikTokOAuth = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      return { ok: true as const, authorizationUrl: tiktokAuthorizationUrl(context.userId) };
    } catch (error) {
      return oauthError(error);
    }
  });

export const completeTikTokOAuth = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ code: z.string().min(1).max(4096), state: z.string().min(1).max(4096) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    try {
      if (!linkingServerRuntimeReady()) {
        throw new MetaLinkError(
          "SERVER_CONFIG_MISSING",
          "A integração segura do servidor não está configurada.",
        );
      }
      verifyTikTokOAuthState(data.state, context.userId);
      const tokens = await exchangeTikTokAuthorizationCode({ code: data.code });
      const profile = await fetchTikTokProfile({ accessToken: tokens.accessToken });
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const account = await persistTikTokAccount(supabaseAdmin as never, {
        userId: context.userId,
        profile,
        tokens,
      });
      return { ok: true as const, accounts: [account] };
    } catch (error) {
      return oauthError(error);
    }
  });
