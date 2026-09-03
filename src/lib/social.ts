/** Contas sociais conectadas e fila de publicações agendadas (Lovable Cloud). */
import { supabase } from "@/integrations/supabase/client";
import { currentUser } from "@/lib/cloud";
import type { LinkAccountResult } from "@/lib/social-linking.server";
import { disconnectSocialAccount } from "@/lib/social.functions";
import {
  summarizeIssues,
  validateMediaForPlatform,
  type MediaPlatform,
  type MediaSpec,
} from "@/lib/platform-media";

export type PostKind = "reels" | "feed" | "stories" | "shorts";

export const KIND_LABEL: Record<PostKind, string> = {
  reels: "Reels",
  feed: "Feed",
  stories: "Stories",
  shorts: "Shorts",
};

export type SocialAccount = {
  id: string;
  platform: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  provider: string;
  provider_account_id: string | null;
  status: string;
  is_primary?: boolean;
  created_at: string;
  updated_at?: string | null;
};

export function socialAccountTitle(account: SocialAccount): string {
  if (account.platform === "instagram") return `@${account.username}`;
  return account.display_name || account.username;
}

export function socialAccountOptionLabel(account: SocialAccount): string {
  const title = socialAccountTitle(account);
  const platform =
    account.platform === "facebook"
      ? "Facebook"
      : account.platform === "instagram"
        ? "Instagram"
        : account.platform === "youtube"
          ? "YouTube"
          : account.platform;
  const id = account.provider_account_id ? ` · ID ${account.provider_account_id}` : "";
  return `${platform}: ${title}${id}`;
}

export function socialAccountDetail(account: SocialAccount): string {
  const id = account.provider_account_id ? `ID ${account.provider_account_id}` : "sem ID oficial";
  if (account.platform === "instagram") {
    const linked = account.display_name ? ` · ${account.display_name}` : "";
    return `Instagram profissional${linked} · ${id}`;
  }
  if (account.platform === "facebook") return `Página do Facebook · ${id}`;
  if (account.platform === "youtube") return `Canal do YouTube · ${id}`;
  return `${account.provider || "provedor"} · ${id}`;
}

export type MediaType = "video" | "image";

/** Metadados extras enviados ao provedor (hoje usados pelo YouTube). */
export type PublishMeta = {
  youtube?: {
    title?: string;
    description?: string;
    tags?: string[];
    captionsSrt?: string;
    captionsLanguage?: string;
  };
};

export type ScheduledPost = {
  id: string;
  account_id: string | null;
  kind: PostKind;
  caption: string;
  video_url: string | null;
  video_path: string | null;
  media_type: MediaType;
  file_name: string | null;
  scheduled_at: string;
  scheduled_timezone?: string | null;
  publish_meta?: PublishMeta | null;
  status: string;
  attempts: number;
  error: string | null;
  error_code?: string | null;
  published_at: string | null;
  permalink: string | null;
  provider_post_id?: string | null;
};

export const STATUS_LABEL: Record<string, string> = {
  agendado: "Agendado",
  processando: "Publicando",
  publicado: "Publicado",
  falhou: "Falhou",
  cancelado: "Cancelado",
};

export function resolveAccountLinkUi(
  accounts: SocialAccount[],
  result: LinkAccountResult,
): { ok: true; accounts: SocialAccount[] } | { ok: false; error: string } {
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    accounts: [...accounts.filter((account) => account.id !== result.account.id), result.account],
  };
}

/* ------------------------------- contas -------------------------------- */

export const SOCIAL_ACCOUNT_SELECT =
  "id,platform,username,display_name,avatar_url,provider,status,provider_account_id,is_primary,created_at,updated_at";

export async function listAccounts(): Promise<SocialAccount[]> {
  const { data, error } = await supabase
    .from("social_accounts")
    .select(SOCIAL_ACCOUNT_SELECT)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SocialAccount[];
}

/** Renomeia o apelido local da conta (não altera o nome na plataforma). */
export async function renameAccount(id: string, displayName: string) {
  const name = displayName.trim();
  if (!name) throw new Error("Informe um nome para o canal.");
  const { error } = await supabase
    .from("social_accounts")
    .update({ display_name: name })
    .eq("id", id);
  if (error) throw error;
}

export async function removeAccount(id: string) {
  // A tabela de conexões é server-only; a remoção acontece no servidor com service role.
  const result = await disconnectSocialAccount({ data: { accountId: id } });
  if (!result.ok) throw new Error(result.error);
}

/* ---------------------------- mídia no storage --------------------------- */

/** Sobe o arquivo (vídeo ou foto) para o bucket privado e devolve caminho + link assinado. */
export async function uploadPostMedia(file: File | Blob, fileName: string) {
  const user = await currentUser();
  if (!user) throw new Error("Faça login para enviar o arquivo.");
  const safe = fileName.replace(/[^\w.-]+/g, "_");
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  const isImage =
    (file as File).type?.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(fileName);
  const { error } = await supabase.storage.from("posts").upload(path, file, {
    contentType: (file as File).type || (isImage ? "image/jpeg" : "video/mp4"),
    upsert: false,
  });
  if (error) throw error;
  const { data } = await supabase.storage.from("posts").createSignedUrl(path, 60 * 60 * 24 * 7);
  return { path, url: data?.signedUrl ?? null };
}

/** Alias legado. */
export const uploadPostVideo = uploadPostMedia;

/* ----------------------------- agendamentos ------------------------------ */

export type NewPost = {
  accountId: string | null;
  kind: PostKind;
  caption: string;
  scheduledAt: Date;
  videoPath?: string | null;
  videoUrl?: string | null;
  fileName?: string | null;
  mediaType?: MediaType;
  consent?: boolean;
  /** Medidas do arquivo, quando conhecidas, para validar limites da plataforma. */
  media?: MediaSpec;
  /** Fuso escolhido pelo usuário (IANA). O instante salvo continua em UTC. */
  timezone?: string;
  /** Título/descrição/tags/legenda para o YouTube. */
  publishMeta?: PublishMeta;
};

export async function schedulePost(p: NewPost) {
  const user = await currentUser();
  if (!user) throw new Error("Faça login para agendar.");
  if (!p.accountId) throw new Error("Selecione uma conta conectada para publicar.");
  if (!p.consent) throw new Error("Confirme o consentimento para enviar este video a rede social.");

  const { data: account, error: accountError } = await supabase
    .from("social_accounts")
    .select("id,status,provider,provider_account_id,platform")
    .eq("id", p.accountId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (accountError) throw accountError;
  const connected = account?.status === "connected" || account?.status === "conectado";
  if (!account || !connected || !account.provider_account_id || account.provider === "pending") {
    throw new Error(
      "Esta conta ainda nao tem conexao OAuth/API valida. Conecte pelo provedor oficial antes de agendar.",
    );
  }

  // Validação por plataforma: evita agendar algo que o provedor recusaria.
  const platform = account.platform as MediaPlatform;
  if (["instagram", "facebook", "tiktok", "youtube"].includes(platform)) {
    const check = validateMediaForPlatform(platform, p.kind, {
      ...(p.media ?? {}),
      mediaType: p.mediaType ?? p.media?.mediaType ?? "video",
      format: p.media?.format ?? p.fileName?.split(".").pop() ?? null,
      captionLength: p.caption.length,
    });
    if (!check.ok) throw new Error(summarizeIssues(check.issues));
  }

  const { data, error } = await supabase
    .from("scheduled_posts")
    .insert({
      user_id: user.id,
      account_id: p.accountId,
      kind: p.kind,
      caption: p.caption,
      scheduled_at: p.scheduledAt.toISOString(),
      scheduled_timezone: p.timezone ?? null,
      publish_meta: (p.publishMeta ?? {}) as never,
      video_path: p.videoPath ?? null,
      video_url: p.videoUrl ?? null,
      file_name: p.fileName ?? null,
      media_type: p.mediaType ?? "video",
      status: "agendado",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data?.id as string;
}

export async function listPosts(limit = 200): Promise<ScheduledPost[]> {
  const { data, error } = await supabase
    .from("scheduled_posts")
    .select(
      "id,account_id,kind,caption,video_url,video_path,media_type,file_name,scheduled_at,scheduled_timezone,publish_meta,status,attempts,error,error_code,published_at,permalink,provider_post_id",
    )
    .order("scheduled_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ScheduledPost[];
}

export async function cancelPost(id: string) {
  const { error } = await supabase
    .from("scheduled_posts")
    .update({ status: "cancelado" })
    .eq("id", id);
  if (error) throw error;
}

export async function reschedulePost(id: string, when: Date) {
  const { error } = await supabase
    .from("scheduled_posts")
    .update({
      scheduled_at: when.toISOString(),
      status: "agendado",
      attempts: 0,
      error: null,
      error_code: null,
      next_attempt_at: null,
      lock_id: null,
      locked_at: null,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deletePost(id: string) {
  const { error } = await supabase.from("scheduled_posts").delete().eq("id", id);
  if (error) throw error;
}
