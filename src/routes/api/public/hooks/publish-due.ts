import { randomUUID } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { requireCronAuthorization } from "@/lib/publish-auth.server";
import { runPublishQueue } from "@/lib/publish-queue.server";

export const Route = createFileRoute("/api/public/hooks/publish-due")({
  server: {
    handlers: {
      GET: async () =>
        new Response(null, {
          status: 405,
          headers: { Allow: "POST" },
        }),
      POST: async ({ request }) => {
        const unauthorized = requireCronAuthorization(request);
        if (unauthorized) return unauthorized;

        const { createPublishDependencies, publishQueueLimits } = await import(
          "@/lib/publish-deps.server"
        );
        const { maxAttempts, lockTimeoutSeconds } = publishQueueLimits();
        const dependencies = await createPublishDependencies();

        try {
          const summary = await runPublishQueue(dependencies, {
            lockId: randomUUID(),
            limit: 10,
            lockTimeoutSeconds,
            maxAttempts,
          });
          return Response.json({ ok: true, ...summary });
        } catch {
          console.error(JSON.stringify({ event: "publish_dispatch_failed", code: "DATABASE_ERROR" }));
          return Response.json({ ok: false, error: "Falha ao processar a fila." }, { status: 500 });
        }
      },
    },
  },
});
