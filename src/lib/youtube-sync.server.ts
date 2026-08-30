/**
 * Sincroniza os canais do YouTube já autorizados: usa o refresh_token salvo de
 * cada conexão para renovar o acesso, relistar TODOS os canais da conta Google
 * e manter cada canal como uma conexão separada (upsert).
 */
import { decryptSocialToken } from "@/lib/social-credentials.server";
import { MetaLinkError, type LinkedSocialAccount } from "@/lib/social-linking.server";
import {
  fetchYoutubeChannelById,
  fetchYoutubeChannels,
  refreshYoutubeAccessToken,
} from "@/lib/youtube-oauth.server";
import { persistYoutubeAccount } from "@/lib/youtube-persistence.server";

type AdminClient = { from: (table: string) => any };

export async function syncYoutubeChannelsForUser(
  admin: AdminClient,
  userId: string,
): Promise<{ accounts: LinkedSocialAccount[]; channels: string[] }> {
  const { data: connections, error } = await admin
    .from("social_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", "youtube");

  if (error) {
    throw new MetaLinkError("DATABASE_ERROR", "Não foi possível ler as conexões do YouTube.");
  }
  const ids = (connections ?? []).map((row: { id: string }) => row.id);
  if (ids.length === 0) {
    throw new MetaLinkError(
      "META_AUTH_INVALID",
      "Nenhum canal do YouTube conectado ainda. Conecte sua conta Google primeiro.",
    );
  }

  const { data: credentials, error: credentialError } = await admin
    .from("social_connection_credentials")
    .select("connection_id,refresh_token_ciphertext")
    .in("connection_id", ids);

  if (credentialError) {
    throw new MetaLinkError("DATABASE_ERROR", "Não foi possível ler as credenciais do YouTube.");
  }

  const refreshTokens = new Set<string>();
  for (const row of credentials ?? []) {
    const ciphertext = (row as { refresh_token_ciphertext: string | null })
      .refresh_token_ciphertext;
    if (!ciphertext) continue;
    try {
      const token = decryptSocialToken(ciphertext);
      if (token) refreshTokens.add(token);
    } catch {
      // credencial de outra chave de criptografia — exige reconexão
    }
  }

  if (refreshTokens.size === 0) {
    throw new MetaLinkError(
      "META_AUTH_INVALID",
      "As credenciais salvas do YouTube não podem ser usadas. Conecte o YouTube novamente.",
    );
  }

  const accounts: LinkedSocialAccount[] = [];
  const channelTitles: string[] = [];
  const seen = new Set<string>();
  let lastError: unknown = null;

  for (const refreshToken of refreshTokens) {
    try {
      const refreshed = await refreshYoutubeAccessToken({ refreshToken });
      const channels = await fetchYoutubeChannels({ accessToken: refreshed.accessToken });
      for (const channel of channels) {
        if (seen.has(channel.channelId)) continue;
        seen.add(channel.channelId);
        accounts.push(
          await persistYoutubeAccount(admin, {
            userId,
            channel,
            tokens: {
              accessToken: refreshed.accessToken,
              refreshToken,
              expiresAt: refreshed.expiresAt,
              scope: "",
            },
          }),
        );
        channelTitles.push(channel.title);
      }
    } catch (failure) {
      lastError = failure;
    }
  }

  if (accounts.length === 0) {
    if (lastError instanceof MetaLinkError) throw lastError;
    throw new MetaLinkError(
      "META_AUTH_INVALID",
      "Não foi possível atualizar os canais do YouTube. Conecte novamente.",
    );
  }

  return { accounts, channels: channelTitles };
}

/** Sincroniza UM canal do YouTube, atualizando nome, handle e avatar pelo ID oficial. */
export async function syncSingleYoutubeChannel(
  admin: AdminClient,
  userId: string,
  accountId: string,
): Promise<LinkedSocialAccount> {
  const { data: account, error: accountError } = await admin
    .from("social_accounts")
    .select("id,provider_account_id")
    .eq("id", accountId)
    .eq("user_id", userId)
    .eq("platform", "youtube")
    .maybeSingle();

  if (accountError || !account) {
    throw new MetaLinkError("DATABASE_ERROR", "Canal do YouTube não encontrado.");
  }
  const channelId = (account as { provider_account_id: string | null }).provider_account_id;
  if (!channelId) {
    throw new MetaLinkError("DATABASE_ERROR", "Canal do YouTube sem ID oficial.");
  }

  const { data: connection, error: connectionError } = await admin
    .from("social_connections")
    .select("id")
    .eq("social_account_id", accountId)
    .eq("provider", "youtube")
    .maybeSingle();

  if (connectionError || !connection) {
    throw new MetaLinkError("DATABASE_ERROR", "Conexão do YouTube não encontrada.");
  }

  const { data: credential, error: credentialError } = await admin
    .from("social_connection_credentials")
    .select("refresh_token_ciphertext")
    .eq("connection_id", connection.id)
    .maybeSingle();

  if (credentialError || !credential) {
    throw new MetaLinkError("DATABASE_ERROR", "Credenciais do YouTube não encontradas.");
  }

  const ciphertext = (credential as { refresh_token_ciphertext: string | null })
    .refresh_token_ciphertext;
  if (!ciphertext) {
    throw new MetaLinkError(
      "META_AUTH_INVALID",
      "Credenciais do YouTube inválidas. Conecte novamente.",
    );
  }

  let refreshToken: string;
  try {
    refreshToken = decryptSocialToken(ciphertext);
  } catch {
    throw new MetaLinkError(
      "META_AUTH_INVALID",
      "Credenciais do YouTube inválidas. Conecte novamente.",
    );
  }
  if (!refreshToken) {
    throw new MetaLinkError(
      "META_AUTH_INVALID",
      "Credenciais do YouTube inválidas. Conecte novamente.",
    );
  }

  const refreshed = await refreshYoutubeAccessToken({ refreshToken });
  const channel = await fetchYoutubeChannelById({
    accessToken: refreshed.accessToken,
    channelId,
  });

  return persistYoutubeAccount(admin, {
    userId,
    channel,
    tokens: {
      accessToken: refreshed.accessToken,
      refreshToken,
      expiresAt: refreshed.expiresAt,
      scope: "",
    },
  });
}
