/** Persiste Páginas do Facebook (e IG Business vinculado) como contas publicáveis. */
import { encryptSocialToken } from "@/lib/social-credentials.server";
import { MetaLinkError, type LinkedSocialAccount } from "@/lib/social-linking.server";
import type { FacebookPage } from "@/lib/facebook-oauth.server";
import { metaChannelKey } from "@/lib/meta-selection.server";

type AdminClient = {
  from: (table: string) => any;
};

const ACCOUNT_SELECT =
  "id,platform,username,display_name,avatar_url,provider,provider_account_id,status,created_at";

export async function persistMetaAccount(
  admin: AdminClient,
  input: {
    userId: string;
    platform: "facebook" | "instagram";
    username: string;
    displayName: string;
    providerAccountId: string;
    accessToken: string;
    expiresAt: Date;
  },
): Promise<LinkedSocialAccount> {
  // Falha antes de criar registros se a chave de criptografia estiver ausente.
  const encryptedAccessToken = encryptSocialToken(input.accessToken);

  const { data: existing, error: existingError } = await admin
    .from("social_accounts")
    .select("id")
    .eq("user_id", input.userId)
    .eq("platform", input.platform)
    .eq("provider", "meta")
    .eq("provider_account_id", input.providerAccountId)
    .maybeSingle();

  if (existingError) {
    throw new MetaLinkError("DATABASE_ERROR", "Não foi possível localizar a conta conectada.");
  }

  const accountResult = existing
    ? await admin
        .from("social_accounts")
        .update({
          username: input.username,
          display_name: input.displayName,
          provider: "meta",
          provider_account_id: input.providerAccountId,
          status: "conectado",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select(ACCOUNT_SELECT)
        .single()
    : await admin
        .from("social_accounts")
        .upsert(
          {
            user_id: input.userId,
            platform: input.platform,
            username: input.username,
            display_name: input.displayName,
            provider: "meta",
            provider_account_id: input.providerAccountId,
            status: "conectado",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,platform,username" },
        )
        .select(ACCOUNT_SELECT)
        .single();
  const { data: account, error: accountError } = accountResult;

  if (accountError || !account) {
    throw new MetaLinkError("DATABASE_ERROR", "Não foi possível salvar a conta conectada.");
  }

  const { data: connection, error: connectionError } = await admin
    .from("social_connections")
    .upsert(
      {
        user_id: input.userId,
        social_account_id: account.id,
        provider: "meta",
        provider_account_id: input.providerAccountId,
        status: "conectado",
        expires_at: input.expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "social_account_id" },
    )
    .select("id")
    .single();

  if (connectionError || !connection) {
    throw new MetaLinkError("DATABASE_ERROR", "Não foi possível salvar a conexão social.");
  }

  const { error: credentialError } = await admin.from("social_connection_credentials").upsert(
    {
      connection_id: connection.id,
      access_token_ciphertext: encryptedAccessToken,
      expires_at: input.expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connection_id" },
  );

  if (credentialError) {
    throw new MetaLinkError("DATABASE_ERROR", "Não foi possível salvar a credencial da conta.");
  }

  return account as LinkedSocialAccount;
}

/** Grava todas as Páginas autorizadas e as contas Instagram Business ligadas a elas. */
export async function persistFacebookPages(
  admin: AdminClient,
  input: {
    userId: string;
    pages: FacebookPage[];
    expiresAt: Date;
    selectedChannelKeys?: string[];
  },
): Promise<LinkedSocialAccount[]> {
  const saved: LinkedSocialAccount[] = [];
  const selected = input.selectedChannelKeys ? new Set(input.selectedChannelKeys) : null;
  for (const page of input.pages) {
    if (!selected || selected.has(metaChannelKey("facebook", page.pageId))) {
      saved.push(
        await persistMetaAccount(admin, {
          userId: input.userId,
          platform: "facebook",
          username: page.pageId,
          displayName: page.name,
          providerAccountId: page.pageId,
          accessToken: page.pageAccessToken,
          expiresAt: input.expiresAt,
        }),
      );
    }
    if (
      page.instagram &&
      (!selected || selected.has(metaChannelKey("instagram", page.instagram.id)))
    ) {
      saved.push(
        await persistMetaAccount(admin, {
          userId: input.userId,
          platform: "instagram",
          username: page.instagram.username,
          displayName: page.name,
          providerAccountId: page.instagram.id,
          // O token da Página publica em nome da conta IG Business vinculada.
          accessToken: page.pageAccessToken,
          expiresAt: input.expiresAt,
        }),
      );
    }
  }
  return saved;
}
