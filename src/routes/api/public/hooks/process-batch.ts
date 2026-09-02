import { randomUUID } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { requireCronAuthorization } from "@/lib/publish-auth.server";
import { runBatchQueue } from "@/lib/editor/batch-worker.server";

export const Route = createFileRoute("/api/public/hooks/process-batch")({
  server: {
    handlers: {
      GET: async () => new Response(null, { status: 405, headers: { Allow: "POST" } }),
      POST: async ({ request }) => {
        const unauthorized = requireCronAuthorization(request);
        if (unauthorized) return unauthorized;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        try {
          const summary = await runBatchQueue(supabaseAdmin as never, {
            lockId: randomUUID(),
            limit: 25,
          });
          return Response.json({ ok: true, ...summary });
        } catch (error) {
          console.error(
            JSON.stringify({
              event: "batch_worker_failed",
              message: error instanceof Error ? error.message : "unknown",
            }),
          );
          return Response.json({ ok: false, error: "Falha ao processar o lote." }, { status: 500 });
        }
      },
    },
  },
});
