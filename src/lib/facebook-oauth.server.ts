/** Facebook Login for Business: autoriza Páginas do Facebook e contas IG Business. */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { facebookGraphBase, metaGraphVersion } from "@/lib/meta.server";
import { MetaLinkError } from "@/lib/social-linking.server";

const OAUTH_TTL_MS = 10 * 60 * 1000;

export const FACEBOOK_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "business_management",
  "instagram_basic",
  "instagram_content_publish",
];

type OAuthConfiguration = { appId: string; appSecret: string; redirectUri: string };

function callbackFromEnvironment(environment: NodeJS.ProcessEnv): string {
  const explicit = environment["FACEBOOK_REDIRECT_URI"]?.trim();
  if (explicit) return explicit;
  const instagramRedirect = environment["META_REDIRECT_URI"]?.trim();
  if (instagramRedirect?.includes("/integracoes/instagram/callback")) {
    return instagramRedirect.replace("/integracoes/instagram/callback", "/integracoes/facebook/callback");
  }
  const siteUrl = environment["PUBLIC_SITE_URL"]?.trim().replace(/\/$/, "");
  return siteUrl ? `${siteUrl}/integracoes/facebook/callback` : "";
}

export function facebookOAuthConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): OAuthConfiguration {
  const appId = environment["META_APP_ID"]?.trim();
  const appSecret = environment["META_APP_SECRET"]?.trim();
  const redirectUri = callbackFromEnvironment(environment);
  if (!appId || !appSecret || !redirectUri) {
    throw new MetaLinkError(
      "SERVER_CONFIG_MISSING",
      "O login do Facebook ainda não está configurado no servidor.",
    );
  }
  return { appId, appSecret, redirectUri };
}

function signState(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createFacebookOAuthState(
  userId: string,
  environment: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): string {
  const { appSecret } = facebookOAuthConfiguration(environment);
  const payload = Buffer.from(
    JSON.stringify({ userId, expiresAt: now + OAUTH_TTL_MS, nonce: randomBytes(24).toString("base64url") }),
  ).toString("base64url");
  return `${payload}.${signState(payload, appSecret)}`;
}

export function verifyFacebookOAuthState(
  state: string,
  userId: string,
  environment: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): void {
  const { appSecret } = facebookOAuthConfiguration(environment);
  const [payload, signature, extra] = state.split(".");
  if (!payload || !signature || extra) {
    throw new MetaLinkError("META_AUTH_INVALID", "A autorização do Facebook é inválida.");
  }
  const expected = Buffer.from(signState(payload, appSecret));
  const received = Buffer.from(signature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new MetaLinkError("META_AUTH_INVALID", "A autorização do Facebook é inválida.");
  }
  let decoded: { userId?: string; expiresAt?: number; nonce?: string };
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new MetaLinkError("META_AUTH_INVALID", "A autorização do Facebook é inválida.");
  }
  if (decoded.userId !== userId || !decoded.nonce || (decoded.expiresAt ?? 0) < now) {
    throw new MetaLinkError("META_AUTH_INVALID", "A autorização do Facebook expirou.");
  }
}

export function facebookAuthorizationUrl(
  userId: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const configuration = facebookOAuthConfiguration(environment);
  const url = new URL(`https://www.facebook.com/${metaGraphVersion(environment)}/dialog/oauth`);
  url.searchParams.set("client_id", configuration.appId);
  url.searchParams.set("redirect_uri", configuration.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", createFacebookOAuthState(userId, environment));
  // Login do Facebook para Empresas: quando existe uma configuração criada no painel,
  // usamos o config_id (as permissões vêm da configuração, não do parâmetro scope).
  const configId = environment["META_LOGIN_CONFIG_ID"]?.trim();
  if (configId) {
    url.searchParams.set("config_id", configId);
  } else {
    url.searchParams.set("scope", FACEBOOK_SCOPES.join(","));
  }
  return url.toString();
}


function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown, key: string): string | null {
  const object = asObject(value);
  const raw = object?.[key];
  return typeof raw === "string" ? raw : typeof raw === "number" ? String(raw) : null;
}

async function readJson(response: Response | null): Promise<unknown> {
  if (!response || response.status >= 500 || response.status === 429) {
    throw new MetaLinkError("META_TEMPORARY_ERROR", "A Meta está temporariamente indisponível.");
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = readString(asObject(payload)?.["error"], "message");
    throw new MetaLinkError("META_AUTH_INVALID", message || "A autorização do Facebook é inválida.");
  }
  return payload;
}

export async function exchangeFacebookAuthorizationCode(input: {
  code: string;
  environment?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  now?: number;
}): Promise<{ accessToken: string; expiresAt: Date }> {
  const environment = input.environment ?? process.env;
  const configuration = facebookOAuthConfiguration(environment);
  const request = input.fetch ?? fetch;
  const now = input.now ?? Date.now();

  const shortUrl = new URL(`${facebookGraphBase(environment)}/oauth/access_token`);
  shortUrl.searchParams.set("client_id", configuration.appId);
  shortUrl.searchParams.set("client_secret", configuration.appSecret);
  shortUrl.searchParams.set("redirect_uri", configuration.redirectUri);
  shortUrl.searchParams.set("code", input.code.replace(/#_$/, ""));
  const shortPayload = await readJson(await request(shortUrl).catch(() => null));
  const shortToken = readString(shortPayload, "access_token");
  if (!shortToken) throw new MetaLinkError("META_RESPONSE_INVALID", "A Meta retornou uma resposta inválida.");

  const longUrl = new URL(`${facebookGraphBase(environment)}/oauth/access_token`);
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", configuration.appId);
  longUrl.searchParams.set("client_secret", configuration.appSecret);
  longUrl.searchParams.set("fb_exchange_token", shortToken);
  const longPayload = await readJson(await request(longUrl).catch(() => null));
  const longToken = readString(longPayload, "access_token") ?? shortToken;
  const expiresInRaw = asObject(longPayload)?.["expires_in"];
  const expiresIn = typeof expiresInRaw === "number" && expiresInRaw > 0 ? expiresInRaw : 60 * 24 * 60 * 60;
  return { accessToken: longToken, expiresAt: new Date(now + expiresIn * 1000) };
}

export type FacebookPage = {
  pageId: string;
  name: string;
  pageAccessToken: string;
  instagram: { id: string; username: string } | null;
};

/** Lista as Páginas administradas e a conta IG Business vinculada a cada uma. */
export async function fetchFacebookPages(input: {
  accessToken: string;
  environment?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
}): Promise<FacebookPage[]> {
  const environment = input.environment ?? process.env;
  const url = new URL(`${facebookGraphBase(environment)}/me/accounts`);
  url.searchParams.set(
    "fields",
    "id,name,access_token,instagram_business_account{id,username}",
  );
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", input.accessToken);
  const payload = await readJson(await (input.fetch ?? fetch)(url).catch(() => null));
  const rows = asObject(payload)?.["data"];
  if (!Array.isArray(rows)) {
    throw new MetaLinkError("META_RESPONSE_INVALID", "A Meta retornou uma resposta inválida.");
  }
  const pages: FacebookPage[] = [];
  for (const row of rows) {
    const pageId = readString(row, "id");
    const name = readString(row, "name");
    const pageAccessToken = readString(row, "access_token");
    if (!pageId || !pageAccessToken) continue;
    const igRaw = asObject(row)?.["instagram_business_account"];
    const igId = readString(igRaw, "id");
    const igUsername = readString(igRaw, "username");
    pages.push({
      pageId,
      name: name || `Página ${pageId}`,
      pageAccessToken,
      instagram: igId ? { id: igId, username: (igUsername ?? igId).toLowerCase() } : null,
    });
  }
  return pages;
}
