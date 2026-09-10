import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { CLEANER_TERMINAL_STATUSES, pumpCleanerJob } from "@/lib/cleaner-chunks.server";

/** Quantos jobs GPU avançam por batida — mantém a execução curta e previsível. */
const MAX_JOBS_PER_TICK = 5;

function authorized(request: Request): boolean {
  const expected = process.env["PUBLISH_HOOK_SECRET"];
  if (!expected) return false;
  const provided = request.headers.get("x-hook-secret") ?? "";
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/cleaner-chunk-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("cleaner_jobs")
          .select("id")
          .eq("engine", "gpu")
          .is("paused_reason", null)
          .in("status", ["queued", "analyzing", "processing", "assembling", "cleaning"])
          .order("updated_at", { ascending: true })
          .limit(MAX_JOBS_PER_TICK);
        if (error) return Response.json({ ok: false, error: "Falha ao consultar a fila." }, { status: 503 });

        // Terminal jobs can retry cleanup even when GPU capacity is disabled or the job was paused.
        const { data: cleanup, error: cleanupError } = await supabaseAdmin.from("cleaner_jobs")
          .select("id").in("status", CLEANER_TERMINAL_STATUSES)
          .contains("metrics", { cleanup_pending: true })
          .order("updated_at", { ascending: true }).limit(MAX_JOBS_PER_TICK);
        if (cleanupError) return Response.json({ ok: false, error: "Falha ao consultar limpezas pendentes." }, { status: 503 });

        const results: Record<string, unknown>[] = [];
        for (const job of [...(data ?? []), ...(cleanup ?? [])] as { id: string }[]) {
          try {
            results.push({ id: job.id, ...(await pumpCleanerJob(job.id)) });
          } catch (error) {
            results.push({ id: job.id, error: String((error as Error).message).slice(0, 300) });
          }
        }
        return Response.json(
          { ok: true, processed: results.length, results },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
