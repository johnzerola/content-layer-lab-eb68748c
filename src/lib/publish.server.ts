import type { PostKind, PublishErrorCode, SocialProvider } from "@/lib/publishing";
import { facebookGraphBase, globalMetaCredentials, metaGraphBase } from "@/lib/meta.server";

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
};

export type PublishResult =
  | { ok: true; permalink?: string; providerPostId?: string }
  | { ok: false; error: string; code: PublishErrorCode; retryable: boolean };

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

  const provider = input.provider === "meta" && input.providerAccessToken
    ? "meta"
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
  if (provider === "ayrshare") return publishAyrshare(input);
  return publishMeta(input);
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

async function publishMeta(input: PublishInput): Promise<PublishResult> {
  const credentials = globalMetaCredentials();
  const token = input.providerAccessToken ?? credentials?.accessToken;
  const igId = input.providerAccessToken ? input.providerAccountId : credentials?.igUserId;
  if (!token || !igId) {
    return {
      ok: false,
      code: "AUTH_INVALID",
      retryable: false,
      error: "Credencial Meta nao configurada.",
    };
  }
  const graphBase = metaGraphBase();
  const accountBase = `${graphBase}/${igId}`;
  const authorization = { authorization: `Bearer ${token}` };

  try {
    const isImage = input.mediaType === "image";
    const mediaType = isImage ? (input.kind === "stories" ? "STORIES" : undefined) : input.kind === "stories" ? "STORIES" : "REELS";
    const create = await fetch(`${accountBase}/media`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authorization },
      body: JSON.stringify({
        ...(mediaType ? { media_type: mediaType } : {}),
        ...(isImage ? { image_url: input.videoUrl } : { video_url: input.videoUrl }),
        caption: input.kind === "stories" ? undefined : input.caption,
      }),
    });
    const created: unknown = await create.json().catch(() => null);
    const creationId = nestedString(created, ["id"]);
    if (!create.ok || !creationId) {
      const errorMsg = nestedString(created, ["error", "message"]) || "erro desconhecido";
      return providerFailure("Meta criar container", create.status, { detail: errorMsg });
    }


    let finished = isImage;
    for (let i = 0; !finished && i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const statusResponse = await fetch(`${graphBase}/${creationId}?fields=status_code`, {
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
      };
    }

    const publishResponse = await fetch(`${accountBase}/media_publish`, {
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
    return { ok: true, providerPostId };

  } catch (error) {
    return {
      ok: false,
      code: "PROVIDER_TEMPORARY_ERROR",
      retryable: true,
      error: error instanceof Error ? error.message : "Meta indisponivel.",
    };
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
