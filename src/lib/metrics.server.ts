/**
 * Coleta de métricas reais dos posts publicados (Instagram, Facebook e YouTube).
 * Usa as mesmas credenciais da fila de publicação; nunca inventa números.
 */
import { facebookGraphBase, metaGraphBase } from "@/lib/meta.server";

export type CollectedMetrics = {
  views: number;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  platformData: Record<string, unknown>;
};

export type MetricsCollectionResult =
  | { ok: true; metrics: CollectedMetrics }
  | { ok: false; error: string };

const EMPTY: CollectedMetrics = {
  views: 0,
  impressions: 0,
  reach: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  saves: 0,
  clicks: 0,
  platformData: {},
};

function toNumber(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

/** Converte a resposta de /insights da Meta ({data:[{name,values:[{value}]}]}) em um mapa. */
function metaInsightsMap(payload: unknown): Record<string, number> {
  const data = (payload as { data?: unknown })?.data;
  const map: Record<string, number> = {};
  if (!Array.isArray(data)) return map;
  for (const entry of data) {
    const item = entry as { name?: unknown; values?: unknown; total_value?: { value?: unknown } };
    if (typeof item.name !== "string") continue;
    const fromValues = Array.isArray(item.values)
      ? (item.values[0] as { value?: unknown } | undefined)?.value
      : undefined;
    map[item.name] = toNumber(fromValues ?? item.total_value?.value);
  }
  return map;
}

async function collectInstagram(mediaId: string, token: string, tokenKind: string): Promise<MetricsCollectionResult> {
  const usesPageToken = tokenKind !== "instagram_login";
  const base = usesPageToken ? facebookGraphBase() : metaGraphBase();
  const auth: Record<string, string> = usesPageToken ? {} : { authorization: `Bearer ${token}` };
  const withToken = (url: string) =>
    usesPageToken ? `${url}${url.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}` : url;

  const fieldsResponse = await fetch(
    withToken(`${base}/${mediaId}?fields=like_count,comments_count,media_product_type`),
    { headers: auth },
  );
  const fields: unknown = await fieldsResponse.json().catch(() => null);
  if (!fieldsResponse.ok) {
    return { ok: false, error: `Instagram [${fieldsResponse.status}]: ${JSON.stringify(fields).slice(0, 200)}` };
  }

  const metrics = "views,reach,likes,comments,shares,saved,total_interactions";
  const insightsResponse = await fetch(withToken(`${base}/${mediaId}/insights?metric=${metrics}`), {
    headers: auth,
  });
  const insightsPayload: unknown = await insightsResponse.json().catch(() => null);
  const insights = insightsResponse.ok ? metaInsightsMap(insightsPayload) : {};

  const fieldMap = (fields ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    metrics: {
      ...EMPTY,
      views: insights["views"] ?? 0,
      impressions: insights["views"] ?? 0,
      reach: insights["reach"] ?? 0,
      likes: insights["likes"] ?? toNumber(fieldMap["like_count"]),
      comments: insights["comments"] ?? toNumber(fieldMap["comments_count"]),
      shares: insights["shares"] ?? 0,
      saves: insights["saved"] ?? 0,
      clicks: insights["total_interactions"] ?? 0,
      platformData: { insights, fields: fieldMap },
    },
  };
}

async function collectFacebook(postId: string, token: string): Promise<MetricsCollectionResult> {
  const base = facebookGraphBase();
  const query = new URLSearchParams({
    access_token: token,
    metric: [
      "post_impressions",
      "post_impressions_unique",
      "post_video_views",
      "post_clicks",
      "post_reactions_by_type_total",
    ].join(","),
  });
  const response = await fetch(`${base}/${postId}/insights?${query.toString()}`);
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return { ok: false, error: `Facebook [${response.status}]: ${JSON.stringify(payload).slice(0, 200)}` };
  }
  const map = metaInsightsMap(payload);

  const shareResponse = await fetch(
    `${base}/${postId}?fields=shares,comments.summary(true),likes.summary(true)&access_token=${encodeURIComponent(token)}`,
  );
  const sharePayload = (await shareResponse.json().catch(() => null)) as Record<string, any> | null;

  return {
    ok: true,
    metrics: {
      ...EMPTY,
      views: map["post_video_views"] ?? 0,
      impressions: map["post_impressions"] ?? 0,
      reach: map["post_impressions_unique"] ?? 0,
      likes: toNumber(sharePayload?.["likes"]?.summary?.total_count),
      comments: toNumber(sharePayload?.["comments"]?.summary?.total_count),
      shares: toNumber(sharePayload?.["shares"]?.count),
      saves: 0,
      clicks: map["post_clicks"] ?? 0,
      platformData: { insights: map },
    },
  };
}

async function collectYoutube(videoId: string, token: string): Promise<MetricsCollectionResult> {
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(videoId)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return { ok: false, error: `YouTube [${response.status}]: ${JSON.stringify(payload).slice(0, 200)}` };
  }
  const stats = ((payload as { items?: Array<{ statistics?: Record<string, unknown> }> })?.items?.[0]
    ?.statistics ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    metrics: {
      ...EMPTY,
      views: toNumber(stats["viewCount"]),
      impressions: toNumber(stats["viewCount"]),
      likes: toNumber(stats["likeCount"]),
      comments: toNumber(stats["commentCount"]),
      saves: toNumber(stats["favoriteCount"]),
      platformData: { statistics: stats },
    },
  };
}

/** Busca as métricas de um post já publicado, usando o token da conexão do usuário. */
export async function collectPostMetrics(postId: string, userId: string): Promise<MetricsCollectionResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { createPublishDependencies } = await import("@/lib/publish-deps.server");

  const { data: post } = await supabaseAdmin
    .from("scheduled_posts")
    .select("id,user_id,account_id,status,provider_post_id,permalink")
    .eq("id", postId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!post) return { ok: false, error: "Agendamento não encontrado." };
  if (post.status !== "publicado") return { ok: false, error: "Este post ainda não foi publicado." };
  const providerPostId = (post as { provider_post_id?: string | null }).provider_post_id;
  if (!providerPostId) return { ok: false, error: "O post não tem identificador na rede social." };
  if (!post.account_id) return { ok: false, error: "O post não tem conta social vinculada." };

  const deps = await createPublishDependencies();
  const account = await deps.loadAccount(post.account_id);
  if (!account) return { ok: false, error: "Conta social não encontrada." };
  const connection = await deps.loadConnection(account.id, userId);
  if (!connection) return { ok: false, error: "Conecte novamente esta conta para ler as métricas." };
  const credential = deps.loadProviderAccessToken ? await deps.loadProviderAccessToken(connection) : null;
  if (!credential?.accessToken) {
    return { ok: false, error: "A credencial da conta expirou. Reconecte para atualizar as métricas." };
  }

  if (account.platform === "instagram") {
    return collectInstagram(providerPostId, credential.accessToken, credential.tokenKind ?? "facebook_page");
  }
  if (account.platform === "facebook") return collectFacebook(providerPostId, credential.accessToken);
  if (account.platform === "youtube") return collectYoutube(providerPostId, credential.accessToken);
  return { ok: false, error: `Métricas indisponíveis para ${account.platform}.` };
}
