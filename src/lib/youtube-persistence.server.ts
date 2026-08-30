/** Persiste o canal do YouTube autorizado por cada usuário (token + refresh criptografados). */
import { encryptSocialToken } from "@/lib/social-credentials.server";
import { MetaLinkError, type LinkedSocialAccount } from "@/lib/social-linking.server";
import type { YoutubeChannel, YoutubeTokens } from "@/lib/youtube-oauth.server";

type AdminClient = { from: (table: string) => any };

const ACCOUNT_SELECT =
  "id,platform,username,display_name,avatar_url,provider,provider_account_id,status,created_at";

export async function persistYoutubeAccount(
  admin: AdminClient,
  input: { userId: string; channel: YoutubeChannel; tokens: YoutubeTokens },
): Promise<LinkedSocialAccount> {
  const now = new Date().toISOString();
  const accountValues = {
    user_id: input.userId,
    platform: "youtube",
    username: input.channel.handle,
    display_name: input.channel.title,
    avatar_url: input.channel.avatarUrl,
    provider: "youtube",
    provider_account_id: input.channel.channelId,
    status: "conectado",
    updated_at: now,
  };

  // O ID oficial do canal é imutável. O handle e o título podem mudar, então
  // não podem decidir se uma nova autorização substitui uma conexão existente.
  const { data: existing, error: lookupError } = await admin
    .from("social_accounts")
    .select("id")
    .eq("user_id", input.userId)
    .eq("platform", "youtube")
    .eq("provider_account_id", input.channel.channelId)
    .maybeSingle();

  if (lookupError) {
    throw new MetaLinkError("DATABASE_ERROR", "Não foi possível localizar o canal do YouTube.");
  }

  const accountQuery = existing?.id
    ? admin.from("social_accounts").update(accountValues).eq("id", existing.id)
    : admin.from("social_accounts").insert(accountValues);
  const { data: account, error: accountError } = await accountQuery
    .select(ACCOUNT_SELECT)
    .single();

  if (accountError || !account) {
    throw new MetaLinkError("DATABASE_ERROR", "Não foi possível salvar o canal do YouTube.");
  }

  const { data: connection, error: connectionError } = await admin
    .from("social_connections")
    .upsert(
      {
        user_id: input.userId,
        social_account_id: account.id,
        provider: "youtube",
        provider_account_id: input.channel.channelId,
        status: "conectado",
        // O refresh token do Google não expira sozinho (só por revogação/6 meses sem uso).
        expires_at: null,
        updated_at: now,
      },
      { onConflict: "social_account_id" },
    )
    .select("id")
    .single();

  if (connectionError || !connection) {
    throw new MetaLinkError("DATABASE_ERROR", "Não foi possível salvar a conexão do YouTube.");
  }

  const { error: credentialError } = await admin.from("social_connection_credentials").upsert(
    {
      connection_id: connection.id,
      access_token_ciphertext: encryptSocialToken(input.tokens.accessToken),
      refresh_token_ciphertext: encryptSocialToken(input.tokens.refreshToken),
      expires_at: input.tokens.expiresAt.toISOString(),
      refresh_expires_at: null,
      updated_at: now,
    },
    { onConflict: "connection_id" },
  );

  if (credentialError) {
    throw new MetaLinkError("DATABASE_ERROR", "Não foi possível salvar a credencial do YouTube.");
  }

  return account as LinkedSocialAccount;
}
