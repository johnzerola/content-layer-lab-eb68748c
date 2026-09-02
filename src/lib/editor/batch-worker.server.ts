/**
 * Worker de BATCH JOBS (servidor).
 * Roda por cron: reivindica um lote, processa um bloco limitado de itens,
 * cria template_instances + render_jobs de forma idempotente e atualiza contadores.
 * Nunca depende da aba do navegador estar aberta.
 */
import { applyTemplateToVideo } from "@/lib/video-template/bindings";
import type { BindableVideoSource, TemplateDoc } from "@/lib/video-template/types";

export interface BatchRunOptions {
  lockId: string;
  /** máximo de itens processados por execução (bound obrigatório) */
  limit?: number;
  lockTimeoutSeconds?: number;
}

export interface BatchRunSummary {
  jobId: string | null;
  processed: number;
  succeeded: number;
  failed: number;
  remaining: number;
  status: string | null;
}

type Row = Record<string, unknown>;

interface AdminClient {
  from: (table: string) => {
    select: (cols: string) => any;
    update: (values: Record<string, unknown>) => any;
    insert: (values: Record<string, unknown>) => any;
    upsert: (values: Record<string, unknown>, opts?: Record<string, unknown>) => any;
  };
}

function payloadSource(item: Row): BindableVideoSource {
  const payload = (item["payload"] ?? {}) as Record<string, unknown>;
  return {
    id: (item["cut_id"] as string) ?? (item["video_id"] as string) ?? "item",
    title: (payload["title"] as string) ?? (item["label"] as string) ?? null,
    videoUrl: (payload["videoUrl"] as string) ?? null,
    coverUrl: (payload["coverUrl"] as string) ?? null,
    thumbnailUrl: (payload["coverUrl"] as string) ?? null,
    duration: (payload["duration"] as number) ?? null,
  };
}

export async function runBatchQueue(
  admin: AdminClient,
  { lockId, limit = 25, lockTimeoutSeconds = 600 }: BatchRunOptions,
): Promise<BatchRunSummary> {
  const empty: BatchRunSummary = { jobId: null, processed: 0, succeeded: 0, failed: 0, remaining: 0, status: null };

  const staleBefore = new Date(Date.now() - lockTimeoutSeconds * 1000).toISOString();
  const { data: jobs } = await admin
    .from("batch_jobs")
    .select("*")
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: true })
    .limit(5);

  const candidate = ((jobs ?? []) as Row[]).find(
    (j) => !j["lock_id"] || !j["locked_at"] || (j["locked_at"] as string) < staleBefore,
  );
  if (!candidate) return empty;

  const jobId = candidate["id"] as string;
  // single-flight: só continua quem conseguiu gravar o próprio lock
  const { data: locked } = await admin
    .from("batch_jobs")
    .update({ status: "processing", lock_id: lockId, locked_at: new Date().toISOString(), started_at: candidate["started_at"] ?? new Date().toISOString() })
    .eq("id", jobId)
    .or(`lock_id.is.null,locked_at.lt.${staleBefore}`)
    .select("*");
  if (!locked || (locked as Row[]).length === 0) return empty;

  const templateId = candidate["template_id"] as string | null;
  const settings = (candidate["settings"] ?? {}) as Record<string, unknown>;
  let template: TemplateDoc | null = null;
  if (templateId) {
    const { data: tpl } = await admin.from("video_templates").select("*").eq("id", templateId).maybeSingle();
    template = tpl ? (((tpl as Row)["template_data"] ?? null) as TemplateDoc | null) : null;
  }

  const { data: itemsData } = await admin
    .from("batch_job_items")
    .select("*")
    .eq("batch_job_id", jobId)
    .eq("status", "queued")
    .limit(limit);
  const items = (itemsData ?? []) as Row[];

  let succeeded = 0;
  let failed = 0;

  for (const item of items) {
    const itemId = item["id"] as string;
    try {
      if (!template) throw new Error("Template não encontrado.");
      const source = payloadSource(item);
      const doc = applyTemplateToVideo(template, source);

      let instanceId = item["template_instance_id"] as string | null;
      if (!instanceId) {
        const { data: inst, error: instError } = await admin
          .from("template_instances")
          .insert({
            template_id: templateId,
            template_version: (candidate["template_version"] as number) ?? 1,
            user_id: item["user_id"],
            video_id: item["video_id"],
            cut_id: item["cut_id"],
            label: item["label"],
            instance_data: doc,
          })
          .select("id")
          .single();
        if (instError) throw instError;
        instanceId = (inst as Row)["id"] as string;
      }

      let renderId = item["render_job_id"] as string | null;
      if (settings["autoRender"] !== false && !renderId) {
        const { data: render, error: renderError } = await admin
          .from("render_jobs")
          .upsert(
            {
              user_id: item["user_id"],
              video_id: item["video_id"],
              template_instance_id: instanceId,
              status: "queued",
              width: Number(settings["width"] ?? 1080),
              height: Number(settings["height"] ?? 1920),
              fps: Number(settings["fps"] ?? 30),
              idempotency_key: `batch:${jobId}:${item["idempotency_key"]}`,
            },
            { onConflict: "user_id,idempotency_key" },
          )
          .select("id")
          .single();
        if (renderError) throw renderError;
        renderId = (render as Row)["id"] as string;
      }

      await admin
        .from("batch_job_items")
        .update({ status: "done", template_instance_id: instanceId, render_job_id: renderId, error_message: null })
        .eq("id", itemId);
      succeeded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha desconhecida.";
      await admin
        .from("batch_job_items")
        .update({ status: "failed", error_message: message.slice(0, 400) })
        .eq("id", itemId);
      failed += 1;
    }
  }

  const { data: remainingRows } = await admin
    .from("batch_job_items")
    .select("id")
    .eq("batch_job_id", jobId)
    .eq("status", "queued")
    .limit(1);
  const remaining = ((remainingRows ?? []) as Row[]).length;

  const processed = Number(candidate["processed_items"] ?? 0) + succeeded + failed;
  const totalFailed = Number(candidate["failed_items"] ?? 0) + failed;
  const totalOk = Number(candidate["successful_items"] ?? 0) + succeeded;
  const status = remaining > 0 ? "processing" : totalFailed > 0 ? (totalOk > 0 ? "partial" : "failed") : "completed";

  await admin
    .from("batch_jobs")
    .update({
      processed_items: processed,
      successful_items: totalOk,
      failed_items: totalFailed,
      status,
      lock_id: null,
      locked_at: null,
      completed_at: remaining > 0 ? null : new Date().toISOString(),
    })
    .eq("id", jobId);

  return { jobId, processed: succeeded + failed, succeeded, failed, remaining, status };
}
