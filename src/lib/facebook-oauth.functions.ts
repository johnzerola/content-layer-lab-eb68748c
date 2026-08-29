import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  diagnoseFacebookOAuth,
  exchangeFacebookAuthorizationCode,
  facebookAuthorizationUrl,
  fetchFacebookPages,
  validateFacebookAccessTokenScopes,
  verifyFacebookOAuthState,
} from "@/lib/facebook-oauth.server";
import { persistFacebookPages } from "@/lib/facebook-persistence.server";
import { MetaLinkError, linkingServerRuntimeReady } from "@/lib/social-linking.server";

export const beginFacebookOAuth = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const diagnostics = diagnoseFacebookOAuth();
      const authorizationUrl = facebookAuthorizationUrl(context.userId);
      const parsedUrl = new URL(authorizationUrl);
      if (
        diagnostics.mode === "classic" &&
        parsedUrl.searchParams.get("scope") !== diagnostics.requestedScopes.join(",")
      ) {
        throw new MetaLinkError(
          "SERVER_CONFIG_MISSING",
          "A URL OAuth gerada não contém as permissões obrigatórias.",
        );
      }
      return {
        ok: true as const,
        authorizationUrl,
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
      const authorization = await validateFacebookAccessTokenScopes({
        accessToken: token.accessToken,
      });
      const discovery = await fetchFacebookPages({
        accessToken: token.accessToken,
        authorizedPageIds: authorization.authorizedPageIds,
      });
      if (discovery.pages.length === 0) {
        const selectedDetail =
          authorization.authorizedPageIds.length > 0
            ? ` A Meta confirmou ${authorization.authorizedPageIds.length} Página(s), mas não liberou o token de publicação para elas.`
            : "";
        throw new MetaLinkError(
          "META_ACCOUNT_MISMATCH",
          `Nenhuma Página publicável foi devolvida.${selectedDetail} Confirme o controle total das Páginas e refaça o login.`,
        );
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const accounts = await persistFacebookPages(supabaseAdmin as never, {
        userId: context.userId,
        pages: discovery.pages,
        expiresAt: token.expiresAt,
      });
      return {
        ok: true as const,
        accounts,
        summary: {
          facebook: discovery.pages.map((page) => page.name),
          instagram: discovery.pages.flatMap((page) =>
            page.instagram ? [page.instagram.username] : [],
          ),
          selectedPageCount: discovery.authorizedPageIds.length,
          unavailablePageIds: discovery.unavailablePageIds,
          selectedInstagramCount: authorization.authorizedInstagramIds.length,
        },
      };
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

/** Diagnóstico da integração Meta (somente admin). */
export const diagnoseFacebookIntegration = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) {
      return { ok: false as const, error: "Apenas administradores podem ver o diagnóstico." };
    }
    const { facebookConfigChecklist, verifyFacebookLoginConfiguration } =
      await import("@/lib/facebook-oauth.server");
    const checklist = facebookConfigChecklist();
    const loginConfiguration = await verifyFacebookLoginConfiguration();
    return { ok: true as const, check: { ...checklist, loginConfiguration } };
  });
