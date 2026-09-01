/** Facebook Login: autoriza Páginas do Facebook e contas Instagram profissionais. */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { facebookGraphBase, metaGraphVersion } from "@/lib/meta.server";
import { MetaLinkError } from "@/lib/social-linking.server";

const OAUTH_TTL_MS = 10 * 60 * 1000;
const FACEBOOK_PAGE_FIELDS =
  "id,name,access_token,tasks,instagram_business_account{id,username,name},connected_instagram_account{id,username,name}";
const FACEBOOK_PAGE_FIELDS_FALLBACK =
  "id,name,access_token,tasks,instagram_business_account{id,username,name}";

/**
 * Permissões mínimas do fluxo usado por este projeto.
 *
 * `pages_read_engagement` é necessária para descobrir Páginas e a conta
 * Instagram vinculada por `GET /me/accounts`. A permissão também precisa estar
 * adicionada ao caso de uso do app no painel da Meta; código não ativa uma
 * permissão externa que ainda aparece como "Adicionar" no App Dashboard.
 */
export const FACEBOOK_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
] as const;

export function facebookScopes(_environment: NodeJS.ProcessEnv = process.env): string[] {
  // O fluxo combinado sempre descobre Páginas e Instagram antes de publicar;
  // por isso todos os scopes abaixo são invariantes, não configuração de deploy.
  return [...FACEBOOK_SCOPES];
}

export type FacebookLoginMode = "classic" | "business";

export function facebookLoginMode(environment: NodeJS.ProcessEnv = process.env): FacebookLoginMode {
  const configuredMode = environment["META_LOGIN_MODE"]?.trim().toLowerCase();
  if (configuredMode === "classic") return "classic";
  if (configuredMode === "business") return "business";
  // O fluxo clássico é o caminho principal porque ele mostra a seleção granular
  // de Páginas. Login para Empresas só entra quando configurado explicitamente.
  return "classic";
}

type OAuthConfiguration = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  /** Login para Empresas. Quando ausente, usamos o Login clássico com `scope`. */
  configId: string | null;
};

export type FacebookOAuthDiagnostics = {
  ready: true;
  flowVersion: "facebook-login-v2";
  graphVersion: string;
  redirectOrigin: string;
  redirectPath: "/integracoes/facebook/callback";
  mode: FacebookLoginMode;
  usesConfigId: boolean;
  requestedScopes: string[];
};

function callbackFromEnvironment(environment: NodeJS.ProcessEnv): string {
  const explicit = environment["FACEBOOK_REDIRECT_URI"]?.trim();
  if (explicit) return explicit;
  const instagramRedirect = environment["META_REDIRECT_URI"]?.trim();
  if (instagramRedirect?.includes("/integracoes/instagram/callback")) {
    return instagramRedirect.replace(
      "/integracoes/instagram/callback",
      "/integracoes/facebook/callback",
    );
  }
  const siteUrl = environment["PUBLIC_SITE_URL"]?.trim().replace(/\/$/, "");
  return siteUrl ? `${siteUrl}/integracoes/facebook/callback` : "";
}

export function facebookOAuthConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
  options: { loginMode?: FacebookLoginMode } = {},
): OAuthConfiguration {
  const appId = environment["META_APP_ID"]?.trim();
  const appSecret = environment["META_APP_SECRET"]?.trim();
  const redirectUri = callbackFromEnvironment(environment);
  const mode = options.loginMode ?? facebookLoginMode(environment);
  const rawConfigId = environment["META_LOGIN_CONFIG_ID"]?.trim();
  const configId = mode === "business" ? (rawConfigId ?? null) : null;
  if (!appId || !appSecret || !redirectUri) {
    throw new MetaLinkError(
      "SERVER_CONFIG_MISSING",
      "O Login do Facebook ainda não está configurado no servidor.",
    );
  }
  if (mode === "business" && !configId) {
    throw new MetaLinkError(
      "SERVER_CONFIG_MISSING",
      "META_LOGIN_MODE=business exige META_LOGIN_CONFIG_ID.",
    );
  }
  if (!/^\d+$/.test(appId) || (configId !== null && !/^\d+$/.test(configId))) {
    throw new MetaLinkError(
      "SERVER_CONFIG_MISSING",
      "O App ID ou o ID da configuração empresarial da Meta é inválido.",
    );
  }
  let callback: URL;
  try {
    callback = new URL(redirectUri);
  } catch {
    throw new MetaLinkError("SERVER_CONFIG_MISSING", "A URL de retorno do Facebook é inválida.");
  }
  if (
    callback.protocol !== "https:" ||
    callback.pathname !== "/integracoes/facebook/callback" ||
    callback.search ||
    callback.hash
  ) {
    throw new MetaLinkError(
      "SERVER_CONFIG_MISSING",
      "A URL de retorno deve ser HTTPS e terminar exatamente em /integracoes/facebook/callback.",
    );
  }
  return { appId, appSecret, redirectUri, configId };
}

export function diagnoseFacebookOAuth(
  environment: NodeJS.ProcessEnv = process.env,
): FacebookOAuthDiagnostics {
  const configuration = facebookOAuthConfiguration(environment);
  const callback = new URL(configuration.redirectUri);
  const mode = configuration.configId ? "business" : "classic";
  return {
    ready: true,
    flowVersion: "facebook-login-v2",
    graphVersion: metaGraphVersion(environment),
    redirectOrigin: callback.origin,
    redirectPath: "/integracoes/facebook/callback",
    mode,
    usesConfigId: mode === "business",
    requestedScopes: mode === "classic" ? facebookScopes(environment) : [],
  };
}

export type FacebookConfigCheck = {
  graphVersion: string;
  appId: string | null;
  configId: string | null;
  mode: "classic" | "business";
  usesConfigId: boolean;
  requiredScopes: string[];
  effectiveScopes: string[];
  permissionSource: "manual-scope" | "meta-business-configuration";
  permissionWarning: string | null;
  redirectUri: string | null;
  siteUrl: string | null;
  authorizationUrl: string | null;
  issues: string[];
  loginConfiguration: { checked: boolean; ok: boolean; detail: string };
};

function mask(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length <= 6 ? value : `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/** Checagem sem exceções: mostra exatamente o que falta configurar. */
export function facebookConfigChecklist(
  environment: NodeJS.ProcessEnv = process.env,
): Omit<FacebookConfigCheck, "loginConfiguration"> {
  const issues: string[] = [];
  const appId = environment["META_APP_ID"]?.trim() ?? null;
  const configId = environment["META_LOGIN_CONFIG_ID"]?.trim() ?? null;
  const mode = facebookLoginMode(environment);
  const usesConfigId = mode === "business";
  const siteUrl = environment["PUBLIC_SITE_URL"]?.trim().replace(/\/$/, "") ?? null;
  const redirectUri = callbackFromEnvironment(environment) || null;
  const graphVersion = metaGraphVersion(environment);

  if (!appId) issues.push("META_APP_ID não está definido.");
  else if (!/^\d+$/.test(appId)) issues.push("META_APP_ID deve conter apenas números.");
  if (!environment["META_APP_SECRET"]?.trim()) issues.push("META_APP_SECRET não está definido.");
  if (mode === "business" && !configId) {
    issues.push("META_LOGIN_MODE=business exige META_LOGIN_CONFIG_ID.");
  }
  if (configId && !/^\d+$/.test(configId)) {
    issues.push("META_LOGIN_CONFIG_ID deve conter apenas números.");
  }

  if (!redirectUri) {
    issues.push(
      "Nenhuma URL de retorno pôde ser calculada (defina FACEBOOK_REDIRECT_URI ou PUBLIC_SITE_URL).",
    );
  } else {
    try {
      const callback = new URL(redirectUri);
      if (callback.protocol !== "https:") issues.push("A URL de retorno precisa usar HTTPS.");
      if (callback.pathname !== "/integracoes/facebook/callback") {
        issues.push("A URL de retorno precisa terminar em /integracoes/facebook/callback.");
      }
      if (siteUrl && callback.origin !== siteUrl) {
        issues.push(
          `A URL de retorno (${callback.origin}) não bate com PUBLIC_SITE_URL (${siteUrl}).`,
        );
      }
    } catch {
      issues.push("A URL de retorno é inválida.");
    }
  }

  let authorizationUrl: string | null = null;
  if (issues.length === 0) {
    try {
      const preview = new URL(facebookAuthorizationUrl("diagnostico", environment));
      preview.searchParams.set("state", "<gerado por usuário>");
      authorizationUrl = preview.toString();
    } catch {
      authorizationUrl = null;
    }
  }

  return {
    graphVersion,
    appId,
    configId: usesConfigId ? mask(configId) : null,
    mode,
    usesConfigId,
    requiredScopes: facebookScopes(environment),
    effectiveScopes: mode === "classic" ? facebookScopes(environment) : [],
    permissionSource: mode === "classic" ? "manual-scope" : "meta-business-configuration",
    permissionWarning:
      mode === "business"
        ? "No modo Business, confirme que a configuração publicada da Meta contém todos os scopes obrigatórios, incluindo pages_read_engagement."
        : "No modo clássico, cada scope enviado também precisa aparecer como adicionado no caso de uso do App Dashboard da Meta.",
    redirectUri,
    siteUrl,
    authorizationUrl,
    issues,
  };
}

/** Confirma na Graph API se a configuração do Login para Empresas existe e pertence ao app. */
export async function verifyFacebookLoginConfiguration(
  input: {
    environment?: NodeJS.ProcessEnv;
    fetch?: typeof fetch;
  } = {},
): Promise<FacebookConfigCheck["loginConfiguration"]> {
  const environment = input.environment ?? process.env;
  const appId = environment["META_APP_ID"]?.trim();
  const appSecret = environment["META_APP_SECRET"]?.trim();
  const configId = environment["META_LOGIN_CONFIG_ID"]?.trim();
  if (facebookLoginMode(environment) === "classic") {
    return {
      checked: false,
      ok: true,
      detail: "Modo clássico ativo; a configuração do Login para Empresas não é usada.",
    };
  }
  if (!appId || !appSecret || !configId) {
    return { checked: false, ok: false, detail: "Credenciais incompletas no servidor." };
  }
  const url = new URL(`${facebookGraphBase(environment)}/${configId}`);
  url.searchParams.set("fields", "id,name,status,is_published");
  url.searchParams.set("access_token", `${appId}|${appSecret}`);
  const response = await (input.fetch ?? fetch)(url).catch(() => null);
  if (!response) {
    return { checked: true, ok: false, detail: "Não foi possível falar com a Meta agora." };
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = readString(asObject(payload)?.["error"], "message");
    return {
      checked: true,
      ok: false,
      detail: message || "A Meta recusou a consulta da configuração de login.",
    };
  }
  const id = readString(payload, "id");
  if (id !== configId) {
    return {
      checked: true,
      ok: false,
      detail: "A configuração retornada não corresponde ao config_id.",
    };
  }
  const status = readString(payload, "status");
  const published = asObject(payload)?.["is_published"];
  if (
    published === false ||
    (status && status.toUpperCase() !== "LIVE" && status.toUpperCase() !== "PUBLISHED")
  ) {
    return {
      checked: true,
      ok: false,
      detail: `A configuração existe, mas não está publicada (status: ${status ?? "desconhecido"}).`,
    };
  }
  const name = readString(payload, "name");
  return {
    checked: true,
    ok: true,
    detail: name
      ? `Configuração "${name}" publicada e válida.`
      : "Configuração publicada e válida.",
  };
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
    JSON.stringify({
      userId,
      expiresAt: now + OAUTH_TTL_MS,
      nonce: randomBytes(24).toString("base64url"),
    }),
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
  options: { forceClassic?: boolean; forceBusiness?: boolean } = {},
): string {
  const loginMode = options.forceBusiness ? "business" : options.forceClassic ? "classic" : null;
  const configuration = facebookOAuthConfiguration(
    environment,
    loginMode ? { loginMode } : {},
  );
  // O Login for Business deve usar a mesma versão configurada para as chamadas Graph.
  // Isso evita a Meta resolver o diálogo com uma versão padrão diferente da configuração.
  const url = new URL(`https://www.facebook.com/${metaGraphVersion(environment)}/dialog/oauth`);
  url.searchParams.set("client_id", configuration.appId);
  url.searchParams.set("redirect_uri", configuration.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", createFacebookOAuthState(userId, environment));
  url.searchParams.set("auth_type", "rerequest");
  if (configuration.configId) {
    // No Login para Empresas, as permissões pertencem à configuração da Meta.
    url.searchParams.set("config_id", configuration.configId);
    // Obrigatório para receber `code` no Login para Empresas.
    url.searchParams.set("override_default_response_type", "true");
  } else {
    // O fluxo clássico segue o padrão dos conectores open source auditados:
    // scopes explícitos e rerequest para reapresentar permissões adicionadas
    // depois de uma tentativa anterior ter sido recusada.
    const scopes = facebookScopes(environment);
    url.searchParams.set("scope", scopes.join(","));
    if (!scopes.includes("pages_read_engagement")) {
      throw new MetaLinkError(
        "SERVER_CONFIG_MISSING",
        "O OAuth não pode iniciar sem pages_read_engagement, exigida por /me/accounts.",
      );
    }
  }
  return url.toString();
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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
    throw new MetaLinkError(
      "META_AUTH_INVALID",
      message || "A autorização do Facebook é inválida.",
    );
  }
  return payload;
}

/**
 * Confirma que o token pertence a este app e recebeu todas as permissões que
 * serão usadas para descobrir contas e publicar. Tokens nunca são retornados
 * pelo diagnóstico nem incluídos em mensagens de erro.
 */
export async function validateFacebookAccessTokenScopes(input: {
  accessToken: string;
  environment?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
}): Promise<FacebookTokenAuthorization> {
  const environment = input.environment ?? process.env;
  const configuration = facebookOAuthConfiguration(environment);
  const url = new URL(`${facebookGraphBase(environment)}/debug_token`);
  url.searchParams.set("input_token", input.accessToken);
  url.searchParams.set("access_token", `${configuration.appId}|${configuration.appSecret}`);
  const payload = await readJson(await (input.fetch ?? fetch)(url).catch(() => null));
  const data = asObject(asObject(payload)?.["data"]);
  const appId = readString(data, "app_id");
  const valid = data?.["is_valid"] === true;
  const rawScopes = data?.["scopes"];
  const grantedScopes = Array.isArray(rawScopes)
    ? rawScopes.filter((scope): scope is string => typeof scope === "string")
    : typeof rawScopes === "string"
      ? rawScopes
          .split(",")
          .map((scope) => scope.trim())
          .filter(Boolean)
      : [];

  if (!valid || appId !== configuration.appId) {
    throw new MetaLinkError(
      "META_AUTH_INVALID",
      "A Meta retornou um token inválido ou emitido para outro aplicativo.",
    );
  }

  const missingScopes = facebookScopes(environment).filter(
    (scope) => !grantedScopes.includes(scope),
  );
  if (missingScopes.length > 0) {
    throw new MetaLinkError(
      "META_AUTH_INVALID",
      `A Meta não concedeu: ${missingScopes.join(", ")}. Adicione essas permissões ao caso de uso do app e conecte novamente.`,
    );
  }
  return {
    grantedScopes,
    authorizedPageIds: granularTargetIds(data, "pages_"),
    authorizedInstagramIds: granularTargetIds(data, "instagram_"),
  };
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
  const shortBody = new URLSearchParams({
    client_id: configuration.appId,
    client_secret: configuration.appSecret,
    redirect_uri: configuration.redirectUri,
    code: input.code.replace(/#_$/, ""),
  });
  const shortPayload = await readJson(
    await request(shortUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: shortBody,
    }).catch(() => null),
  );
  const shortToken = readString(shortPayload, "access_token");
  if (!shortToken)
    throw new MetaLinkError("META_RESPONSE_INVALID", "A Meta retornou uma resposta inválida.");

  const longUrl = new URL(`${facebookGraphBase(environment)}/oauth/access_token`);
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", configuration.appId);
  longUrl.searchParams.set("client_secret", configuration.appSecret);
  longUrl.searchParams.set("fb_exchange_token", shortToken);
  const longPayload = await readJson(await request(longUrl).catch(() => null));
  const longToken = readString(longPayload, "access_token") ?? shortToken;
  const expiresInRaw = asObject(longPayload)?.["expires_in"];
  const expiresIn =
    typeof expiresInRaw === "number" && expiresInRaw > 0 ? expiresInRaw : 60 * 24 * 60 * 60;
  return { accessToken: longToken, expiresAt: new Date(now + expiresIn * 1000) };
}

export type FacebookPage = {
  pageId: string;
  name: string;
  pageAccessToken: string;
  instagram: { id: string; username: string; displayName?: string | null | undefined } | null;
};

export type FacebookTokenAuthorization = {
  grantedScopes: string[];
  authorizedPageIds: string[];
  authorizedInstagramIds: string[];
};

export type FacebookPageDiscovery = {
  pages: FacebookPage[];
  authorizedPageIds: string[];
  unavailablePageIds: string[];
  /** Mensagens originais da Meta (sem tokens) para diagnosticar falhas de token. */
  diagnostics: string[];
};

export function assertCompleteFacebookPageDiscovery(
  authorization: FacebookTokenAuthorization,
  discovery: FacebookPageDiscovery,
): void {
  if (discovery.unavailablePageIds.length > 0) {
    throw new MetaLinkError(
      "META_ACCOUNT_MISMATCH",
      `A Meta confirmou ${authorization.authorizedPageIds.length} PÃ¡gina(s), mas nÃ£o liberou token de publicaÃ§Ã£o para ${discovery.unavailablePageIds.length}. Clique em Reconectar conta, entre em Editar configuraÃ§Ãµes no Facebook e marque todas as PÃ¡ginas e Instagrams desejados.`,
    );
  }
  if (
    authorization.authorizedPageIds.length > 0 &&
    discovery.pages.length < authorization.authorizedPageIds.length
  ) {
    throw new MetaLinkError(
      "META_ACCOUNT_MISMATCH",
      `AutorizaÃ§Ã£o parcial: a Meta confirmou ${authorization.authorizedPageIds.length} PÃ¡gina(s), mas retornou apenas ${discovery.pages.length} com Page Access Token. Reconecte e aprove todas as PÃ¡ginas na tela de permissÃµes.`,
    );
  }
}

function granularTargetIds(data: Record<string, unknown> | null, prefix: string): string[] {
  const rows = data?.["granular_scopes"];
  if (!Array.isArray(rows)) return [];
  const ids = new Set<string>();
  for (const row of rows) {
    const scope = readString(row, "scope");
    if (!scope?.startsWith(prefix)) continue;
    const targetIds = asObject(row)?.["target_ids"];
    if (!Array.isArray(targetIds)) continue;
    for (const targetId of targetIds) {
      if (typeof targetId === "string" || typeof targetId === "number") {
        const normalized = String(targetId).trim();
        if (/^\d+$/.test(normalized)) ids.add(normalized);
      }
    }
  }
  return [...ids];
}

function parseFacebookPage(value: unknown): FacebookPage | null {
  const pageId = readString(value, "id");
  const name = readString(value, "name");
  const pageAccessToken = readString(value, "access_token");
  if (!pageId || !pageAccessToken) return null;
  const object = asObject(value);
  const igRaw =
    asObject(object?.["instagram_business_account"]) ??
    asObject(object?.["connected_instagram_account"]);
  const igId = readString(igRaw, "id");
  const igUsername = readString(igRaw, "username");
  const igName = readString(igRaw, "name");
  return {
    pageId,
    name: name || `Página ${pageId}`,
    pageAccessToken,
    instagram: igId
      ? {
          id: igId,
          username: (igUsername ?? igId).toLowerCase(),
          ...(igName ? { displayName: igName } : {}),
        }
      : null,
  };
}

function graphRequest(
  url: URL,
  accessToken: string,
  request: typeof fetch,
): Promise<Response | null> {
  return request(url, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
    },
  }).catch(() => null);
}

function isOptionalPageFieldError(error: MetaLinkError): boolean {
  return /nonexisting field|unknown field|tried accessing/i.test(error.message);
}

async function graphPageJson(input: {
  url: URL;
  accessToken: string;
  request: typeof fetch;
  fallbackFields?: string;
}): Promise<unknown> {
  try {
    return await readJson(await graphRequest(input.url, input.accessToken, input.request));
  } catch (error) {
    if (!(error instanceof MetaLinkError) || error.code !== "META_AUTH_INVALID") throw error;
    if (!isOptionalPageFieldError(error)) throw error;
    if (!input.fallbackFields) throw error;
    const fallbackUrl = new URL(input.url);
    fallbackUrl.searchParams.set("fields", input.fallbackFields);
    return readJson(await graphRequest(fallbackUrl, input.accessToken, input.request));
  }
}

/**
 * Combina `/me/accounts` com os IDs granulares escolhidos no diálogo. A Meta
 * pode omitir ativos selecionados da listagem agregada, mas permite consultá-los
 * diretamente para obter o Page Access Token.
 */
export async function fetchFacebookPages(input: {
  accessToken: string;
  authorizedPageIds?: string[];
  environment?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
}): Promise<FacebookPageDiscovery> {
  const environment = input.environment ?? process.env;
  const request = input.fetch ?? fetch;
  const authorizedPageIds = [...new Set(input.authorizedPageIds ?? [])].filter((id) =>
    /^\d+$/.test(id),
  );
  const url = new URL(`${facebookGraphBase(environment)}/me/accounts`);
  url.searchParams.set("fields", FACEBOOK_PAGE_FIELDS);
  url.searchParams.set("limit", "100");
  const pages = new Map<string, FacebookPage>();
  const seenCursors = new Set<string>();
  const diagnostics: string[] = [];
  const listedWithoutToken = new Set<string>();
  for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
    const payload = await graphPageJson({
      url,
      accessToken: input.accessToken,
      request,
      fallbackFields: FACEBOOK_PAGE_FIELDS_FALLBACK,
    });
    const payloadObject = asObject(payload);
    const rows = payloadObject?.["data"];
    if (!Array.isArray(rows)) {
      throw new MetaLinkError("META_RESPONSE_INVALID", "A Meta retornou uma resposta inválida.");
    }
    for (const row of rows) {
      const page = parseFacebookPage(row);
      if (page) {
        pages.set(page.pageId, page);
        continue;
      }
      const listedId = readString(row, "id");
      if (listedId) listedWithoutToken.add(listedId);
    }

    const paging = asObject(payloadObject?.["paging"]);
    const cursors = asObject(paging?.["cursors"]);
    const after = readString(cursors, "after");
    if (!after || seenCursors.has(after)) break;
    seenCursors.add(after);
    url.searchParams.set("after", after);
  }

  if (listedWithoutToken.size > 0) {
    diagnostics.push(
      `A Meta listou ${listedWithoutToken.size} Página(s) em /me/accounts sem access_token.`,
    );
  }

  const unavailablePageIds: string[] = [];
  const missingIds = new Set<string>([...authorizedPageIds, ...listedWithoutToken]);
  for (const pageId of missingIds) {
    if (pages.has(pageId)) continue;
    const pageUrl = new URL(`${facebookGraphBase(environment)}/${pageId}`);
    pageUrl.searchParams.set("fields", FACEBOOK_PAGE_FIELDS);
    try {
      const directPayload = await graphPageJson({
        url: pageUrl,
        accessToken: input.accessToken,
        request,
        fallbackFields: FACEBOOK_PAGE_FIELDS_FALLBACK,
      });
      const page = parseFacebookPage(directPayload);
      if (page) {
        pages.set(page.pageId, page);
        continue;
      }
      unavailablePageIds.push(pageId);
      diagnostics.push(`Página ${pageId}: a Meta respondeu sem access_token.`);
    } catch (error) {
      if (error instanceof MetaLinkError && error.code === "META_AUTH_INVALID") {
        unavailablePageIds.push(pageId);
        diagnostics.push(`Página ${pageId}: ${error.message}`);
        continue;
      }
      throw error;
    }
  }

  return {
    pages: [...pages.values()],
    authorizedPageIds,
    unavailablePageIds,
    diagnostics,
  };
}

export type UnavailableFacebookPage = { pageId: string; name: string };

/**
 * Resolve o nome público de Páginas que não liberaram token de publicação.
 * Falhas individuais não interrompem o fluxo: o ID vira fallback do nome.
 */
export async function fetchUnavailablePageNames(input: {
  pageIds: string[];
  accessToken: string;
  environment?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
}): Promise<UnavailableFacebookPage[]> {
  const environment = input.environment ?? process.env;
  const request = input.fetch ?? fetch;
  const uniqueIds = [...new Set(input.pageIds)].filter((id) => /^\d+$/.test(id));
  return Promise.all(
    uniqueIds.map(async (pageId) => {
      const url = new URL(`${facebookGraphBase(environment)}/${pageId}`);
      url.searchParams.set("fields", "name");
      try {
        const response = await graphRequest(url, input.accessToken, request);
        if (response?.ok) {
          const payload: unknown = await response.json().catch(() => null);
          const name = readString(payload, "name");
          if (name) return { pageId, name };
        }
      } catch {
        // Fallback abaixo: ID como nome.
      }
      return { pageId, name: `Página ${pageId}` };
    }),
  );
}
