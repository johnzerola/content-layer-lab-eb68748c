import type { PostKind, PublishErrorCode, SocialProvider } from "@/lib/publishing";
import { facebookGraphBase, globalMetaCredentials, metaGraphBase } from "@/lib/meta.server";

const YOUTUBE_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";
const TIKTOK_API_BASE = "https://open.tiktokapis.com/v2";
const TIKTOK_CHUNK_BYTES = 10 * 1024 * 1024;

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
  /** Metadados específicos do YouTube definidos na Agenda. */
  youtube?: {
    title?: string;
    description?: string;
    tags?: string[];
    captionsSrt?: string;
    captionsLanguage?: string;
  };
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
  const explicit = input.youtube?.title?.trim();
  if (explicit) return explicit.replace(/\s+/g, " ").slice(0, 100);
  const firstCaptionLine = input.caption
    .split(/\r?\n/)
    .map((line) => line.replace(/#[\p{L}\p{N}_-]+/gu, "").trim())
    .find(Boolean);
  const title = firstCaptionLine || input.username || "Video";
  return title.replace(/\s+/g, " ").slice(0, 100);
}

function youtubeDescription(input: PublishInput): string {
  const explicit = input.youtube?.description?.trim();
  return (explicit || input.caption).slice(0, 5000);
}

/** Tags explícitas ou hashtags da legenda; o YouTube limita o total a 500 caracteres. */
function youtubeTags(input: PublishInput): string[] {
  const explicit = (input.youtube?.tags ?? [])
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter(Boolean);
  const fromCaption = Array.from(input.caption.matchAll(/#([\p{L}\p{N}_-]{2,})/gu)).map((m) => m[1]!);
  const unique: string[] = [];
  let total = 0;
  for (const tag of [...explicit, ...fromCaption]) {
    const value = tag.slice(0, 60);
    if (unique.some((t) => t.toLowerCase() === value.toLowerCase())) continue;
    if (total + value.length + 1 > 480) break;
    unique.push(value);
    total += value.length + 1;
  }
  return unique;
}

/** Envia a faixa de legendas (SRT) do post; falha aqui não invalida o vídeo publicado. */
async function uploadYoutubeCaptions(
  token: string,
  videoId: string,
  srt: string,
  language: string,
): Promise<void> {
  const metadata = JSON.stringify({
    snippet: { videoId, language, name: "Legenda", isDraft: false },
  });
  const boundary = `vv${crypto.randomUUID()}`;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n${srt}\r\n` +
    `--${boundary}--\r\n`;
  const response = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/captions?part=snippet&uploadType=multipart",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!response.ok) {
    console.warn("youtube_captions_upload_failed", response.status, await response.text().catch(() => ""));
  }
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
  const allowedPlatforms = ["instagram", "youtube", "facebook", "tiktok"];
  if (input.platform && !allowedPlatforms.includes(input.platform)) {
    return {
      ok: false,
      code: "CAPABILITY_UNAVAILABLE",
      retryable: false,
      error: `Publicacao para ${input.platform} ainda nao esta disponivel.`,
    };
  }

  const provider =
    (input.provider === "meta" || input.provider === "youtube" || input.provider === "tiktok") && input.providerAccessToken
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
  if (provider === "tiktok") return publishTikTok(input);
  if (provider === "youtube") return publishYoutube(input);
  if (provider === "ayrshare") return publishAyrshare(input);
  return publishMeta(input);
}

function tiktokPublicPostId(payload: unknown): string | undefined {
  const data = asObject(asObject(payload)?.["data"]);
  const value = data?.["publicaly_available_post_id"] ?? data?.["publicly_available_post_id"];
  if (Array.isArray(value)) return value.find((item): item is string => typeof item === "string");
  return typeof value === "string" ? value : undefined;
}

function tiktokStatus(payload: unknown): string | undefined {
  return nestedString(payload, ["data", "status"]);
}

async function tiktokRequest(
  path: string,
  token: string,
  body: Record<string, unknown>,
): Promise<{ response: Response; payload: unknown }> {
  const response = await fetch(`${TIKTOK_API_BASE}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body),
  });
  return { response, payload: await response.json().catch(() => null) };
}

/** Publicação oficial via Content Posting API. O upload é enviado em partes para não expor o Storage. */
async function publishTikTok(input: PublishInput): Promise<PublishResult> {
  const token = input.providerAccessToken;
  if (!token || !input.providerAccountId) {
    return { ok: false, code: "AUTH_INVALID", retryable: false, error: "A conta TikTok não possui credencial conectada." };
  }
  if (input.mediaType === "image") {
    return { ok: false, code: "MEDIA_INVALID", retryable: false, error: "Esta publicação do TikTok aceita apenas vídeo." };
  }

  try {
    let publishId = input.pendingContainerId ?? undefined;
    if (!publishId) {
      const media = await fetch(input.videoUrl);
      if (!media.ok) {
        return { ok: false, code: "MEDIA_NOT_FOUND", retryable: false, error: "O vídeo salvo não está disponível para envio ao TikTok." };
      }
      const bytes = await media.arrayBuffer();
      if (bytes.byteLength === 0) {
        return { ok: false, code: "MEDIA_INVALID", retryable: false, error: "O arquivo de vídeo está vazio." };
      }
      const totalChunks = Math.max(1, Math.ceil(bytes.byteLength / TIKTOK_CHUNK_BYTES));
      const chunkSize = totalChunks === 1 ? bytes.byteLength : TIKTOK_CHUNK_BYTES;
      const creator = await tiktokRequest("/post/publish/creator_info/query/", token, {});
      if (!creator.response.ok) return providerFailure("TikTok consultar criador", creator.response.status, creator.payload);
      const privacyOptions = asObject(asObject(creator.payload)?.["data"])?.["privacy_level_options"];
      const privacy = Array.isArray(privacyOptions)
        ? privacyOptions.find((value) => value === "PUBLIC_TO_EVERYONE") ?? privacyOptions.find((value): value is string => typeof value === "string")
        : undefined;
      if (!privacy) {
        return { ok: false, code: "CAPABILITY_UNAVAILABLE", retryable: false, error: "O TikTok não liberou uma opção de visibilidade para esta conta." };
      }

      const initialized = await tiktokRequest("/post/publish/video/init/", token, {
        post_info: {
          title: input.caption.slice(0, 2200),
          privacy_level: privacy,
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: "FILE_UPLOAD",
          video_size: bytes.byteLength,
          chunk_size: chunkSize,
          total_chunk_count: totalChunks,
        },
      });
      publishId = nestedString(initialized.payload, ["data", "publish_id"]);
      const uploadUrl = nestedString(initialized.payload, ["data", "upload_url"]);
      if (!initialized.response.ok || !publishId || !uploadUrl) {
        return providerFailure("TikTok iniciar publicação", initialized.response.status, initialized.payload);
      }

      for (let start = 0; start < bytes.byteLength; start += chunkSize) {
        const end = Math.min(bytes.byteLength, start + chunkSize);
        const chunk = bytes.slice(start, end);
        const uploaded = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "content-type": media.headers.get("content-type") ?? "video/mp4",
            "content-length": String(chunk.byteLength),
            "content-range": `bytes ${start}-${end - 1}/${bytes.byteLength}`,
          },
          body: chunk,
        });
        if (!uploaded.ok) {
          const detail = await uploaded.text().catch(() => "");
          return providerFailure("TikTok enviar vídeo", uploaded.status, { detail });
        }
      }
    }

    for (let attempt = 0; attempt < 12; attempt++) {
      const checked = await tiktokRequest("/post/publish/status/fetch/", token, { publish_id: publishId });
      if (!checked.response.ok) return providerFailure("TikTok consultar publicação", checked.response.status, checked.payload);
      const status = tiktokStatus(checked.payload);
      if (status === "PUBLISH_COMPLETE" || status === "SEND_TO_USER_INBOX") {
        const providerPostId = tiktokPublicPostId(checked.payload) ?? publishId;
        const publicId = tiktokPublicPostId(checked.payload);
        return {
          ok: true,
          providerPostId,
          ...(publicId ? { permalink: `https://www.tiktok.com/@${input.username}/video/${publicId}` } : {}),
        };
      }
      if (status === "FAILED") {
        const reason = nestedString(checked.payload, ["data", "fail_reason"]) ?? "O TikTok recusou o vídeo.";
        return { ok: false, code: "PROVIDER_PERMANENT_ERROR", retryable: false, error: reason };
      }
      if (attempt < 11) await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    return {
      ok: false,
      code: "PROVIDER_TEMPORARY_ERROR",
      retryable: true,
      error: "O TikTok ainda está processando o vídeo.",
      pendingContainerId: publishId,
    };
  } catch (error) {
    return {
      ok: false,
      code: "PROVIDER_TEMPORARY_ERROR",
      retryable: true,
      error: error instanceof Error ? error.message : "TikTok indisponível.",
    };
  }
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
          description: youtubeDescription(input),
          tags: youtubeTags(input),
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

    const captionsSrt = input.youtube?.captionsSrt?.trim();
    if (captionsSrt) {
      await uploadYoutubeCaptions(
        token,
        providerPostId,
        captionsSrt,
        input.youtube?.captionsLanguage || "pt-BR",
      ).catch(() => undefined);
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
