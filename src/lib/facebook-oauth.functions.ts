import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  diagnoseFacebookOAuth,
  exchangeFacebookAuthorizationCode,
  facebookAuthorizationUrl,
  fetchFacebookPages,
  verifyFacebookOAuthState,
} from "@/lib/facebook-oauth.server";
import { persistFacebookPages } from "@/lib/facebook-persistence.server";
import { MetaLinkError, linkingServerRuntimeReady } from "@/lib/social-linking.server";

export const beginFacebookOAuth = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const diagnostics = diagnoseFacebookOAuth();
      return {
        ok: true as const,
        authorizationUrl: facebookAuthorizationUrl(context.userId),
        diagnostics,
      };
    } catch (error) {
      if (error instanceof MetaLinkError) {
        return { ok: false as const, code: error.code, error: error.message };
      }
      return {
        ok: false as const,
        code: "META_AUTH_INVALID" as const,
        error: "Não foi possível validar a configuração do Facebook.",
      };
    }
  });

export const completeFacebookOAuth = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ code: z.string().min(1).max(2048), state: z.string().min(1).max(4096) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    try {
      if (!linkingServerRuntimeReady()) {
        throw new MetaLinkError(
          "SERVER_CONFIG_MISSING",
          "A integração segura do servidor não está configurada.",
        );
      }
      verifyFacebookOAuthState(data.state, context.userId);
      const token = await exchangeFacebookAuthorizationCode({ code: data.code });
      const pages = await fetchFacebookPages({ accessToken: token.accessToken });
      if (pages.length === 0) {
        throw new MetaLinkError(
          "META_ACCOUNT_MISMATCH",
          "Nenhuma Página do Facebook foi autorizada. Refaça o login e marque as Páginas desejadas.",
        );
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const accounts = await persistFacebookPages(supabaseAdmin as never, {
        userId: context.userId,
        pages,
        expiresAt: token.expiresAt,
      });
      return { ok: true as const, accounts };
    } catch (error) {
      if (error instanceof MetaLinkError) {
        return { ok: false as const, code: error.code, error: error.message };
      }
      return {
        ok: false as const,
        code: "META_AUTH_INVALID" as const,
        error: "Não foi possível conectar o Facebook.",
      };
    }
  });
