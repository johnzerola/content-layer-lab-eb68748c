/**
 * TikTok Login Kit (OAuth v2) — cada usuário do VaiViral conecta a própria conta.
 * Server-only: lê TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET do ambiente.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { MetaLinkError } from "@/lib/social-linking.server";

const OAUTH_TTL_MS = 10 * 60 * 1000;
const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
export const TIKTOK_API_BASE = "https://open.tiktokapis.com/v2";

/** video.publish = post direto; video.upload = envia como rascunho (antes da auditoria). */
export const TIKTOK_SCOPES = ["user.info.basic", "user.info.profile", "video.upload", "video.publish"];

type TikTokConfiguration = { clientKey: string; clientSecret: string; redirectUri: string };

function callbackFromEnvironment(environment: NodeJS.ProcessEnv): string {
  const explicit = environment["TIKTOK_REDIRECT_URI"]?.trim();
  if (explicit) return explicit;
  const siteUrl = environment["PUBLIC_SITE_URL"]?.trim().replace(/\/$/, "");
  return siteUrl ? `${siteUrl}/integracoes/tiktok/callback` : "";
}

export function tiktokConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): TikTokConfiguration {
  const clientKey = environment["TIKTOK_CLIENT_KEY"]?.trim();
  const clientSecret = environment["TIKTOK_CLIENT_SECRET"]?.trim();
  const redirectUri = callbackFromEnvironment(environment);
  if (!clientKey || !clientSecret || !redirectUri) {
    throw new MetaLinkError(
      "SERVER_CONFIG_MISSING",
      "A integração com o TikTok ainda não está configurada no servidor.",
    );
  }
  return { clientKey, clientSecret, redirectUri };
}

export function tiktokConfigured(environment: NodeJS.ProcessEnv = process.env): boolean {
  try {
    tiktokConfiguration(environment);
    return true;
  } catch {
    return false;
  }
}

function signState(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createTikTokOAuthState(
  userId: string,
  environment: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): string {
  const { clientSecret } = tiktokConfiguration(environment);
  const payload = Buffer.from(
    JSON.stringify({ userId, expiresAt: now + OAUTH_TTL_MS, nonce: randomBytes(24).toString("base64url") }),
  ).toString("base64url");
  return `${payload}.${signState(payload, clientSecret)}`;
}

export function verifyTikTokOAuthState(
  state: string,
  userId: string,
  environment: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): void {
  const { clientSecret } = tiktokConfiguration(environment);
  const [payload, signature, extra] = state.split(".");
  if (!payload || !signature || extra) {
    throw new MetaLinkError("META_AUTH_INVALID", "A autorização do TikTok é inválida.");
  }
  const expected = Buffer.from(signState(payload, clientSecret));
  const received = Buffer.from(signature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new MetaLinkError("META_AUTH_INVALID", "A autorização do TikTok é inválida.");
  }
  let decoded: { userId?: string; expiresAt?: number; nonce?: string };
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new MetaLinkError("META_AUTH_INVALID", "A autorização do TikTok é inválida.");
  }
  if (decoded.userId !== userId || !decoded.nonce || (decoded.expiresAt ?? 0) < now) {
    throw new MetaLinkError("META_AUTH_INVALID", "A autorização do TikTok expirou.");
  }
}

export function tiktokAuthorizationUrl(
  userId: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const configuration = tiktokConfiguration(environment);
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_key", configuration.clientKey);
  url.searchParams.set("scope", TIKTOK_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", configuration.redirectUri);
  url.searchParams.set("state", createTikTokOAuthState(userId, environment));
  return url.toString();
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown, key: string): string | null {
  const raw = asObject(value)?.[key];
  return typeof raw === "string" ? raw : typeof raw === "number" ? String(raw) : null;
}

async function readTokenResponse(response: Response | null): Promise<Record<string, unknown>> {
  if (!response || response.status >= 500 || response.status === 429) {
    throw new MetaLinkError("META_TEMPORARY_ERROR", "O TikTok está temporariamente indisponível.");
  }
  const payload: unknown = await response.json().catch(() => null);
  const object = asObject(payload);
  const errorCode = readString(object, "error");
  if (!response.ok || (errorCode && errorCode !== "ok")) {
    const description = readString(object, "error_description");
    throw new MetaLinkError("META_AUTH_INVALID", description || "A autorização do TikTok é inválida.");
  }
  if (!object) throw new MetaLinkError("META_RESPONSE_INVALID", "O TikTok retornou uma resposta inválida.");
  return object;
}

export type TikTokTokens = {
  accessToken: string;
  refreshToken: string;
  openId: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
  scope: string;
};

function tokensFromPayload(payload: Record<string, unknown>, now: number): TikTokTokens {
  const accessToken = readString(payload, "access_token");
  const refreshToken = readString(payload, "refresh_token");
  const openId = readString(payload, "open_id") ?? "";
  if (!accessToken || !refreshToken) {
    throw new MetaLinkError("META_RESPONSE_INVALID", "O TikTok retornou uma resposta inválida.");
  }
  const expiresIn = Number(payload["expires_in"]);
  const refreshExpiresIn = Number(payload["refresh_expires_in"]);
  return {
    accessToken,
    refreshToken,
    openId,
    scope: readString(payload, "scope") ?? "",
    expiresAt: new Date(now + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 86400) * 1000),
    refreshExpiresAt: new Date(
      now + (Number.isFinite(refreshExpiresIn) && refreshExpiresIn > 0 ? refreshExpiresIn : 365 * 86400) * 1000,
    ),
  };
}

async function requestTokens(
  body: URLSearchParams,
  request: typeof fetch,
  now: number,
): Promise<TikTokTokens> {
  const response = await request(`${TIKTOK_API_BASE}/oauth/token/`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "cache-control": "no-cache" },
    body,
  }).catch(() => null);
  return tokensFromPayload(await readTokenResponse(response), now);
}

export async function exchangeTikTokAuthorizationCode(input: {
  code: string;
  environment?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  now?: number;
}): Promise<TikTokTokens> {
  const environment = input.environment ?? process.env;
  const configuration = tiktokConfiguration(environment);
  const body = new URLSearchParams({
    client_key: configuration.clientKey,
    client_secret: configuration.clientSecret,
    code: decodeURIComponent(input.code),
    grant_type: "authorization_code",
    redirect_uri: configuration.redirectUri,
  });
  return requestTokens(body, input.fetch ?? fetch, input.now ?? Date.now());
}

export async function refreshTikTokTokens(input: {
  refreshToken: string;
  environment?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  now?: number;
}): Promise<TikTokTokens> {
  const environment = input.environment ?? process.env;
  const configuration = tiktokConfiguration(environment);
  const body = new URLSearchParams({
    client_key: configuration.clientKey,
    client_secret: configuration.clientSecret,
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
  });
  return requestTokens(body, input.fetch ?? fetch, input.now ?? Date.now());
}

export type TikTokProfile = {
  openId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export async function fetchTikTokProfile(input: {
  accessToken: string;
  fetch?: typeof fetch;
}): Promise<TikTokProfile> {
  const url = new URL(`${TIKTOK_API_BASE}/user/info/`);
  url.searchParams.set("fields", "open_id,union_id,display_name,avatar_url,username");
  const response = await (input.fetch ?? fetch)(url, {
    headers: { authorization: `Bearer ${input.accessToken}` },
  }).catch(() => null);
  if (!response || response.status >= 500) {
    throw new MetaLinkError("META_TEMPORARY_ERROR", "O TikTok está temporariamente indisponível.");
  }
  const payload = asObject(await response.json().catch(() => null));
  const user = asObject(asObject(payload?.["data"])?.["user"]);
  const openId = readString(user, "open_id");
  if (!response.ok || !user || !openId) {
    throw new MetaLinkError("META_AUTH_INVALID", "Não foi possível ler o perfil do TikTok.");
  }
  const displayName = readString(user, "display_name") ?? "TikTok";
  const username = (readString(user, "username") ?? displayName).toLowerCase().replace(/^@/, "");
  return {
    openId,
    username: username.slice(0, 60) || openId,
    displayName,
    avatarUrl: readString(user, "avatar_url"),
  };
}
