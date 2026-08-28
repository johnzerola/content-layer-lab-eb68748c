import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { appOrigin } from "@/lib/cleaner.server";
import {
  renderResultUrl,
  renderUploadToken,
  workerCancelRender,
  workerCreateRenderJob,
  workerRenderStatus,
  workerStartRender,
} from "@/lib/render-cloud.server";
import type { CloudRenderBatch, CloudRenderStatus } from "@/lib/render-cloud";

const STATUSES = [
  "queued",
  "uploading",
  "processing",
  "completed",
  "failed",
  "cancelled",
] as const;

function asStatus(value: unknown): CloudRenderStatus {
  return (STATUSES as readonly string[]).includes(String(value))
    ? (value as CloudRenderStatus)
    : "queued";
}

const createSchema = z.object({
  tool: z.string().max(40).default("lote"),
  label: z.string().max(160).optional(),
  preset: z.record(z.string(), z.unknown()),
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(300),
        sourceUrl: z.string().url().max(2000).optional(),
        overrides: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .min(1)
    .max(500),
});

/** Cria o lote na fila da VPS e devolve os ids/token para o upload dos arquivos. */
export const createCloudBatch = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: batch, error } = await supabase
      .from("render_batches")
      .insert({
        user_id: userId,
        tool: data.tool,
        label: data.label ?? null,
        preset: data.preset as never,
        total: data.items.length,
        status: "uploading",
      })
      .select("id")
      .single();
    if (error || !batch) throw new Error(error?.message ?? "não consegui criar o lote");

    const rows = data.items.map((item) => ({
      batch_id: batch.id,
      user_id: userId,
      name: item.name,
      source_url: item.sourceUrl ?? null,
      overrides: item.overrides as never,
      status: item.sourceUrl ? "queued" : "uploading",
    }));
    const { data: items, error: itemsError } = await supabase
      .from("render_items")
      .insert(rows)
      .select("id, name, source_url");
    if (itemsError || !items) throw new Error(itemsError?.message ?? "não consegui enfileirar");

    try {
      await workerCreateRenderJob({
        batchId: batch.id,
        preset: data.preset,
        items: items.map((row) => ({
          id: row.id,
          name: row.name,
          sourceUrl: row.source_url,
        })),
        callbackUrl: `${appOrigin()}/api/public/render-hook`,
      });
    } catch (workerError: unknown) {
      const message =
        workerError instanceof Error ? workerError.message : "motor de render indisponível";
      await supabase
        .from("render_batches")
        .update({ status: "failed" })
        .eq("id", batch.id);
      await supabase
        .from("render_items")
        .update({ status: "failed", error: message.slice(0, 1000), stage: "falha ao conectar à VPS" })
        .eq("batch_id", batch.id);
      throw new Error(
        message === "worker-offline"
          ? "O motor de render da VPS não está configurado (CLEANER_WORKER_URL)."
          : message,
      );
    }

    return {
      batchId: batch.id,
      uploadToken: renderUploadToken(batch.id),
      items: items.map((row, index) => ({ id: row.id, name: row.name, index, needsUpload: !row.source_url })),
    };
  });

/** Depois que todos os arquivos subiram, libera o processamento da fila. */
export const startCloudBatch = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ batchId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: owned } = await supabase
      .from("render_batches")
      .select("id")
      .eq("id", data.batchId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!owned) throw new Error("Lote não encontrado");

    try {
      await workerStartRender(data.batchId);
      await supabase
        .from("render_batches")
        .update({ status: "queued" })
        .eq("id", data.batchId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Falha ao iniciar render na VPS";
      await supabase.from("render_batches").update({ status: "failed" }).eq("id", data.batchId);
      await supabase
        .from("render_items")
        .update({ status: "failed", stage: "falha ao iniciar", error: message.slice(0, 1000) })
        .eq("batch_id", data.batchId);
      throw new Error(message);
    }
    return { ok: true };
  });

/** Estado atual da fila do usuário (sobrevive a fechar o navegador). */
export const listCloudBatches = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(50).default(12) }).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<CloudRenderBatch[]> => {
    const { supabase, userId } = context;
    const { data: batches, error } = await supabase
      .from("render_batches")
      .select("id, tool, label, status, total, done, errors, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    if (!batches?.length) return [];

    const { data: items } = await supabase
      .from("render_items")
      .select("id, batch_id, name, status, progress, stage, result_path, error")
      .in(
        "batch_id",
        batches.map((b) => b.id),
      )
      .order("created_at", { ascending: true });

    return batches.map((batch) => ({
      id: batch.id,
      tool: batch.tool,
      label: batch.label,
      status: asStatus(batch.status),
      total: batch.total,
      done: batch.done,
      errors: batch.errors,
      createdAt: batch.created_at,
      items: (items ?? [])
        .filter((item) => item.batch_id === batch.id)
        .map((item) => ({
          id: item.id,
          name: item.name,
          status: asStatus(item.status),
          progress: Math.max(0, Math.min(100, Number(item.progress) || 0)),
          stage: item.stage,
          resultUrl: item.result_path ? renderResultUrl(batch.id, item.id) : null,
          error: item.error,
        })),
    }));
  });

/** Sincroniza com o worker (rede de segurança caso um webhook se perca). */
export const syncCloudBatch = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ batchId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: owned } = await supabase
      .from("render_batches")
      .select("id")
      .eq("id", data.batchId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!owned) throw new Error("Lote não encontrado");

    let remote: Awaited<ReturnType<typeof workerRenderStatus>>;
    try {
      remote = await workerRenderStatus(data.batchId);
    } catch {
      return { ok: false as const };
    }

    let done = 0;
    let errors = 0;
    for (const item of remote.items ?? []) {
      if (!item.id || !/^[0-9a-f-]{36}$/i.test(item.id)) continue;
      const status = asStatus(item.status);
      if (status === "completed") done += 1;
      if (status === "failed") errors += 1;
      await supabase
        .from("render_items")
        .update({
          status,
          progress: Math.max(0, Math.min(100, Number(item.progress) || 0)),
          stage: item.stage ?? null,
          ...(item.result_url ? { result_path: item.result_url } : {}),
          ...(item.error ? { error: item.error.slice(0, 1000) } : {}),
        })
        .eq("id", item.id)
        .eq("user_id", userId);
    }

    await supabase
      .from("render_batches")
      .update({ status: asStatus(remote.status), done, errors })
      .eq("id", data.batchId)
      .eq("user_id", userId);
    return { ok: true as const };
  });

export const cancelCloudBatch = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ batchId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: owned } = await supabase
      .from("render_batches")
      .select("id")
      .eq("id", data.batchId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!owned) throw new Error("Lote não encontrado");
    try {
      await workerCancelRender(data.batchId);
    } catch {
      /* o worker pode já ter descartado o lote */
    }
    await supabase
      .from("render_batches")
      .update({ status: "cancelled" })
      .eq("id", data.batchId)
      .eq("user_id", userId);
    return { ok: true };
  });

export const deleteCloudBatch = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ batchId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("render_batches")
      .delete()
      .eq("id", data.batchId)
      .eq("user_id", userId);
    return { ok: true };
  });
