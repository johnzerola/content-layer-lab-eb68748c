/**
 * BATCH JOBS — aplicação de template em massa.
 * O navegador apenas ENFILEIRA: o processamento roda no backend (worker + cron),
 * então o usuário pode fechar a aba sem interromper nada.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type BatchStatus = "queued" | "processing" | "completed" | "partial" | "failed" | "cancelled";
export type BatchItemStatus = "queued" | "processing" | "done" | "failed" | "skipped";

export interface BatchSettings {
  applyCaptions: boolean;
  applyBrandKit: boolean;
  applyFilters: boolean;
  applyMusic: boolean;
  applyCta: boolean;
  generateTitle: boolean;
  captionPresetId?: string;
  autoRender: boolean;
  width: number;
  height: number;
  fps: number;
}

export const DEFAULT_BATCH_SETTINGS: BatchSettings = {
  applyCaptions: true,
  applyBrandKit: true,
  applyFilters: true,
  applyMusic: false,
  applyCta: true,
  generateTitle: false,
  autoRender: true,
  width: 1080,
  height: 1920,
  fps: 30,
};

export interface BatchTarget {
  videoId: string;
  cutId?: string | null;
  label?: string | null;
  videoUrl?: string | null;
  coverUrl?: string | null;
  title?: string | null;
  duration?: number | null;
}

export interface BatchJobRecord {
  id: string;
  type: string;
  status: BatchStatus;
  template_id: string | null;
  total_items: number;
  processed_items: number;
  successful_items: number;
  failed_items: number;
  settings: BatchSettings;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface BatchItemRecord {
  id: string;
  batch_job_id: string;
  video_id: string | null;
  cut_id: string | null;
  label: string | null;
  status: BatchItemStatus;
  template_instance_id: string | null;
  render_job_id: string | null;
  error_message: string | null;
}

const CHUNK = 400;

type Row = Record<string, unknown>;

function toJob(row: Row): BatchJobRecord {
  return {
    id: row["id"] as string,
    type: (row["type"] as string) ?? "template_apply",
    status: (row["status"] as BatchStatus) ?? "queued",
    template_id: (row["template_id"] as string | null) ?? null,
    total_items: Number(row["total_items"] ?? 0),
    processed_items: Number(row["processed_items"] ?? 0),
    successful_items: Number(row["successful_items"] ?? 0),
    failed_items: Number(row["failed_items"] ?? 0),
    settings: { ...DEFAULT_BATCH_SETTINGS, ...((row["settings"] ?? {}) as Partial<BatchSettings>) },
    error: (row["error"] as string | null) ?? null,
    created_at: (row["created_at"] as string) ?? "",
    completed_at: (row["completed_at"] as string | null) ?? null,
  };
}

function toItem(row: Row): BatchItemRecord {
  return {
    id: row["id"] as string,
    batch_job_id: row["batch_job_id"] as string,
    video_id: (row["video_id"] as string | null) ?? null,
    cut_id: (row["cut_id"] as string | null) ?? null,
    label: (row["label"] as string | null) ?? null,
    status: (row["status"] as BatchItemStatus) ?? "queued",
    template_instance_id: (row["template_instance_id"] as string | null) ?? null,
    render_job_id: (row["render_job_id"] as string | null) ?? null,
    error_message: (row["error_message"] as string | null) ?? null,
  };
}

/** Chave estável por item: reprocessar o mesmo lote não duplica nada. */
export function itemKey(target: BatchTarget): string {
  return `${target.videoId}:${target.cutId ?? "full"}`;
}

/** Custo estimado em créditos da operação em massa. */
export function estimateCredits(count: number, settings: BatchSettings): number {
  const perItem = 1 + (settings.autoRender ? 1 : 0);
  return count * perItem;
}

/** Cria o lote + itens (em blocos) e devolve o job persistido. */
export async function createBatchJob(input: {
  templateId: string | null;
  targets: BatchTarget[];
  settings: BatchSettings;
  type?: string;
}): Promise<BatchJobRecord> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Sessão expirada.");
  if (!input.targets.length) throw new Error("Selecione ao menos um vídeo.");

  const { data: jobRow, error: jobError } = await supabase
    .from("batch_jobs")
    .insert({
      user_id: userId,
      type: input.type ?? "template_apply",
      status: "queued",
      template_id: input.templateId,
      total_items: input.targets.length,
      settings: input.settings as unknown as Json,
    } as never)
    .select("*")
    .single();
  if (jobError) throw jobError;
  const job = toJob(jobRow as Row);

  const rows = input.targets.map((t) => ({
    batch_job_id: job.id,
    user_id: userId,
    video_id: t.videoId,
    cut_id: t.cutId ?? null,
    label: t.label ?? t.title ?? null,
    status: "queued",
    idempotency_key: itemKey(t),
    payload: t as unknown as Json,
  }));

  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from("batch_job_items")
      .upsert(rows.slice(i, i + CHUNK) as never, { onConflict: "batch_job_id,idempotency_key" });
    if (error) throw error;
  }
  return job;
}

export async function getBatchJob(id: string): Promise<BatchJobRecord | null> {
  const { data, error } = await supabase.from("batch_jobs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toJob(data as Row) : null;
}

export async function listBatchJobs(limit = 20): Promise<BatchJobRecord[]> {
  const { data, error } = await supabase
    .from("batch_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => toJob(r as Row));
}

export async function listFailedItems(jobId: string, limit = 100): Promise<BatchItemRecord[]> {
  const { data, error } = await supabase
    .from("batch_job_items")
    .select("*")
    .eq("batch_job_id", jobId)
    .eq("status", "failed")
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => toItem(r as Row));
}

/** Recoloca os itens que falharam na fila (sem recriar instâncias já prontas). */
export async function retryFailedItems(jobId: string): Promise<number> {
  const failed = await listFailedItems(jobId, 1000);
  if (!failed.length) return 0;
  const { error } = await supabase
    .from("batch_job_items")
    .update({ status: "queued", error_message: null } as never)
    .in(
      "id",
      failed.map((i) => i.id),
    );
  if (error) throw error;
  const { error: jobError } = await supabase
    .from("batch_jobs")
    .update({ status: "queued", failed_items: 0, completed_at: null } as never)
    .eq("id", jobId);
  if (jobError) throw jobError;
  return failed.length;
}

export async function cancelBatchJob(jobId: string): Promise<void> {
  const { error } = await supabase
    .from("batch_jobs")
    .update({ status: "cancelled", completed_at: new Date().toISOString() } as never)
    .eq("id", jobId);
  if (error) throw error;
}

/** Acompanha o progresso do lote (o worker roda no servidor). */
export function watchBatchJob(
  jobId: string,
  onChange: (job: BatchJobRecord) => void,
  intervalMs = 3000,
): () => void {
  let alive = true;
  const tick = async () => {
    if (!alive) return;
    try {
      const job = await getBatchJob(jobId);
      if (job && alive) onChange(job);
      if (job && ["completed", "partial", "failed", "cancelled"].includes(job.status)) return stop();
    } catch {
      /* silencioso: nova tentativa no próximo tick */
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  const stop = () => {
    alive = false;
    clearInterval(timer);
  };
  void tick();
  return stop;
}

export const BATCH_STATUS_LABEL: Record<BatchStatus, string> = {
  queued: "Na fila",
  processing: "Processando",
  completed: "Concluído",
  partial: "Concluído com falhas",
  failed: "Falhou",
  cancelled: "Cancelado",
};
