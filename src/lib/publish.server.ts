import type { PostKind, PublishErrorCode, SocialProvider } from "@/lib/publishing";
import { facebookGraphBase, globalMetaCredentials, metaGraphBase } from "@/lib/meta.server";

const YOUTUBE_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";

export type PublishInput = {
  kind: PostKind;
  caption: string;
  videoUrl: string;
  mediaType?: "video" | "image";
  username: string;
  accountId?: string;
  platform?: string;
  provider?: SocialProvider;
  providerAccountId?: string | null;
  providerAccessToken?: string;
  idempotencyKey?: string;
  /** Container Meta já criado numa tentativa anterior; evita duplicar a mídia. */
  pendingContainerId?: string | null;
  /** Tipo de credencial Meta: Login do Instagram (graph.instagram.com) ou Página do Facebook (graph.facebook.com). */
  metaTokenKind?: "instagram_login" | "facebook_page";
};

export type PublishResult =
  | { ok: true; permalink?: string; providerPostId?: string }
  | {
      ok: false;
      error: string;
      code: PublishErrorCode;
      retryable: boolean;
      /** Container Meta em processamento que a próxima tentativa deve reaproveitar. */
      pendingContainerId?: string;
    };


type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function nestedString(value: unknown, path: string[]): string | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (Array.isArray(current)) {
      const index = Number(key);
      current = Number.isInteger(index) ? current[index] : undefined;
    } else {
      current = asObject(current)?.[key];
    }
  }
  return typeof current === "string" ? current : undefined;
}

function providerFailure(provider: string, status: number, payload: unknown): PublishResult {
  const detail = JSON.stringify(payload)?.slice(0, 300) ?? "resposta invalida";
  if (status === 401 || status === 403) {
    return { ok: false, code: "AUTH_INVALID", retryable: false, error: `${provider}: credencial invalida.` };
  }
  if (status === 429) {
    return { ok: false, code: "PROVIDER_RATE_LIMIT", retryable: true, error: `${provider}: limite temporario atingido.` };
  }
  if (status >= 500) {
    return { ok: false, code: "PROVIDER_TEMPORARY_ERROR", retryable: true, error: `${provider} [${status}]: ${detail}` };
  }
  return { ok: false, code: "PROVIDER_PERMANENT_ERROR", retryable: false, error: `${provider} [${status}]: ${detail}` };
}

function youtubePrivacyStatus(): "private" | "public" | "unlisted" {
  const configured = process.env["YOUTUBE_PRIVACY_STATUS"]?.trim();
  return configured === "private" || configured === "unlisted" || configured === "public"
    ? configured
    : "public";
}

function youtubeTitle(input: PublishInput): string {
  const firstCaptionLine = input.caption
    .split(/\r?\n/)
    .map((line) => line.replace(/#[\p{L}\p{N}_-]+/gu, "").trim())
    .find(Boolean);
  const title = firstCaptionLine || input.username || "Video";
  return title.replace(/\s+/g, " ").slice(0, 100);
}

export function activeProvider(requested?: SocialProvider): "ayrshare" | "meta" | "youtube" | "tiktok" | null {
  if (requested === "ayrshare") return process.env["AYRSHARE_API_KEY"] ? "ayrshare" : null;
  if (requested === "meta") return process.env["META_ACCESS_TOKEN"] && process.env["META_IG_USER_ID"] ? "meta" : null;
  if (requested === "youtube" || requested === "tiktok") return null;
  
  if (requested && requested !== "pending") return null;
  
  if (process.env["AYRSHARE_API_KEY"]) return "ayrshare";
  if (process.env["META_ACCESS_TOKEN"] && process.env["META_IG_USER_ID"]) return "meta";
  return null;
}

export async function publish(input: PublishInput): Promise<PublishResult> {
  const allowedPlatforms = ["instagram", "youtube", "facebook"];
  if (input.platform && !allowedPlatforms.includes(input.platform)) {
    return {
      ok: false,
      code: "CAPABILITY_UNAVAILABLE",
      retryable: false,
      error: `Publicacao para ${input.platform} ainda nao esta disponivel.`,
    };
  }

  const provider =
    (input.provider === "meta" || input.provider === "youtube") && input.providerAccessToken
      ? input.provider
      : activeProvider(input.provider);
  if (!provider) {
    return {
      ok: false,
      code: "ACCOUNT_NOT_CONNECTED",
      retryable: false,
      error: "A conta ainda nao possui um provedor de publicacao configurado.",
    };
  }

  if (!input.providerAccountId) {
    return {
      ok: false,
      code: "ACCOUNT_NOT_CONNECTED",
      retryable: false,
      error: `Conta @${input.username} nao esta conectada ao provedor ativo (${provider}).`,
    };
  }

  if (input.provider && input.provider !== provider) {
    return {
      ok: false,
      code: "ACCOUNT_MISMATCH",
      retryable: false,
      error: `Conta @${input.username} nao corresponde ao provedor ativo (${provider}).`,
    };
  }

  if (provider === "meta" && !input.providerAccessToken && input.providerAccountId !== process.env["META_IG_USER_ID"]) {
    return {
      ok: false,
      code: "ACCOUNT_MISMATCH",
      retryable: false,
      error: "A credencial Meta configurada nao pertence a conta selecionada.",
    };
  }

  if (input.platform === "facebook") return publishFacebookPage(input);
  if (provider === "youtube") return publishYoutube(input);
  if (provider === "ayrshare") return publishAyrshare(input);
  return publishMeta(input);
}

async function publishYoutube(input: PublishInput): Promise<PublishResult> {
  const token = input.providerAccessToken;
  const channelId = input.providerAccountId;
  if (!token || !channelId) {
    return {
      ok: false,
      code: "AUTH_INVALID",
      retryable: false,
      error: "O canal do YouTube nao possui credencial conectada.",
    };
  }
  if (input.mediaType === "image") {
    return {
      ok: false,
      code: "MEDIA_INVALID",
      retryable: false,
      error: "YouTube aceita apenas video nesta fila.",
    };
  }

  try {
    const uploadUrl = new URL(YOUTUBE_UPLOAD_URL);
    uploadUrl.searchParams.set("part", "snippet,status");
    uploadUrl.searchParams.set("uploadType", "resumable");

    const metadataResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=UTF-8",
        "x-upload-content-type": "video/mp4",
      },
      body: JSON.stringify({
        snippet: {
          title: youtubeTitle(input),
          description: input.caption.slice(0, 5000),
          categoryId: "22",
        },
        status: {
          privacyStatus: youtubePrivacyStatus(),
          selfDeclaredMadeForKids: false,
        },
      }),
    });
    const metadataPayload: unknown = await metadataResponse.json().catch(() => null);
    const resumableUrl = metadataResponse.headers.get("location");
    if (!metadataResponse.ok || !resumableUrl) {
      return providerFailure("YouTube iniciar upload", metadataResponse.status, metadataPayload);
    }

    const mediaResponse = await fetch(input.videoUrl).catch(() => null);
    if (!mediaResponse || !mediaResponse.ok) {
      return {
        ok: false,
        code: "MEDIA_NOT_FOUND",
        retryable: false,
        error: "O arquivo de video nao esta disponivel para envio ao YouTube.",
      };
    }

    const mediaBody = mediaResponse.body ?? await mediaResponse.arrayBuffer();
    const uploadInit: RequestInit & { duplex?: "half" } = {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": mediaResponse.headers.get("content-type") ?? "video/mp4",
      },
      body: mediaBody,
    };
    if (mediaResponse.body) uploadInit.duplex = "half";

    const uploadResponse = await fetch(resumableUrl, uploadInit);
    const uploadPayload: unknown = await uploadResponse.json().catch(() => null);
    const providerPostId = nestedString(uploadPayload, ["id"]);
    if (!uploadResponse.ok || !providerPostId) {
      return providerFailure("YouTube publicar", uploadResponse.status, uploadPayload);
    }

    return {
      ok: true,
      providerPostId,
      permalink: `https://www.youtube.com/watch?v=${providerPostId}`,
    };
  } catch (error) {
    return {
      ok: false,
      code: "PROVIDER_TEMPORARY_ERROR",
      retryable: true,
      error: error instanceof Error ? error.message : "YouTube indisponivel.",
    };
  }
}

async function publishAyrshare(input: PublishInput): Promise<PublishResult> {
  try {
    const res = await fetch("https://api.ayrshare.com/api/post", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env["AYRSHARE_API_KEY"]}`,
      },
      body: JSON.stringify({
        post: input.caption,
        platforms: ["instagram"],
        mediaUrls: [input.videoUrl],
        isVideo: true,
        profileKey: input.providerAccountId,
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
        instagramOptions: input.kind === "stories" ? { stories: true } : { reels: input.kind === "reels" },
      }),
    });
    const payload: unknown = await res.json().catch(() => null);
    if (!res.ok) return providerFailure("Ayrshare", res.status, payload);
    const permalink = nestedString(payload, ["postIds", "0", "postUrl"]);
    const providerPostId = nestedString(payload, ["postIds", "0", "id"]);
    return { ok: true, ...(permalink ? { permalink } : {}), ...(providerPostId ? { providerPostId } : {}) };
  } catch (error) {
    return {
      ok: false,
      code: "PROVIDER_TEMPORARY_ERROR",
      retryable: true,
      error: error instanceof Error ? error.message : "Ayrshare indisponivel.",
    };
  }
}

/**
 * Publica no Instagram Business/Creator (Reels, Stories e Feed).
 * Token da Página conectada -> graph.facebook.com (Page Access Token).
 * Credencial global de Instagram Login -> graph.instagram.com (Bearer).
 */
async function publishMeta(input: PublishInput): Promise<PublishResult> {
  const credentials = globalMetaCredentials();
  // Login do Instagram: Bearer no graph.instagram.com; token de Página: access_token no graph.facebook.com.
  const instagramLogin = input.metaTokenKind === "instagram_login";
  const usesPageToken = Boolean(input.providerAccessToken) && !instagramLogin;
  const token = input.providerAccessToken ?? credentials?.accessToken;
  const igId = usesPageToken || instagramLogin ? input.providerAccountId : credentials?.igUserId;
  if (!token || !igId) {
    return {
      ok: false,
      code: "AUTH_INVALID",
      retryable: false,
      error: "Credencial Meta nao configurada.",
    };
  }
  const graphBase = usesPageToken ? facebookGraphBase() : metaGraphBase();
  const accountBase = `${graphBase}/${igId}`;
  const authorization: Record<string, string> = usesPageToken
    ? {}
    : { authorization: `Bearer ${token}` };
  const withToken = (url: string) =>
    usesPageToken ? `${url}${url.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}` : url;

  try {
    const isImage = input.mediaType === "image";
    const mediaType = input.kind === "stories" ? "STORIES" : isImage ? undefined : "REELS";
    let creationId = input.pendingContainerId ?? undefined;

    if (!creationId) {
      const create = await fetch(withToken(`${accountBase}/media`), {
        method: "POST",
        headers: { "content-type": "application/json", ...authorization },
        body: JSON.stringify({
          ...(mediaType ? { media_type: mediaType } : {}),
          ...(isImage ? { image_url: input.videoUrl } : { video_url: input.videoUrl }),
          caption: input.kind === "stories" ? undefined : input.caption,
        }),
      });
      const created: unknown = await create.json().catch(() => null);
      creationId = nestedString(created, ["id"]);
      if (!create.ok || !creationId) {
        const errorMsg = nestedString(created, ["error", "message"]) || "erro desconhecido";
        return providerFailure("Meta criar container", create.status, { detail: errorMsg });
      }
    }

    let finished = isImage;
    for (let i = 0; !finished && i < 40; i++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const statusResponse = await fetch(withToken(`${graphBase}/${creationId}?fields=status_code`), {
        headers: authorization,
      });
      const statusPayload: unknown = await statusResponse.json().catch(() => null);
      if (!statusResponse.ok) {
        const errorMsg = nestedString(statusPayload, ["error", "message"]) || "erro ao consultar status";
        return providerFailure("Meta consultar container", statusResponse.status, { detail: errorMsg });
      }
      const statusCode = nestedString(statusPayload, ["status_code"]);

      if (statusCode === "FINISHED") {
        finished = true;
        break;
      }
      if (statusCode === "ERROR") {
        const errorMsg = nestedString(statusPayload, ["error_description"]) || "Meta nao processou o video (formato invalido ou erro interno).";
        return {
          ok: false,
          code: "MEDIA_INVALID",
          retryable: false,
          error: errorMsg,
        };
      }
    }
    if (!finished) {
      return {
        ok: false,
        code: "PROVIDER_TEMPORARY_ERROR",
        retryable: true,
        error: "Meta ainda esta processando o video.",
        pendingContainerId: creationId,
      };
    }


    const publishResponse = await fetch(withToken(`${accountBase}/media_publish`), {
      method: "POST",
      headers: { "content-type": "application/json", ...authorization },
      body: JSON.stringify({ creation_id: creationId }),
    });
    const published: unknown = await publishResponse.json().catch(() => null);
    const providerPostId = nestedString(published, ["id"]);
    if (!publishResponse.ok || !providerPostId) {
      const errorMsg = nestedString(published, ["error", "message"]) || "erro ao publicar";
      return providerFailure("Meta publicar", publishResponse.status, { detail: errorMsg });
    }

    const permalink = await instagramPermalink(graphBase, providerPostId, authorization, withToken);
    return { ok: true, providerPostId, ...(permalink ? { permalink } : {}) };
  } catch (error) {
    return {
      ok: false,
      code: "PROVIDER_TEMPORARY_ERROR",
      retryable: true,
      error: error instanceof Error ? error.message : "Meta indisponivel.",
    };
  }
}

/** Busca o link público do post recém-criado; falha silenciosa não invalida a publicação. */
async function instagramPermalink(
  graphBase: string,
  mediaId: string,
  authorization: Record<string, string>,
  withToken: (url: string) => string,
): Promise<string | undefined> {
  try {
    const response = await fetch(withToken(`${graphBase}/${mediaId}?fields=permalink`), {
      headers: authorization,
    });
    if (!response.ok) return undefined;
    const payload: unknown = await response.json().catch(() => null);
    return nestedString(payload, ["permalink"]);
  } catch {
    return undefined;
  }
}


/** Publica em Página do Facebook: Reels (3 fases) ou vídeo no Feed. */
async function publishFacebookPage(input: PublishInput): Promise<PublishResult> {
  const token = input.providerAccessToken;
  const pageId = input.providerAccountId;
  if (!token || !pageId) {
    return {
      ok: false,
      code: "AUTH_INVALID",
      retryable: false,
      error: "A Página do Facebook não possui credencial conectada.",
    };
  }
  const base = `${facebookGraphBase()}/${pageId}`;

  try {
    if (input.kind === "feed") {
      const body = new URLSearchParams({
        file_url: input.videoUrl,
        description: input.caption,
        access_token: token,
      });
      const response = await fetch(`${base}/videos`, { method: "POST", body });
      const payload: unknown = await response.json().catch(() => null);
      const providerPostId = nestedString(payload, ["id"]);
      if (!response.ok || !providerPostId) {
        return providerFailure("Facebook vídeo", response.status, payload);
      }
      return { ok: true, providerPostId, permalink: `https://www.facebook.com/${providerPostId}` };
    }

    const start = await fetch(`${base}/video_reels`, {
      method: "POST",
      body: new URLSearchParams({ upload_phase: "start", access_token: token }),
    });
    const startPayload: unknown = await start.json().catch(() => null);
    const videoId = nestedString(startPayload, ["video_id"]);
    const uploadUrl = nestedString(startPayload, ["upload_url"]);
    if (!start.ok || !videoId || !uploadUrl) {
      return providerFailure("Facebook Reels iniciar", start.status, startPayload);
    }

    const upload = await fetch(uploadUrl, {
      method: "POST",
      headers: { Authorization: `OAuth ${token}`, file_url: input.videoUrl },
    });
    const uploadPayload: unknown = await upload.json().catch(() => null);
    if (!upload.ok) return providerFailure("Facebook Reels upload", upload.status, uploadPayload);

    const finish = await fetch(`${base}/video_reels`, {
      method: "POST",
      body: new URLSearchParams({
        upload_phase: "finish",
        video_id: videoId,
        video_state: "PUBLISHED",
        description: input.caption,
        access_token: token,
      }),
    });
    const finishPayload: unknown = await finish.json().catch(() => null);
    if (!finish.ok) return providerFailure("Facebook Reels publicar", finish.status, finishPayload);

    return {
      ok: true,
      providerPostId: videoId,
      permalink: `https://www.facebook.com/reel/${videoId}`,
    };
  } catch (error) {
    return {
      ok: false,
      code: "PROVIDER_TEMPORARY_ERROR",
      retryable: true,
      error: error instanceof Error ? error.message : "Facebook indisponivel.",
    };
  }
}
