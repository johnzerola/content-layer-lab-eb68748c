/** Persiste a conta TikTok autorizada por cada usuário (token + refresh criptografados). */
import { encryptSocialToken } from "@/lib/social-credentials.server";
import { MetaLinkError, type LinkedSocialAccount } from "@/lib/social-linking.server";
import type { TikTokProfile, TikTokTokens } from "@/lib/tiktok-oauth.server";

type AdminClient = { from: (table: string) => any };

const ACCOUNT_SELECT =
  "id,platform,username,display_name,avatar_url,provider,provider_account_id,status,created_at";

export async function persistTikTokAccount(
  admin: AdminClient,
  input: { userId: string; profile: TikTokProfile; tokens: TikTokTokens },
): Promise<LinkedSocialAccount> {
  const now = new Date().toISOString();
  const providerAccountId = input.tokens.openId || input.profile.openId;

  const { data: account, error: accountError } = await admin
    .from("social_accounts")
    .upsert(
      {
        user_id: input.userId,
        platform: "tiktok",
        username: input.profile.username,
        display_name: input.profile.displayName,
        avatar_url: input.profile.avatarUrl,
        provider: "tiktok",
        provider_account_id: providerAccountId,
        status: "conectado",
        updated_at: now,
      },
      { onConflict: "user_id,platform,username" },
    )
    .select(ACCOUNT_SELECT)
    .single();

  if (accountError || !account) {
    throw new MetaLinkError("DATABASE_ERROR", "Não foi possível salvar a conta do TikTok.");
  }

  const { data: connection, error: connectionError } = await admin
    .from("social_connections")
    .upsert(
      {
        user_id: input.userId,
        social_account_id: account.id,
        provider: "tiktok",
        provider_account_id: providerAccountId,
        status: "conectado",
        // A conexão vale enquanto o refresh token for válido (o access token é renovado sozinho).
        expires_at: input.tokens.refreshExpiresAt.toISOString(),
        updated_at: now,
      },
      { onConflict: "social_account_id" },
    )
    .select("id")
    .single();

  if (connectionError || !connection) {
    throw new MetaLinkError("DATABASE_ERROR", "Não foi possível salvar a conexão do TikTok.");
  }

  const { error: credentialError } = await admin.from("social_connection_credentials").upsert(
    {
      connection_id: connection.id,
      access_token_ciphertext: encryptSocialToken(input.tokens.accessToken),
      refresh_token_ciphertext: encryptSocialToken(input.tokens.refreshToken),
      expires_at: input.tokens.expiresAt.toISOString(),
      refresh_expires_at: input.tokens.refreshExpiresAt.toISOString(),
      updated_at: now,
    },
    { onConflict: "connection_id" },
  );

  if (credentialError) {
    throw new MetaLinkError("DATABASE_ERROR", "Não foi possível salvar a credencial do TikTok.");
  }

  return account as LinkedSocialAccount;
}
