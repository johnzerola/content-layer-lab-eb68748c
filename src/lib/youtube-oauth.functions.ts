import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MetaLinkError, linkingServerRuntimeReady } from "@/lib/social-linking.server";
import {
  exchangeYoutubeAuthorizationCode,
  fetchYoutubeChannels,
  youtubeAuthorizationUrl,
  youtubeConfigured,
  verifyYoutubeOAuthState,
} from "@/lib/youtube-oauth.server";
import { persistYoutubeAccount } from "@/lib/youtube-persistence.server";
import { syncYoutubeChannelsForUser } from "@/lib/youtube-sync.server";

function oauthError(error: unknown) {
  if (error instanceof MetaLinkError) {
    return { ok: false as const, code: error.code, error: error.message };
  }
  return {
    ok: false as const,
    code: "META_AUTH_INVALID" as const,
    error: "Não foi possível conectar o YouTube.",
  };
}

export const youtubeIntegrationStatus = createServerFn({ method: "GET" }).handler(async () => ({
  configured: youtubeConfigured(),
}));

export const beginYoutubeOAuth = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      return { ok: true as const, authorizationUrl: youtubeAuthorizationUrl(context.userId) };
    } catch (error) {
      return oauthError(error);
    }
  });

export const completeYoutubeOAuth = createServerFn({ method: "POST" })
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
      verifyYoutubeOAuthState(data.state, context.userId);
      const tokens = await exchangeYoutubeAuthorizationCode({ code: data.code });
      // Importa todos os canais da conta Google (principal + canais de marca).
      const channels = await fetchYoutubeChannels({ accessToken: tokens.accessToken });
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const accounts = [];
      for (const channel of channels) {
        accounts.push(
          await persistYoutubeAccount(supabaseAdmin as never, {
            userId: context.userId,
            channel,
            tokens,
          }),
        );
      }
      return {
        ok: true as const,
        accounts,
        summary: { channels: channels.map((channel) => channel.title) },
      };
    } catch (error) {
      return oauthError(error);
    }
  });

/** Relista todos os canais autorizados e atualiza cada conexão separadamente. */
export const syncYoutubeChannels = createServerFn({ method: "POST" })
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
      const { accounts, channels } = await syncYoutubeChannelsForUser(
        supabaseAdmin as never,
        context.userId,
      );
      return { ok: true as const, accounts, summary: { channels } };
    } catch (error) {
      return oauthError(error);
    }
  });
