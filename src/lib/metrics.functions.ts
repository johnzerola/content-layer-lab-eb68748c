import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PostInsight = {
  id: string;
  post_id: string;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  views: number;
  clicks: number;
  source?: string;
  platform_data: any;
  fetched_at: string;
  post_title?: string;
  platform?: string;
  username?: string;
  kind?: string;
  published_at?: string | null;
  permalink?: string | null;
};

export type PublishedPostRef = {
  id: string;
  caption: string;
  kind: string;
  platform: string;
  username: string;
  published_at: string | null;
  permalink: string | null;
};

export const getMetrics = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase.from("post_insights" as any) as any)
      .select(`
        *,
        scheduled_posts (
          id,
          caption,
          kind,
          published_at,
          permalink,
          social_accounts (
            platform,
            username
          )
        )
      `)
      .order('fetched_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((item: any) => ({
      ...item,
      clicks: item.clicks ?? 0,
      post_title: item.scheduled_posts?.caption || 'Sem título',
      platform: item.scheduled_posts?.social_accounts?.platform || 'Desconhecida',
      username: item.scheduled_posts?.social_accounts?.username || '',
      kind: item.scheduled_posts?.kind || 'Desconhecido',
      published_at: item.scheduled_posts?.published_at,
      permalink: item.scheduled_posts?.permalink ?? null,
    })) as PostInsight[];
  });

/** Posts já publicados, para listar mesmo quando ainda não há métricas coletadas. */
export const getPublishedPosts = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<PublishedPostRef[]> => {
    const { data, error } = await (context.supabase.from("scheduled_posts") as any)
      .select("id,caption,kind,published_at,permalink,social_accounts(platform,username)")
      .eq("status", "publicado")
      .order("published_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      caption: row.caption || "Sem título",
      kind: row.kind,
      platform: row.social_accounts?.platform || "desconhecida",
      username: row.social_accounts?.username || "",
      published_at: row.published_at,
      permalink: row.permalink ?? null,
    }));
  });

export const refreshPostMetrics = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d) => z.object({ postId: z.string().uuid() }).parse(d))
  .handler(async ({ data: { postId }, context }): Promise<{ ok: boolean; error?: string }> => {
    const { collectPostMetrics } = await import("@/lib/metrics.server");
    const result = await collectPostMetrics(postId, context.userId);
    if (!result.ok) return { ok: false, error: result.error };

    const m = result.metrics;
    const { error } = await (context.supabase.from("post_insights" as any) as any).upsert(
      {
        user_id: context.userId,
        post_id: postId,
        views: m.views,
        impressions: m.impressions,
        reach: m.reach,
        likes: m.likes,
        comments: m.comments,
        shares: m.shares,
        saves: m.saves,
        clicks: m.clicks,
        source: "provider",
        platform_data: m.platformData,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "post_id" },
    );
    if (error) throw error;
    return { ok: true };
  });

/** Atualiza todos os posts publicados do usuário, ignorando falhas individuais. */
export const refreshAllMetrics = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ updated: number; failed: number; errors: string[] }> => {
    const { collectPostMetrics } = await import("@/lib/metrics.server");
    const { data } = await (context.supabase.from("scheduled_posts") as any)
      .select("id")
      .eq("status", "publicado")
      .order("published_at", { ascending: false })
      .limit(50);

    let updated = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const row of (data || []) as Array<{ id: string }>) {
      const result = await collectPostMetrics(row.id, context.userId);
      if (!result.ok) {
        failed++;
        if (errors.length < 3) errors.push(result.error);
        continue;
      }
      const m = result.metrics;
      await (context.supabase.from("post_insights" as any) as any).upsert(
        {
          user_id: context.userId,
          post_id: row.id,
          views: m.views,
          impressions: m.impressions,
          reach: m.reach,
          likes: m.likes,
          comments: m.comments,
          shares: m.shares,
          saves: m.saves,
          clicks: m.clicks,
          source: "provider",
          platform_data: m.platformData,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "post_id" },
      );
      updated++;
    }
    return { updated, failed, errors };
  });
