import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PublishNowResult =
  | { ok: true; permalink: string | null; providerPostId: string | null }
  | { ok: false; error: string; code: string };

/** Publica imediatamente um agendamento do usuario autenticado (Meta ou YouTube). */
export const publishPostNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { postId: string }) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<PublishNowResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createPublishDependencies } = await import("@/lib/publish-deps.server");
    const { publishClaimedPost } = await import("@/lib/publish-queue.server");

    const { data: post, error } = await supabaseAdmin
      .from("scheduled_posts")
      .select("id,user_id,account_id,kind,caption,video_url,video_path,media_type,attempts,status")
      .eq("id", data.postId)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (error || !post) return { ok: false, error: "Agendamento não encontrado.", code: "NOT_FOUND" };
    if (post.status === "publicado") {
      return { ok: false, error: "Esta publicação já foi enviada.", code: "ALREADY_PUBLISHED" };
    }

    const deps = await createPublishDependencies();
    await supabaseAdmin
      .from("scheduled_posts")
      .update({ status: "processando", error: null, error_code: null })
      .eq("id", post.id);

    let result;
    try {
      result = await publishClaimedPost(
        {
          id: post.id,
          user_id: post.user_id,
          account_id: post.account_id,
          kind: post.kind,
          caption: post.caption ?? "",
          video_url: post.video_url,
          video_path: post.video_path,
          media_type: post.media_type,
          attempts: post.attempts ?? 0,
        },
        deps,
      );
    } catch {
      result = { ok: false as const, error: "Falha temporária durante a publicação.", code: "DATABASE_ERROR" as const, retryable: true };
    }

    if (result.ok) {
      if (post.video_path && deps.removeStorageObject) {
        try {
          await deps.removeStorageObject(post.video_path);
        } catch {
          /* limpeza de storage é best-effort */
        }
      }
      await supabaseAdmin
        .from("scheduled_posts")
        .update({
          status: "publicado",
          published_at: new Date().toISOString(),
          permalink: result.permalink ?? null,
          provider_post_id: result.providerPostId ?? null,
          error: null,
          error_code: null,
          lock_id: null,
          locked_at: null,
          next_attempt_at: null,
          provider_container_id: null,
        })
        .eq("id", post.id);
      return { ok: true, permalink: result.permalink ?? null, providerPostId: result.providerPostId ?? null };
    }

    await supabaseAdmin
      .from("scheduled_posts")
      .update({
        status: "falhou",
        error: result.error.slice(0, 500),
        error_code: result.code,
        lock_id: null,
        locked_at: null,
        provider_container_id: result.pendingContainerId ?? null,
      })
      .eq("id", post.id);
    return { ok: false, error: result.error, code: result.code };
  });
