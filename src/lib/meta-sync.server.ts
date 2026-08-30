/** Atualiza cada canal Meta salvo sem recriar canais que o usuario desmarcou. */
import { persistMetaAccount } from "@/lib/facebook-persistence.server";
import { facebookGraphBase } from "@/lib/meta.server";
import { decryptSocialToken } from "@/lib/social-credentials.server";
import { MetaLinkError, type LinkedSocialAccount } from "@/lib/social-linking.server";

type AdminClient = { from: (table: string) => any };
type Platform = "facebook" | "instagram";

type StoredAccount = {
  id: string;
  platform: Platform;
  provider_account_id: string;
};

function readString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "string" ? raw : typeof raw === "number" ? String(raw) : null;
}

async function fetchChannel(input: {
  platform: Platform;
  providerAccountId: string;
  accessToken: string;
  request: typeof fetch;
}): Promise<{ username: string; displayName: string } | null> {
  const url = new URL(`${facebookGraphBase()}/${input.providerAccountId}`);
  url.searchParams.set("fields", input.platform === "facebook" ? "id,name" : "id,username,name");
  const response = await input
    .request(url, {
      headers: { accept: "application/json", authorization: `Bearer ${input.accessToken}` },
    })
    .catch(() => null);
  if (!response?.ok) return null;
  const payload: unknown = await response.json().catch(() => null);
  const id = readString(payload, "id");
  if (id !== input.providerAccountId) return null;
  if (input.platform === "facebook") {
    return {
      username: input.providerAccountId,
      displayName: readString(payload, "name") ?? `Pagina ${input.providerAccountId}`,
    };
  }
  const username = readString(payload, "username")?.toLowerCase();
  if (!username) return null;
  return {
    username,
    displayName: readString(payload, "name") ?? `@${username}`,
  };
}

export async function syncMetaAccountsForUser(
  admin: AdminClient,
  userId: string,
  request: typeof fetch = fetch,
): Promise<{
  accounts: LinkedSocialAccount[];
  facebook: string[];
  instagram: string[];
  failed: number;
}> {
  const { data: accountRows, error: accountError } = await admin
    .from("social_accounts")
    .select("id,platform,provider_account_id")
    .eq("user_id", userId)
    .eq("provider", "meta")
    .in("platform", ["facebook", "instagram"]);

  if (accountError) {
    throw new MetaLinkError("DATABASE_ERROR", "Nao foi possivel ler as contas Meta.");
  }
  const stored = (accountRows ?? []).filter(
    (row: StoredAccount) =>
      (row.platform === "facebook" || row.platform === "instagram") &&
      Boolean(row.provider_account_id),
  ) as StoredAccount[];
  if (stored.length === 0) {
    throw new MetaLinkError(
      "META_AUTH_INVALID",
      "Nenhuma Pagina ou Instagram esta conectado. Autorize a Meta primeiro.",
    );
  }

  const { data: connections, error: connectionError } = await admin
    .from("social_connections")
    .select("id,social_account_id,expires_at")
    .eq("user_id", userId)
    .in(
      "social_account_id",
      stored.map((account) => account.id),
    );
  if (connectionError) {
    throw new MetaLinkError("DATABASE_ERROR", "Nao foi possivel ler as conexoes Meta.");
  }

  const connectionByAccount = new Map<string, { id: string; expires_at: string | null }>();
  for (const row of connections ?? []) {
    const connection = row as { id: string; social_account_id: string; expires_at: string | null };
    connectionByAccount.set(connection.social_account_id, connection);
  }
  const connectionIds = [...connectionByAccount.values()].map((connection) => connection.id);
  if (connectionIds.length === 0) {
    throw new MetaLinkError(
      "META_AUTH_INVALID",
      "As conexoes Meta nao possuem credenciais. Autorize novamente.",
    );
  }

  const { data: credentials, error: credentialError } = await admin
    .from("social_connection_credentials")
    .select("connection_id,access_token_ciphertext,expires_at")
    .in("connection_id", connectionIds);
  if (credentialError) {
    throw new MetaLinkError("DATABASE_ERROR", "Nao foi possivel ler as credenciais Meta.");
  }
  const credentialByConnection = new Map<string, { ciphertext: string; expiresAt: string }>();
  for (const row of credentials ?? []) {
    const credential = row as {
      connection_id: string;
      access_token_ciphertext: string;
      expires_at: string;
    };
    credentialByConnection.set(credential.connection_id, {
      ciphertext: credential.access_token_ciphertext,
      expiresAt: credential.expires_at,
    });
  }

  const saved: LinkedSocialAccount[] = [];
  const failedIds: string[] = [];
  for (const account of stored) {
    const connection = connectionByAccount.get(account.id);
    const credential = connection ? credentialByConnection.get(connection.id) : null;
    if (!connection || !credential) {
      failedIds.push(account.id);
      continue;
    }
    const expiresAt = new Date(credential.expiresAt ?? connection.expires_at ?? 0);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) {
      failedIds.push(account.id);
      continue;
    }
    let accessToken: string;
    try {
      accessToken = decryptSocialToken(credential.ciphertext);
    } catch {
      failedIds.push(account.id);
      continue;
    }
    const channel = await fetchChannel({
      platform: account.platform,
      providerAccountId: account.provider_account_id,
      accessToken,
      request,
    });
    if (!channel) {
      failedIds.push(account.id);
      continue;
    }
    saved.push(
      await persistMetaAccount(admin, {
        userId,
        platform: account.platform,
        username: channel.username,
        displayName: channel.displayName,
        providerAccountId: account.provider_account_id,
        accessToken,
        expiresAt,
      }),
    );
  }

  if (failedIds.length > 0) {
    await admin
      .from("social_accounts")
      .update({ status: "reautorizacao", updated_at: new Date().toISOString() })
      .in("id", failedIds)
      .eq("user_id", userId);
  }
  if (saved.length === 0) {
    throw new MetaLinkError(
      "META_AUTH_INVALID",
      "Todas as conexoes Meta precisam de reautorizacao. Clique em Atualizar Meta.",
    );
  }

  return {
    accounts: saved,
    facebook: saved
      .filter((account) => account.platform === "facebook")
      .map((account) => account.display_name ?? account.username),
    instagram: saved
      .filter((account) => account.platform === "instagram")
      .map((account) => account.username),
    failed: failedIds.length,
  };
}
