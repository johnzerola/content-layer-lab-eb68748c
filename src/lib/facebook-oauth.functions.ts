import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertCompleteFacebookPageDiscovery,
  diagnoseFacebookOAuth,
  exchangeFacebookAuthorizationCode,
  facebookAuthorizationUrl,
  fetchFacebookPages,
  fetchUnavailablePageNames,
  validateFacebookAccessTokenScopes,
  verifyFacebookOAuthState,
} from "@/lib/facebook-oauth.server";
import { persistFacebookPages } from "@/lib/facebook-persistence.server";
import {
  createMetaSelection,
  metaSelectionCandidates,
  openMetaSelection,
} from "@/lib/meta-selection.server";
import { MetaLinkError, linkingServerRuntimeReady } from "@/lib/social-linking.server";

export const beginFacebookOAuth = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        forceClassic: z.boolean().optional(),
      })
      .optional()
      .parse(data) ?? {},
  )
  .handler(async ({ data, context }) => {
    try {
      const forceClassic = data.forceClassic === true;
      const configuredDiagnostics = diagnoseFacebookOAuth();
      const authorizationUrl = facebookAuthorizationUrl(context.userId, process.env, {
        forceClassic,
      });
      const parsedUrl = new URL(authorizationUrl);
      const diagnostics = forceClassic
        ? ({
            ...configuredDiagnostics,
            mode: "classic",
            usesConfigId: false,
            requestedScopes: parsedUrl.searchParams.get("scope")?.split(",").filter(Boolean) ?? [],
          } as const)
        : configuredDiagnostics;
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
        fallbackUsed: forceClassic,
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
      assertCompleteFacebookPageDiscovery(authorization, discovery);
      if (discovery.pages.length === 0) {
        const selectedDetail =
          authorization.authorizedPageIds.length > 0
            ? ` A Meta confirmou ${authorization.authorizedPageIds.length} Página(s), mas não liberou o token de publicação para elas.`
            : "";
        const diagnosticDetail =
          discovery.diagnostics.length > 0
            ? ` Detalhe da Meta: ${discovery.diagnostics.join(" ")}`
            : "";
        const instagramDetail =
          authorization.authorizedInstagramIds.length > 0
            ? ` A Meta confirmou ${authorization.authorizedInstagramIds.length} Instagram, mas o Instagram só publica quando a Página vinculada também libera token.`
            : "";
        throw new MetaLinkError(
          "META_ACCOUNT_MISMATCH",
          `Nenhuma Página publicável foi devolvida.${selectedDetail}${instagramDetail}${diagnosticDetail} Clique em Editar configurações no diálogo da Meta, marque as Páginas vinculadas aos Instagrams desejados e confirme que você tem controle total dessas Páginas no Gerenciador de Negócios.`,
        );
      }

      const unavailablePages = await fetchUnavailablePageNames({
        pageIds: discovery.unavailablePageIds,
        accessToken: token.accessToken,
      });
      const selection = createMetaSelection({
        userId: context.userId,
        pages: discovery.pages,
        tokenExpiresAt: token.expiresAt,
      });
      return {
        ok: true as const,
        selectionToken: selection.selectionToken,
        candidates: selection.candidates,
        summary: {
          facebook: discovery.pages.map((page) => page.name),
          instagram: discovery.pages.flatMap((page) =>
            page.instagram ? [page.instagram.username] : [],
          ),
          selectedPageCount: discovery.authorizedPageIds.length,
          unavailablePageIds: discovery.unavailablePageIds,
          unavailablePages,
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

/** Relista Páginas e Instagram já autorizados, atualizando cada conexão. */
export const syncMetaAccounts = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      if (!linkingServerRuntimeReady()) {
        throw new MetaLinkError(
          "SERVER_CONFIG_MISSING",
          "A integração segura do servidor não está configurada.",
        );
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { syncMetaAccountsForUser } = await import("@/lib/meta-sync.server");
      const result = await syncMetaAccountsForUser(supabaseAdmin as never, context.userId);
      return {
        ok: true as const,
        accounts: result.accounts,
        summary: {
          facebook: result.facebook,
          instagram: result.instagram,
          failed: result.failed,
        },
      };
    } catch (error) {
      if (error instanceof MetaLinkError) {
        return { ok: false as const, code: error.code, error: error.message };
      }
      return {
        ok: false as const,
        code: "META_AUTH_INVALID" as const,
        error: "Não foi possível sincronizar as contas Meta.",
      };
    }
  });

/**
 * Persiste somente os canais escolhidos. O pacote temporário é criptografado,
 * vinculado ao usuário e expira rapidamente.
 */
export const applyMetaAccountSelection = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        selectionToken: z.string().min(20).max(1_000_000),
        keep: z
          .array(z.string().regex(/^(facebook|instagram):\d+$/))
          .min(1)
          .max(400),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    try {
      if (!linkingServerRuntimeReady()) {
        throw new MetaLinkError(
          "SERVER_CONFIG_MISSING",
          "A integração segura do servidor não está configurada.",
        );
      }
      const payload = openMetaSelection({
        selectionToken: data.selectionToken,
        userId: context.userId,
      });
      const candidates = metaSelectionCandidates(payload.pages);
      const allowed = new Set(candidates.map((candidate) => candidate.key));
      const keep = [...new Set(data.keep)];
      if (keep.some((key) => !allowed.has(key))) {
        throw new MetaLinkError(
          "ACCOUNT_OWNERSHIP_INVALID",
          "A seleção contém uma conta que não foi autorizada.",
        );
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const accounts = await persistFacebookPages(supabaseAdmin as never, {
        userId: context.userId,
        pages: payload.pages,
        expiresAt: new Date(payload.tokenExpiresAt),
        selectedChannelKeys: keep,
      });

      const removed = candidates.filter((candidate) => !keep.includes(candidate.key));
      for (const platform of ["facebook", "instagram"] as const) {
        const providerIds = removed
          .filter((candidate) => candidate.platform === platform)
          .map((candidate) => candidate.providerAccountId);
        if (providerIds.length === 0) continue;
        const { error } = await supabaseAdmin
          .from("social_accounts")
          .delete()
          .eq("user_id", context.userId)
          .eq("provider", "meta")
          .eq("platform", platform)
          .in("provider_account_id", providerIds);
        if (error) {
          throw new MetaLinkError(
            "DATABASE_ERROR",
            "Os canais escolhidos foram salvos, mas não foi possível remover todos os desmarcados.",
          );
        }
      }

      return {
        ok: true as const,
        accounts,
        removed: removed.length,
        summary: {
          facebook: accounts.filter((account) => account.platform === "facebook").length,
          instagram: accounts.filter((account) => account.platform === "instagram").length,
        },
      };
    } catch (error) {
      if (error instanceof MetaLinkError) {
        return { ok: false as const, code: error.code, error: error.message };
      }
      return {
        ok: false as const,
        code: "DATABASE_ERROR" as const,
        error: "Não foi possível aplicar a seleção.",
      };
    }
  });
