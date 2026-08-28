import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifyCallback } from "@/lib/cleaner.server";

const schema = z
  .object({
    job_id: z.string().uuid(),
    item_id: z.string().uuid().optional(),
    status: z
      .enum(["queued", "uploading", "processing", "completed", "failed", "cancelled"])
      .optional(),
    stage: z.string().max(160).optional(),
    progress: z.number().min(0).max(100).optional(),
    result_path: z.string().max(500).optional(),
    error: z.string().max(1000).optional(),
    done: z.number().int().min(0).optional(),
    errors: z.number().int().min(0).optional(),
  })
  .strict();

/**
 * O worker de render da VPS empurra o andamento de cada vídeo aqui.
 * Autenticado por HMAC-SHA256 do corpo com o segredo do worker.
 */
export const Route = createFileRoute("/api/public/render-hook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        if (body.length > 64 * 1024) return new Response("payload too large", { status: 413 });
        if (
          !verifyCallback(
            body,
            request.headers.get("x-signature"),
            request.headers.get("x-callback-timestamp"),
          )
        ) {
          return new Response("invalid signature", { status: 401 });
        }

        let payload: z.infer<typeof schema>;
        try {
          payload = schema.parse(JSON.parse(body));
        } catch {
          return new Response("invalid payload", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (payload.item_id) {
          const patch: Record<string, unknown> = {};
          if (payload.status) patch["status"] = payload.status;
          if (payload.stage !== undefined) patch["stage"] = payload.stage;
          if (payload.progress !== undefined) patch["progress"] = payload.progress;
          if (payload.result_path) patch["result_path"] = payload.result_path;
          if (payload.error) patch["error"] = payload.error;
          if (Object.keys(patch).length) {
            const { error } = await supabaseAdmin
              .from("render_items")
              .update(patch as never)
              .eq("id", payload.item_id)
              .eq("batch_id", payload.job_id);
            if (error) return new Response(error.message, { status: 500 });
          }
        }

        const batchPatch: Record<string, unknown> = {};
        if (!payload.item_id && payload.status) batchPatch["status"] = payload.status;
        if (payload.done !== undefined) batchPatch["done"] = payload.done;
        if (payload.errors !== undefined) batchPatch["errors"] = payload.errors;
        if (Object.keys(batchPatch).length) {
          await supabaseAdmin
            .from("render_batches")
            .update(batchPatch as never)
            .eq("id", payload.job_id);
        }

        return new Response("ok");
      },
    },
  },
});
