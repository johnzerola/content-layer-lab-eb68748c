import type { QueueDependencies } from "@/lib/publish-queue.server";
import { resolveMetaAccessToken } from "@/lib/social-credentials.server";

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOCK_TIMEOUT_SECONDS = 15 * 60;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function publishQueueLimits() {
  return {
    maxAttempts: positiveInteger(process.env["PUBLISH_MAX_ATTEMPTS"], DEFAULT_MAX_ATTEMPTS),
    lockTimeoutSeconds: positiveInteger(
      process.env["PUBLISH_LOCK_TIMEOUT_SECONDS"],
      DEFAULT_LOCK_TIMEOUT_SECONDS,
    ),
  };
}

/** Shared service-role dependencies used by the cron queue and by "publicar agora". */
export async function createPublishDependencies(): Promise<QueueDependencies> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { publish } = await import("@/lib/publish.server");

  return {
    claim: async (lockId, limit, lockTimeout, maximumAttempts) => {
      const { data, error } = await supabaseAdmin.rpc("claim_due_scheduled_posts", {
        p_lock_id: lockId,
        p_limit: limit,
        p_lock_timeout_seconds: lockTimeout,
        p_max_attempts: maximumAttempts,
      });
      if (error) throw new Error("claim failed");
      return data ?? [];
    },
    loadAccount: async (accountId) => {
      const { data, error } = await supabaseAdmin
        .from("social_accounts")
        .select("id,user_id,platform,username,provider,provider_account_id")
        .eq("id", accountId)
        .maybeSingle();
      if (error) throw new Error("account lookup failed");
      return data;
    },
    loadConnection: async (accountId, userId) => {
      const { data, error } = await supabaseAdmin
        .from("social_connections")
        .select("id,provider,provider_account_id,status,expires_at")
        .eq("social_account_id", accountId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error("connection lookup failed");
      return data;
    },
    loadProviderAccessToken: async (connection) => {
      if (connection.provider === "youtube") {
        const { data, error } = await supabaseAdmin
          .from("social_connection_credentials")
          .select("refresh_token_ciphertext")
          .eq("connection_id", connection.id)
          .maybeSingle();
        if (error || !data?.refresh_token_ciphertext) return null;
        const { decryptSocialToken } = await import("@/lib/social-credentials.server");
        const { refreshYoutubeAccessToken } = await import("@/lib/youtube-oauth.server");
        try {
          const refreshToken = decryptSocialToken(data.refresh_token_ciphertext);
          const refreshed = await refreshYoutubeAccessToken({ refreshToken });
          return refreshed.accessToken ?? null;
        } catch {
          return null;
        }
      }
      if (connection.provider !== "meta") return null;
      const { data, error } = await supabaseAdmin
        .from("social_connection_credentials")
        .select("access_token_ciphertext,expires_at")
        .eq("connection_id", connection.id)
        .maybeSingle();
      if (error || !data) return null;
      return resolveMetaAccessToken({
        ciphertext: data.access_token_ciphertext,
        expiresAt: data.expires_at,
        persistRefresh: async (ciphertext, expiresAt) => {
          const { error: credentialError } = await supabaseAdmin
            .from("social_connection_credentials")
            .update({ access_token_ciphertext: ciphertext, expires_at: expiresAt })
            .eq("connection_id", connection.id);
          const { error: connectionError } = await supabaseAdmin
            .from("social_connections")
            .update({ expires_at: expiresAt })
            .eq("id", connection.id);
          if (credentialError || connectionError) throw new Error("credential refresh persistence failed");
        },
      });
    },
    createSignedUrl: async (videoPath, expiresInSeconds) => {
      const { data, error } = await supabaseAdmin.storage
        .from("posts")
        .createSignedUrl(videoPath, expiresInSeconds);
      if (error || !data?.signedUrl) throw new Error("signed URL failed");
      return data.signedUrl;
    },
    removeStorageObject: async (videoPath) => {
      const { error } = await supabaseAdmin.storage.from("posts").remove([videoPath]);
      if (error) throw new Error("storage cleanup failed");
    },
    publish,
    updateClaimedPost: async (postId, lockId, update) => {
      const { data, error } = await supabaseAdmin
        .from("scheduled_posts")
        .update(update)
        .eq("id", postId)
        .eq("lock_id", lockId)
        .select("id")
        .maybeSingle();
      if (error || !data) throw new Error("result update failed");
    },
    now: () => new Date(),
    log: (entry) => console.info(JSON.stringify(entry)),
  };
}
