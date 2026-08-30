/**
 * Sincroniza as Páginas do Facebook e os Instagram Business já autorizados.
 * Usa o token de Página salvo (criptografado) para reler nome e IG vinculado,
 * mantendo cada Página e cada Instagram como uma conexão separada.
 */
import { decryptSocialToken } from "@/lib/social-credentials.server";
import { MetaLinkError, type LinkedSocialAccount } from "@/lib/social-linking.server";
import { facebookGraphBase } from "@/lib/meta.server";
import { persistFacebookPages } from "@/lib/facebook-persistence.server";
import type { FacebookPage } from "@/lib/facebook-oauth.server";

type AdminClient = { from: (table: string) => any };

function readString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "string" ? raw : null;
}

async function readPage(
  pageId: string,
  accessToken: string,
  request: typeof fetch,
): Promise<FacebookPage | null> {
  const url = new URL(`${facebookGraphBase()}/${pageId}`);
  url.searchParams.set("fields", "id,name,instagram_business_account{id,username}");
  const response = await request(url, {
    headers: { accept: "application/json", authorization: `Bearer ${accessToken}` },
  }).catch(() => null);
  if (!response || !response.ok) return null;
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!payload) return null;
  const igRaw = payload["instagram_business_account"];
  const igId = readString(igRaw, "id");
  const igUsername = readString(igRaw, "username");
  return {
    pageId,
    name: readString(payload, "name") ?? `Página ${pageId}`,
    pageAccessToken: accessToken,
    instagram: igId ? { id: igId, username: (igUsername ?? igId).toLowerCase() } : null,
  };
}

export async function syncMetaAccountsForUser(
  admin: AdminClient,
  userId: string,
  request: typeof fetch = fetch,
): Promise<{ accounts: LinkedSocialAccount[]; facebook: string[]; instagram: string[] }> {
  const { data: accountRows, error: accountError } = await admin
    .from("social_accounts")
    .select("id,provider_account_id")
    .eq("user_id", userId)
    .eq("platform", "facebook");

  if (accountError) {
    throw new MetaLinkError("DATABASE_ERROR", "Não foi possível ler as Páginas conectadas.");
  }
  const pageAccounts = (accountRows ?? []).filter(
    (row: { provider_account_id: string | null }) => row.provider_account_id,
  );
  if (pageAccounts.length === 0) {
    throw new MetaLinkError(
      "META_AUTH_INVALID",
      "Nenhuma Página conectada ainda. Autorize a Meta primeiro.",
    );
  }

  const { data: connections, error: connectionError } = await admin
    .from("social_connections")
    .select("id,social_account_id,expires_at")
    .eq("user_id", userId)
    .in(
      "social_account_id",
      pageAccounts.map((row: { id: string }) => row.id),
    );

  if (connectionError) {
    throw new MetaLinkError("DATABASE_ERROR", "Não foi possível ler as conexões Meta.");
  }

  const { data: credentials, error: credentialError } = await admin
    .from("social_connection_credentials")
    .select("connection_id,access_token_ciphertext,expires_at")
    .in(
      "connection_id",
      (connections ?? []).map((row: { id: string }) => row.id),
    );

  if (credentialError) {
    throw new MetaLinkError("DATABASE_ERROR", "Não foi possível ler as credenciais Meta.");
  }

  const credentialByConnection = new Map<string, { ciphertext: string; expiresAt: string }>();
  for (const row of credentials ?? []) {
    const typed = row as {
      connection_id: string;
      access_token_ciphertext: string;
      expires_at: string;
    };
    credentialByConnection.set(typed.connection_id, {
      ciphertext: typed.access_token_ciphertext,
      expiresAt: typed.expires_at,
    });
  }

  const pages: Array<{ page: FacebookPage; expiresAt: Date }> = [];
  for (const connection of connections ?? []) {
    const typed = connection as { id: string; social_account_id: string; expires_at: string | null };
    const credential = credentialByConnection.get(typed.id);
    const account = pageAccounts.find((row: { id: string }) => row.id === typed.social_account_id);
    if (!credential || !account?.provider_account_id) continue;
    let accessToken: string;
    try {
      accessToken = decryptSocialToken(credential.ciphertext);
    } catch {
      continue;
    }
    const page = await readPage(account.provider_account_id, accessToken, request);
    if (!page) continue;
    const expiresAt = new Date(credential.expiresAt ?? typed.expires_at ?? Date.now());
    pages.push({ page, expiresAt: Number.isFinite(expiresAt.getTime()) ? expiresAt : new Date() });
  }

  if (pages.length === 0) {
    throw new MetaLinkError(
      "META_AUTH_INVALID",
      "Os tokens das Páginas expiraram. Clique em Atualizar Meta e autorize novamente.",
    );
  }

  const accounts: LinkedSocialAccount[] = [];
  for (const entry of pages) {
    accounts.push(
      ...(await persistFacebookPages(admin, {
        userId,
        pages: [entry.page],
        expiresAt: entry.expiresAt,
      })),
    );
  }

  return {
    accounts,
    facebook: pages.map((entry) => entry.page.name),
    instagram: pages.flatMap((entry) =>
      entry.page.instagram ? [entry.page.instagram.username] : [],
    ),
  };
}
