import type { PublishInput, PublishResult } from "@/lib/publish.server";
import {
  canPublish,
  retryDelaySeconds,
  type PostKind,
  type PublishErrorCode,
  type SocialProvider,
} from "@/lib/publishing";

export type ClaimedPost = {
  id: string;
  user_id: string;
  account_id: string | null;
  kind: string;
  caption: string;
  video_url: string | null;
  video_path: string | null;
  media_type?: string | null;
  attempts: number;
};

export type PublishingAccount = {
  id: string;
  user_id: string;
  platform: string;
  username: string;
  provider: string;
  provider_account_id: string | null;
};

export type PublishingConnection = {
  id: string;
  provider: string;
  provider_account_id: string | null;
  status: string;
  expires_at: string | null;
};

export type PostUpdate = {
  status?: string;
  published_at?: string | null;
  permalink?: string | null;
  provider_post_id?: string | null;
  error?: string | null;
  error_code?: string | null;
  lock_id?: string | null;
  locked_at?: string | null;
  next_attempt_at?: string | null;
  provider_container_id?: string | null;
};

export type QueueDependencies = {
  claim: (lockId: string, limit: number, lockTimeoutSeconds: number, maxAttempts: number) => Promise<ClaimedPost[]>;
  loadAccount: (accountId: string) => Promise<PublishingAccount | null>;
  loadConnection: (accountId: string, userId: string) => Promise<PublishingConnection | null>;
  loadProviderAccessToken?: (connection: PublishingConnection) => Promise<ProviderCredential | null>;
  /** Container Meta pendente de uma tentativa anterior, para não reenviar o vídeo. */
  loadPendingContainerId?: (postId: string) => Promise<string | null>;
  /** Metadados extras do agendamento (título/descrição/tags/legenda do YouTube). */
  loadPublishMeta?: (postId: string) => Promise<PublishInput["youtube"] | null>;
  createSignedUrl: (videoPath: string, expiresInSeconds: number) => Promise<string>;
  removeStorageObject?: (videoPath: string) => Promise<void>;
  publish: (input: PublishInput) => Promise<PublishResult>;
  updateClaimedPost: (postId: string, lockId: string, update: PostUpdate) => Promise<void>;
  now: () => Date;
  log: (entry: Record<string, unknown>) => void;
};

export type QueueResult = { processed: number; published: number; retrying: number; failed: number };

/** Credencial resolvida da conexão; tokenKind distingue Login do Instagram de token de Página do Facebook. */
export type ProviderCredential = {
  accessToken: string;
  tokenKind?: "instagram_login" | "facebook_page";
};

function provider(value: string): SocialProvider {
  return value === "ayrshare" || value === "meta" || value === "tiktok" || value === "youtube"
    ? value
    : "pending";
}

function failure(code: PublishErrorCode, error: string, retryable = false): PublishResult {
  return { ok: false, code, error, retryable };
}

export async function publishClaimedPost(post: ClaimedPost, deps: QueueDependencies): Promise<PublishResult> {
  if (!post.account_id) return failure("ACCOUNT_MISMATCH", "O agendamento não possui uma conta válida.");
  const account = await deps.loadAccount(post.account_id);
  if (!account || account.user_id !== post.user_id) {
    return failure("ACCOUNT_MISMATCH", "A conta selecionada não pertence ao agendamento.");
  }

  const connection = await deps.loadConnection(account.id, post.user_id);
  if (connection?.expires_at && new Date(connection.expires_at) <= deps.now()) {
    return failure("AUTH_EXPIRED", "A conexão social expirou.");
  }
  if (connection && connection.status !== "conectado") {
    return failure("ACCOUNT_NOT_CONNECTED", "A conta social exige atenção antes de publicar.");
  }
  if (!canPublish(account.platform, post.kind as PostKind)) {
    return failure("CAPABILITY_UNAVAILABLE", "A plataforma não suporta este formato de publicação.");
  }

  const selectedProvider = provider(connection?.provider ?? account.provider);
  const needsToken = selectedProvider === "meta" || selectedProvider === "youtube";
  const credential = needsToken && connection && deps.loadProviderAccessToken
    ? await deps.loadProviderAccessToken(connection)
    : undefined;
  const providerAccessToken = credential?.accessToken;
  if (needsToken && deps.loadProviderAccessToken && !providerAccessToken) {
    return failure(
      "AUTH_INVALID",
      selectedProvider === "youtube"
        ? "A credencial do canal do YouTube não está disponível. Reconecte o canal."
        : "A credencial da conexão Meta não está disponível. Reconecte a Página/Instagram.",
    );
  }

  let videoUrl: string;
  if (post.video_path) {
    try {
      videoUrl = await deps.createSignedUrl(post.video_path, 6 * 60 * 60);
    } catch {
      return failure("MEDIA_NOT_FOUND", "O arquivo de vídeo não está disponível.");
    }
  } else if (post.video_url) {
    // Compatibility only for records created before video_path existed.
    videoUrl = post.video_url;
  } else {
    return failure("MEDIA_NOT_FOUND", "O agendamento não possui um vídeo.");
  }

  const youtubeMeta = deps.loadPublishMeta ? await deps.loadPublishMeta(post.id) : null;

  const pendingContainerId = deps.loadPendingContainerId
    ? await deps.loadPendingContainerId(post.id)
    : null;

  return deps.publish({
    accountId: account.id,
    kind: post.kind as PostKind,
    caption: post.caption,
    videoUrl,
    mediaType: post.media_type === "image" ? "image" : "video",
    username: account.username,
    platform: account.platform,
    provider: selectedProvider,
    providerAccountId: connection?.provider_account_id ?? account.provider_account_id,
    ...(providerAccessToken ? { providerAccessToken } : {}),
    ...(credential?.tokenKind ? { metaTokenKind: credential.tokenKind } : {}),
    idempotencyKey: post.id,
    ...(pendingContainerId ? { pendingContainerId } : {}),
    ...(youtubeMeta ? { youtube: youtubeMeta } : {}),
  });
}

export async function runPublishQueue(
  deps: QueueDependencies,
  options: { lockId: string; limit: number; lockTimeoutSeconds: number; maxAttempts: number },
): Promise<QueueResult> {
  const due = await deps.claim(options.lockId, options.limit, options.lockTimeoutSeconds, options.maxAttempts);
  const summary: QueueResult = { processed: due.length, published: 0, retrying: 0, failed: 0 };

  for (const post of due) {
    const startedAt = Date.now();
    let result: PublishResult;
    try {
      result = await publishClaimedPost(post, deps);
    } catch {
      result = failure("DATABASE_ERROR", "Falha temporária durante a publicação.", true);
    }

    if (result.ok) {
      if (post.video_path && deps.removeStorageObject) {
        try {
          await deps.removeStorageObject(post.video_path);
        } catch {
          deps.log({
            event: "publish_storage_cleanup_failed",
            postId: post.id,
            path: post.video_path,
          });
        }
      }
      await deps.updateClaimedPost(post.id, options.lockId, {
        status: "publicado",
        published_at: deps.now().toISOString(),
        permalink: result.permalink ?? null,
        provider_post_id: result.providerPostId ?? null,
        error: null,
        error_code: null,
        lock_id: null,
        locked_at: null,
        next_attempt_at: null,
        provider_container_id: null,
      });
      summary.published++;
    } else {
      const shouldRetry = result.retryable && post.attempts < options.maxAttempts;
      await deps.updateClaimedPost(post.id, options.lockId, {
        status: shouldRetry ? "agendado" : "falhou",
        error: result.error.slice(0, 500),
        error_code: shouldRetry || result.code !== "PROVIDER_TEMPORARY_ERROR" ? result.code : "RETRY_EXHAUSTED",
        next_attempt_at: shouldRetry
          ? new Date(deps.now().getTime() + retryDelaySeconds(post.attempts) * 1000).toISOString()
          : null,
        lock_id: null,
        locked_at: null,
        provider_container_id: shouldRetry ? (result.pendingContainerId ?? null) : null,
      });
      if (shouldRetry) summary.retrying++;
      else summary.failed++;
    }

    deps.log({
      event: "publish_attempt_finished",
      postId: post.id,
      accountId: post.account_id,
      attempt: post.attempts,
      durationMs: Date.now() - startedAt,
      outcome: result.ok ? "published" : result.code,
    });
  }
  return summary;
}
