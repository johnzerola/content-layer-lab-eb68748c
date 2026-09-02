import { createServerFn } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ProfileStats = {
  id: string;
  platform: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  provider: string;
  providerAccountId: string | null;
  status: string;
  isPrimary: boolean;
  /** conexão (token) */
  connectionStatus: string | null;
  tokenExpiresAt: string | null;
  /** agenda */
  scheduled: number;
  published: number;
  failed: number;
  processing: number;
  lastPublishedAt: string | null;
  lastPermalink: string | null;
  nextScheduledAt: string | null;
  nextScheduledKind: string | null;
  lastError: string | null;
  byKind: { kind: string; count: number }[];
};

type PostRow = {
  account_id: string | null;
  kind: string;
  status: string;
  scheduled_at: string;
  published_at: string | null;
  permalink: string | null;
  error: string | null;
};

export const getSocialProfiles = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProfileStats[]> => {
    const [accountsRes, connectionsRes, postsRes] = await Promise.all([
      context.supabase
        .from("social_accounts")
        .select(
          "id, platform, username, display_name, avatar_url, provider, provider_account_id, status, is_primary, created_at",
        )
        .eq("user_id", context.userId)
        .order("created_at", { ascending: true }),
      context.supabase
        .from("social_connections")
        .select("social_account_id, status, expires_at")
        .eq("user_id", context.userId),
      context.supabase
        .from("scheduled_posts")
        .select("account_id, kind, status, scheduled_at, published_at, permalink, error")
        .eq("user_id", context.userId),
    ]);

    if (accountsRes.error) throw accountsRes.error;
    if (connectionsRes.error) throw connectionsRes.error;
    if (postsRes.error) throw postsRes.error;

    const connections = new Map<string, { status: string | null; expires_at: string | null }>();
    for (const c of connectionsRes.data ?? []) {
      connections.set(c.social_account_id, { status: c.status, expires_at: c.expires_at });
    }

    const posts = (postsRes.data ?? []) as PostRow[];
    const now = Date.now();

    return (accountsRes.data ?? []).map((a) => {
      const mine = posts.filter((p) => p.account_id === a.id);
      const published = mine.filter((p) => p.status === "publicado");
      const failed = mine.filter((p) => p.status === "falhou");
      const processing = mine.filter((p) => p.status === "processando");
      const upcoming = mine
        .filter((p) => p.status === "agendado" || p.status === "processando")
        .filter((p) => new Date(p.scheduled_at).getTime() >= now - 60_000)
        .sort((x, y) => new Date(x.scheduled_at).getTime() - new Date(y.scheduled_at).getTime());

      const lastPublished = [...published].sort(
        (x, y) =>
          new Date(y.published_at ?? y.scheduled_at).getTime() -
          new Date(x.published_at ?? x.scheduled_at).getTime(),
      )[0];
      const lastFailed = [...failed].sort(
        (x, y) => new Date(y.scheduled_at).getTime() - new Date(x.scheduled_at).getTime(),
      )[0];

      const kinds = new Map<string, number>();
      for (const p of mine) kinds.set(p.kind, (kinds.get(p.kind) ?? 0) + 1);

      const conn = connections.get(a.id) ?? null;

      return {
        id: a.id,
        platform: a.platform,
        username: a.username,
        displayName: a.display_name,
        avatarUrl: a.avatar_url,
        provider: a.provider,
        providerAccountId: a.provider_account_id,
        status: a.status,
        isPrimary: a.is_primary,
        connectionStatus: conn?.status ?? null,
        tokenExpiresAt: conn?.expires_at ?? null,
        scheduled: mine.filter((p) => p.status === "agendado").length,
        published: published.length,
        failed: failed.length,
        processing: processing.length,
        lastPublishedAt: lastPublished?.published_at ?? null,
        lastPermalink: lastPublished?.permalink ?? null,
        nextScheduledAt: upcoming[0]?.scheduled_at ?? null,
        nextScheduledKind: upcoming[0]?.kind ?? null,
        lastError: lastFailed?.error ?? null,
        byKind: [...kinds.entries()]
          .map(([kind, count]) => ({ kind, count }))
          .sort((x, y) => y.count - x.count),
      } satisfies ProfileStats;
    });
  });
