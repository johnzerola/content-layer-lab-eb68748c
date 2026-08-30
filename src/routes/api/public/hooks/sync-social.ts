/**
 * Executa as sincronizações automáticas agendadas dos canais conectados.
 * Chamado por um agendador (pg_cron) com o mesmo segredo da fila de publicação.
 */
import { createFileRoute } from "@tanstack/react-router";
import { requireCronAuthorization } from "@/lib/publish-auth.server";

const BATCH_LIMIT = 25;

export const Route = createFileRoute("/api/public/hooks/sync-social")({
  server: {
    handlers: {
      GET: async () => new Response(null, { status: 405, headers: { Allow: "POST" } }),
      POST: async ({ request }) => {
        const unauthorized = requireCronAuthorization(request);
        if (unauthorized) return unauthorized;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { syncSingleYoutubeChannel } = await import("@/lib/youtube-sync.server");

        const nowIso = new Date().toISOString();
        const { data: due, error } = await supabaseAdmin
          .from("social_sync_schedules")
          .select("id,user_id,social_account_id,interval_minutes")
          .eq("enabled", true)
          .eq("provider", "youtube")
          .lte("next_run_at", nowIso)
          .order("next_run_at", { ascending: true })
          .limit(BATCH_LIMIT);

        if (error) {
          console.error(JSON.stringify({ event: "sync_schedule_read_failed" }));
          return Response.json({ ok: false, error: "Falha ao ler os agendamentos." }, { status: 500 });
        }

        let ok = 0;
        let failed = 0;
        for (const row of due ?? []) {
          let status = "ok";
          let message: string | null = null;
          try {
            await syncSingleYoutubeChannel(supabaseAdmin as never, row.user_id, row.social_account_id);
            ok += 1;
          } catch (failure) {
            failed += 1;
            status = "erro";
            message = failure instanceof Error ? failure.message : "Falha na sincronização.";
          }
          await supabaseAdmin
            .from("social_sync_schedules")
            .update({
              last_run_at: new Date().toISOString(),
              last_status: status,
              last_error: message,
              next_run_at: new Date(Date.now() + row.interval_minutes * 60_000).toISOString(),
            })
            .eq("id", row.id);
        }

        return Response.json({ ok: true, processed: (due ?? []).length, synced: ok, failed });
      },
    },
  },
});
