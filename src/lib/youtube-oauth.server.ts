/**
 * YouTube Data API v3 (OAuth 2.0 Google) — cada usuário do VaiViral conecta o
 * próprio canal. Server-only: lê YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET.
 *
 * Escopos:
 * - youtube.upload      → publicar vídeos longos e Shorts
 * - youtube.readonly    → ler dados básicos do canal (nome, avatar)
 * O acesso offline (refresh_token) permite publicar agendamentos sem o usuário
 * estar online — por isso access_type=offline + prompt=consent.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { MetaLinkError } from "@/lib/social-linking.server";

const OAUTH_TTL_MS = 10 * 60 * 1000;
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube",
];

type YoutubeConfiguration = { clientId: string; clientSecret: string; redirectUri: string };

function callbackFromEnvironment(environment: NodeJS.ProcessEnv): string {
  const explicit = environment["YOUTUBE_REDIRECT_URI"]?.trim();
  if (explicit) return explicit;
  const siteUrl = environment["PUBLIC_SITE_URL"]?.trim().replace(/\/$/, "");
  return siteUrl ? `${siteUrl}/integracoes/youtube/callback` : "";
}

export function youtubeConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): YoutubeConfiguration {
  const clientId = environment["YOUTUBE_CLIENT_ID"]?.trim();
  const clientSecret = environment["YOUTUBE_CLIENT_SECRET"]?.trim();
  const redirectUri = callbackFromEnvironment(environment);
  if (!clientId || !clientSecret || !redirectUri) {
    throw new MetaLinkError(
      "SERVER_CONFIG_MISSING",
      "A integração com o YouTube ainda não está configurada no servidor.",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

export function youtubeConfigured(environment: NodeJS.ProcessEnv = process.env): boolean {
  try {
    youtubeConfiguration(environment);
    return true;
  } catch {
    return false;
  }
}

function signState(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createYoutubeOAuthState(
  userId: string,
  environment: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): string {
  const { clientSecret } = youtubeConfiguration(environment);
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      expiresAt: now + OAUTH_TTL_MS,
      nonce: randomBytes(24).toString("base64url"),
    }),
  ).toString("base64url");
  return `${payload}.${signState(payload, clientSecret)}`;
}

export function verifyYoutubeOAuthState(
  state: string,
  userId: string,
  environment: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): void {
  const { clientSecret } = youtubeConfiguration(environment);
  const [payload, signature, extra] = state.split(".");
  if (!payload || !signature || extra) {
    throw new MetaLinkError("META_AUTH_INVALID", "A autorização do YouTube é inválida.");
  }
  const expected = Buffer.from(signState(payload, clientSecret));
  const received = Buffer.from(signature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new MetaLinkError("META_AUTH_INVALID", "A autorização do YouTube é inválida.");
  }
  let decoded: { userId?: string; expiresAt?: number; nonce?: string };
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new MetaLinkError("META_AUTH_INVALID", "A autorização do YouTube é inválida.");
  }
  if (decoded.userId !== userId || !decoded.nonce || (decoded.expiresAt ?? 0) < now) {
    throw new MetaLinkError("META_AUTH_INVALID", "A autorização do YouTube expirou.");
  }
}

export function youtubeAuthorizationUrl(
  userId: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const configuration = youtubeConfiguration(environment);
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", configuration.clientId);
  url.searchParams.set("redirect_uri", configuration.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", YOUTUBE_SCOPES.join(" "));
  // offline emite refresh_token. select_account reabre o seletor para conectar
  // outro canal ou Conta de marca sem substituir os canais ja salvos.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent select_account");
  url.searchParams.set("state", createYoutubeOAuthState(userId, environment));
  return url.toString();
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown, key: string): string | null {
  const raw = asObject(value)?.[key];
  return typeof raw === "string" ? raw : null;
}

async function readTokenResponse(response: Response | null): Promise<Record<string, unknown>> {
  if (!response || response.status >= 500 || response.status === 429) {
    throw new MetaLinkError("META_TEMPORARY_ERROR", "O Google está temporariamente indisponível.");
  }
  const payload = asObject(await response.json().catch(() => null));
  if (!response.ok || !payload) {
    const description = readString(payload, "error_description") ?? readString(payload, "error");
    throw new MetaLinkError(
      "META_AUTH_INVALID",
      description || "A autorização do YouTube é inválida.",
    );
  }
  return payload;
}

export type YoutubeTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
};

function tokensFromPayload(payload: Record<string, unknown>, now: number): YoutubeTokens {
  const accessToken = readString(payload, "access_token");
  if (!accessToken) {
    throw new MetaLinkError("META_RESPONSE_INVALID", "O Google retornou uma resposta inválida.");
  }
  const expiresIn = Number(payload["expires_in"]);
  return {
    accessToken,
    // No refresh só vem access_token; no exchange inicial o refresh_token é obrigatório.
    refreshToken: readString(payload, "refresh_token") ?? "",
    scope: readString(payload, "scope") ?? "",
    expiresAt: new Date(
      now + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000,
    ),
  };
}

function validateYoutubeTokenScopes(tokens: YoutubeTokens): void {
  const granted = new Set(tokens.scope.split(/\s+/).filter(Boolean));
  const hasFullYoutubeAccess = granted.has("https://www.googleapis.com/auth/youtube");
  const missing = YOUTUBE_SCOPES.filter((scope) => !hasFullYoutubeAccess && !granted.has(scope));
  if (missing.length > 0) {
    throw new MetaLinkError(
      "META_AUTH_INVALID",
      `O Google nÃ£o concedeu todos os acessos do YouTube (${missing.join(", ")}). Clique em Reconectar conta e aprove todos os escopos.`,
    );
  }
}

async function requestTokens(
  body: URLSearchParams,
  request: typeof fetch,
  now: number,
): Promise<YoutubeTokens> {
  const response = await request(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  }).catch(() => null);
  return tokensFromPayload(await readTokenResponse(response), now);
}

export async function exchangeYoutubeAuthorizationCode(input: {
  code: string;
  environment?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  now?: number;
}): Promise<YoutubeTokens> {
  const environment = input.environment ?? process.env;
  const configuration = youtubeConfiguration(environment);
  const tokens = await requestTokens(
    new URLSearchParams({
      client_id: configuration.clientId,
      client_secret: configuration.clientSecret,
      code: decodeURIComponent(input.code),
      grant_type: "authorization_code",
      redirect_uri: configuration.redirectUri,
    }),
    input.fetch ?? fetch,
    input.now ?? Date.now(),
  );
  if (!tokens.refreshToken) {
    throw new MetaLinkError(
      "META_AUTH_INVALID",
      "O Google não emitiu o token de longa duração. Revogue o acesso do app em myaccount.google.com/permissions e conecte novamente.",
    );
  }
  validateYoutubeTokenScopes(tokens);
  return tokens;
}

/** Renova o access_token usando o refresh_token salvo (agendamentos). */
export async function refreshYoutubeAccessToken(input: {
  refreshToken: string;
  environment?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  now?: number;
}): Promise<{ accessToken: string; expiresAt: Date }> {
  const environment = input.environment ?? process.env;
  const configuration = youtubeConfiguration(environment);
  const tokens = await requestTokens(
    new URLSearchParams({
      client_id: configuration.clientId,
      client_secret: configuration.clientSecret,
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
    }),
    input.fetch ?? fetch,
    input.now ?? Date.now(),
  );
  return { accessToken: tokens.accessToken, expiresAt: tokens.expiresAt };
}

export type YoutubeChannel = {
  channelId: string;
  title: string;
  handle: string;
  avatarUrl: string | null;
};

function parseYoutubeChannel(value: unknown): YoutubeChannel | null {
  const channel = asObject(value);
  const snippet = asObject(channel?.["snippet"]);
  const channelId = readString(channel, "id");
  if (!channelId || !snippet) return null;
  const title = readString(snippet, "title") ?? "YouTube";
  const handle = (readString(snippet, "customUrl") ?? channelId).replace(/^@/, "").slice(0, 60);
  const thumbnails = asObject(snippet["thumbnails"]);
  const avatar = asObject(thumbnails?.["default"]) ?? asObject(thumbnails?.["medium"]) ?? null;
  return {
    channelId,
    title,
    handle: handle || channelId,
    avatarUrl: readString(avatar, "url"),
  };
}

/**
 * Lista os canais visiveis para a identidade escolhida no OAuth. Para muitas
 * Contas de marca, o Google devolve somente o canal selecionado; por isso o app
 * preserva conexoes existentes e permite repetir o OAuth para adicionar outro.
 */
export async function fetchYoutubeChannels(input: {
  accessToken: string;
  fetch?: typeof fetch;
}): Promise<YoutubeChannel[]> {
  const request = input.fetch ?? fetch;
  const url = new URL(`${YOUTUBE_API_BASE}/channels`);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("mine", "true");
  url.searchParams.set("maxResults", "50");
  const channels = new Map<string, YoutubeChannel>();
  const seenTokens = new Set<string>();
  for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
    const response = await request(url, {
      headers: { authorization: `Bearer ${input.accessToken}` },
    }).catch(() => null);
    if (!response || response.status >= 500) {
      throw new MetaLinkError(
        "META_TEMPORARY_ERROR",
        "O YouTube está temporariamente indisponível.",
      );
    }
    const payload = asObject(await response.json().catch(() => null));
    const items = payload?.["items"];
    if (!response.ok || !Array.isArray(items)) {
      throw new MetaLinkError(
        "META_AUTH_INVALID",
        "Não foi possível ler os canais do YouTube. A conta do Google precisa ter um canal criado.",
      );
    }
    for (const item of items) {
      const channel = parseYoutubeChannel(item);
      if (channel) channels.set(channel.channelId, channel);
    }
    const nextToken = readString(payload, "nextPageToken");
    if (!nextToken || seenTokens.has(nextToken)) break;
    seenTokens.add(nextToken);
    url.searchParams.set("pageToken", nextToken);
  }
  const list = [...channels.values()];
  if (list.length === 0) {
    throw new MetaLinkError(
      "META_AUTH_INVALID",
      "Não foi possível ler os canais do YouTube. A conta do Google precisa ter um canal criado.",
    );
  }
  return list;
}

/** Busca um canal específico do YouTube pelo ID oficial. */
export async function fetchYoutubeChannelById(input: {
  accessToken: string;
  channelId: string;
  fetch?: typeof fetch;
}): Promise<YoutubeChannel> {
  const request = input.fetch ?? fetch;
  const url = new URL(`${YOUTUBE_API_BASE}/channels`);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("id", input.channelId);
  const response = await request(url, {
    headers: { authorization: `Bearer ${input.accessToken}` },
  }).catch(() => null);
  if (!response || response.status >= 500) {
    throw new MetaLinkError("META_TEMPORARY_ERROR", "O YouTube está temporariamente indisponível.");
  }
  const payload = asObject(await response.json().catch(() => null));
  const items = payload?.["items"];
  if (!response.ok || !Array.isArray(items) || items.length === 0) {
    throw new MetaLinkError(
      "META_AUTH_INVALID",
      "Não foi possível ler o canal do YouTube. A conta do Google precisa ter um canal criado.",
    );
  }
  const channel = parseYoutubeChannel(items[0]);
  if (!channel) {
    throw new MetaLinkError(
      "META_RESPONSE_INVALID",
      "O Google retornou dados inválidos para o canal.",
    );
  }
  return channel;
}

/** @deprecated use fetchYoutubeChannels — mantido por compatibilidade. */
export async function fetchYoutubeChannel(input: {
  accessToken: string;
  fetch?: typeof fetch;
}): Promise<YoutubeChannel> {
  const channel = (await fetchYoutubeChannels(input))[0];
  if (!channel) {
    throw new MetaLinkError("META_RESPONSE_INVALID", "O Google não retornou um canal do YouTube.");
  }
  return channel;
}
