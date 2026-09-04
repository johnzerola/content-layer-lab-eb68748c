/**
 * Orquestrador de chunks do CleanerIA v3.
 *
 * Fluxo: planeja janelas com sobreposição -> despacha N chunks em paralelo na
 * GPU -> verifica resíduo de texto por chunk -> reprocessa apenas o que ficou
 * sujo -> concatena e remonta o áudio no worker CPU.
 *
 * Todo o estado vive no banco (`cleaner_jobs`, `cleaner_chunks`), então a fila
 * sobrevive a reload da página, queda de rede e reinício do servidor.
 */
import { workerAssemble, workerPlanChunks } from "@/lib/cleaner.server";
import {
  GpuBlockedError,
  GpuRetryableError,
  cancelChunk,
  chunkStatus,
  gpuConfigured,
  jobChunkSourceUrl,
  submitChunk,
} from "@/lib/cleaner-gpu.server";

const BUCKET = "cleaner-chunks";
/** Alvo de duração por chunk; janelas menores paralelizam melhor. */
const TARGET_SECONDS = 15;
const OVERLAP_SECONDS = 0.6;
/** Resíduo de OCR aceitável no chunk final. */
const RESIDUAL_LIMIT = 0.05;
const MAX_ATTEMPTS = 3;
const LEASE_MS = 3 * 60 * 1000;

export type PumpResult = {
  status: string;
  total: number;
  done: number;
  running: number;
  progress: number;
  paused?: string | null;
  message?: string;
};

type ChunkRow = {
  id: string;
  idx: number;
  start_seconds: number;
  end_seconds: number;
  overlap_seconds: number;
  status: string;
  attempts: number;
  provider_job_id: string | null;
  output_url: string | null;
  residual_text: number | null;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function concurrencyFor(preset: string): number {
  const configured = Number(process.env["CLEANER_GPU_CONCURRENCY"] ?? "");
  if (Number.isFinite(configured) && configured > 0) return Math.min(12, Math.floor(configured));
  return preset === "max" ? 3 : 5;
}

function chunkPath(jobId: string, idx: number, attempt: number) {
  return `${jobId}/chunk-${String(idx).padStart(4, "0")}-a${attempt}.mp4`;
}

/** Coloca o job em modo GPU e cria as linhas de chunk. Idempotente. */
export async function planCleanerChunks(jobId: string, userId: string): Promise<number> {
  const db = await admin();
  const { data: existing } = await db
    .from("cleaner_chunks")
    .select("id")
    .eq("job_id", jobId)
    .limit(1);
  if (existing && existing.length) return 0;

  const { data: job, error } = await db
    .from("cleaner_jobs")
    .select("id, preset")
    .eq("id", jobId)
    .eq("user_id", userId)
    .single();
  if (error || !job) throw new Error("Job não encontrado");

  await db
    .from("cleaner_jobs")
    .update({ status: "chunking", stage: "dividindo o vídeo em partes" } as never)
    .eq("id", jobId);

  const plan = await workerPlanChunks(jobId, {
    targetSeconds: TARGET_SECONDS,
    overlap: OVERLAP_SECONDS,
  });
  const rows = plan.chunks.map((chunk) => ({
    job_id: jobId,
    user_id: userId,
    idx: chunk.index,
    start_seconds: chunk.start,
    end_seconds: chunk.end,
    overlap_seconds: chunk.overlap,
    status: "pending",
  }));
  if (!rows.length) throw new Error("não foi possível dividir o vídeo");
  const { error: insertError } = await db.from("cleaner_chunks").insert(rows as never);
  if (insertError) throw new Error(insertError.message);

  await db
    .from("cleaner_jobs")
    .update({
      engine: "gpu",
      chunks_total: rows.length,
      chunks_done: 0,
      paused_reason: null,
      status: "queued",
      stage: `dividido em ${rows.length} partes`,
      progress: 0.05,
      error: null,
    } as never)
    .eq("id", jobId);
  return rows.length;
}

/**
 * Apaga os artefatos temporários de um job (chunks de saída no storage).
 * Idempotente: pode rodar em sucesso, falha, cancelamento ou timeout.
 */
export async function purgeChunkArtifacts(jobId: string): Promise<number> {
  const db = await admin();
  const { data } = await db
    .from("cleaner_chunks")
    .select("output_url")
    .eq("job_id", jobId);
  const paths = ((data ?? []) as { output_url: string | null }[])
    .map((row) => row.output_url ?? "")
    .filter(Boolean);
  if (!paths.length) return 0;
  await db.storage.from(BUCKET).remove(paths);
  await db
    .from("cleaner_chunks")
    .update({ output_url: null } as never)
    .eq("job_id", jobId);
  return paths.length;
}

async function pauseJob(jobId: string, reason: string, message: string) {
  const db = await admin();
  await db
    .from("cleaner_jobs")
    .update({ paused_reason: reason, stage: message, error: message, lease_until: null } as never)
    .eq("id", jobId);
}

/**
 * Avança o job uma "batida": coleta resultados, despacha novos chunks e
 * finaliza quando tudo estiver limpo. Chamada pelo cron e pela UI.
 */
export async function pumpCleanerJob(jobId: string): Promise<PumpResult> {
  const db = await admin();
  const { data: job } = await db
    .from("cleaner_jobs")
    .select("id, user_id, mode, preset, masks, options, status, engine, paused_reason, chunks_total")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) throw new Error("Job não encontrado");
  const row = job as unknown as Record<string, unknown>;
  if (row["engine"] !== "gpu") {
    return { status: String(row["status"]), total: 0, done: 0, running: 0, progress: 0 };
  }
  if (row["paused_reason"]) {
    return {
      status: "paused",
      total: Number(row["chunks_total"] ?? 0),
      done: 0,
      running: 0,
      progress: 0,
      paused: String(row["paused_reason"]),
    };
  }
  if (!gpuConfigured()) {
    await pauseJob(jobId, "admin_action", "GPU não configurada para este ambiente");
    return { status: "paused", total: 0, done: 0, running: 0, progress: 0, paused: "admin_action" };
  }

  // Lock de execução única: só uma batida por vez mexe neste job.
  const now = new Date();
  const { data: leased } = await db
    .from("cleaner_jobs")
    .update({ lease_until: new Date(now.getTime() + LEASE_MS).toISOString() } as never)
    .eq("id", jobId)
    .or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`)
    .select("id");
  if (!leased || !leased.length) {
    const snapshot = await summarize(jobId);
    return { ...snapshot, message: "outra execução em andamento" };
  }

  try {
    const { data: chunkData } = await db
      .from("cleaner_chunks")
      .select("id, idx, start_seconds, end_seconds, overlap_seconds, status, attempts, provider_job_id, output_url, residual_text")
      .eq("job_id", jobId)
      .order("idx", { ascending: true });
    const chunks = (chunkData ?? []) as unknown as ChunkRow[];
    if (!chunks.length) return await summarize(jobId);

    // 1) Coleta o que está rodando na GPU.
    for (const chunk of chunks.filter((c) => c.status === "running" && c.provider_job_id)) {
      const state = await chunkStatus(chunk.provider_job_id!);
      if (state.state === "queued" || state.state === "running") continue;
      if (state.state === "completed") {
        const residual = state.residualText ?? 0;
        const dirty = residual > RESIDUAL_LIMIT && chunk.attempts < MAX_ATTEMPTS;
        chunk.status = dirty ? "pending" : "done";
        chunk.residual_text = residual;
        await db
          .from("cleaner_chunks")
          .update({
            status: chunk.status,
            residual_text: residual,
            output_url: chunk.output_url,
            cost_seconds: state.seconds ?? null,
            checksum: state.checksum ?? null,
            bytes: state.bytes ?? null,
            finished_at: new Date().toISOString(),
            error: dirty ? `resíduo ${residual.toFixed(3)} — reprocessando` : null,
          } as never)
          .eq("id", chunk.id);
      } else {
        const attempts = chunk.attempts + 1;
        const dead = attempts >= MAX_ATTEMPTS;
        chunk.status = dead ? "failed" : "pending";
        chunk.attempts = attempts;
        await db
          .from("cleaner_chunks")
          .update({
            status: chunk.status,
            attempts,
            error: state.error ?? null,
            finished_at: dead ? new Date().toISOString() : null,
          } as never)
          .eq("id", chunk.id);
        if (dead) {
          await db
            .from("cleaner_jobs")
            .update({
              status: "failed",
              stage: "falha em uma parte do vídeo",
              error: state.error ?? "falha ao processar um trecho",
              lease_until: null,
            } as never)
            .eq("id", jobId);
          // Falha definitiva: nada será montado, então os temporários saem agora.
          await purgeChunkArtifacts(jobId).catch(() => null);
          return await summarize(jobId);
        }
      }
    }

    // 2) Despacha o que está pendente, respeitando a concorrência do plano.
    const limit = concurrencyFor(String(row["preset"] ?? "quality"));
    const running = chunks.filter((c) => c.status === "running").length;
    const pending = chunks.filter((c) => c.status === "pending");
    for (const chunk of pending.slice(0, Math.max(0, limit - running))) {
      const attempt = chunk.attempts + 1;
      const path = chunkPath(jobId, chunk.idx, attempt);
      const { data: signed, error: signError } = await db.storage
        .from(BUCKET)
        .createSignedUploadUrl(path);
      if (signError || !signed) throw new Error(signError?.message ?? "falha ao assinar upload");
      const providerId = await submitChunk({
        chunkIndex: chunk.idx,
        sourceUrl: jobChunkSourceUrl(jobId, chunk.idx),
        sourceIsChunk: true,
        uploadUrl: signed.signedUrl,
        start: Number(chunk.start_seconds),
        end: Number(chunk.end_seconds),
        overlap: Number(chunk.overlap_seconds),
        mode: String(row["mode"] ?? "subtitle"),
        preset: String(row["preset"] ?? "quality"),
        masks: (row["masks"] as unknown[]) ?? [],
        options: {
          ...((row["options"] as Record<string, unknown>) ?? {}),
          // Reprocessos usam dilatação mais agressiva no que sobrou.
          retry_pass: attempt > 1,
        },
      });
      chunk.status = "running";
      chunk.attempts = attempt;
      await db
        .from("cleaner_chunks")
        .update({
          status: "running",
          attempts: attempt,
          provider_job_id: providerId,
          output_url: path,
          started_at: new Date().toISOString(),
          finished_at: null,
          lease_until: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        } as never)
        .eq("id", chunk.id);
    }

    // 3) Tudo pronto? Concatena e remonta o áudio no worker CPU.
    const done = chunks.filter((c) => c.status === "done");
    if (done.length === chunks.length) {
      const parts: { index: number; url: string }[] = [];
      for (const chunk of done) {
        const { data: link, error: linkError } = await db.storage
          .from(BUCKET)
          .createSignedUrl(chunk.output_url ?? "", 60 * 60);
        if (linkError || !link) throw new Error(linkError?.message ?? "chunk sem arquivo");
        parts.push({ index: chunk.idx, url: link.signedUrl });
      }
      const worst = done.reduce((max, c) => Math.max(max, Number(c.residual_text ?? 0)), 0);
      await db
        .from("cleaner_jobs")
        .update({
          status: "assembling",
          stage: "montando o vídeo final na resolução original",
          progress: 0.98,
        } as never)
        .eq("id", jobId);
      // Só depois da montagem confirmada os temporários podem sair.
      await workerAssemble(jobId, parts, { residual_text: worst, chunks: parts.length });
      await db
        .from("cleaner_jobs")
        .update({
          status: "cleaning",
          stage: "removendo arquivos temporários",
          progress: 0.99,
          chunks_done: done.length,
        } as never)
        .eq("id", jobId);
      await purgeChunkArtifacts(jobId).catch(() => null);
      await db
        .from("cleaner_jobs")
        .update({
          status: "completed",
          stage: "concluído",
          progress: 1,
          chunks_done: done.length,
          error: null,
          lease_until: null,
        } as never)
        .eq("id", jobId);
      return await summarize(jobId);
    }

    await db
      .from("cleaner_jobs")
      .update({
        status: "processing",
        stage: `processando ${done.length}/${chunks.length} partes na GPU`,
        chunks_done: done.length,
        progress: Math.min(0.97, 0.05 + (done.length / chunks.length) * 0.9),
        lease_until: null,
      } as never)
      .eq("id", jobId);
    return await summarize(jobId);
  } catch (error) {
    if (error instanceof GpuBlockedError) {
      await pauseJob(jobId, error.requires ?? "admin_action", error.message);
      return { status: "paused", total: 0, done: 0, running: 0, progress: 0, paused: error.requires ?? "admin_action" };
    }
    if (error instanceof GpuRetryableError) {
      // Rate limit / falha transitória: solta o lock e tenta na próxima batida.
      await db.from("cleaner_jobs").update({ lease_until: null, stage: "aguardando GPU" } as never).eq("id", jobId);
      return { ...(await summarize(jobId)), message: "GPU ocupada; nova tentativa em instantes" };
    }
    await db
      .from("cleaner_jobs")
      .update({ lease_until: null, error: String((error as Error).message).slice(0, 400) } as never)
      .eq("id", jobId);
    throw error;
  }
}

async function summarize(jobId: string): Promise<PumpResult> {
  const db = await admin();
  const { data } = await db.from("cleaner_chunks").select("status").eq("job_id", jobId);
  const rows = (data ?? []) as { status: string }[];
  const done = rows.filter((r) => r.status === "done").length;
  const running = rows.filter((r) => r.status === "running").length;
  const { data: job } = await db
    .from("cleaner_jobs")
    .select("status, paused_reason")
    .eq("id", jobId)
    .maybeSingle();
  return {
    status: String((job as { status?: string } | null)?.status ?? "processing"),
    total: rows.length,
    done,
    running,
    progress: rows.length ? done / rows.length : 0,
    paused: (job as { paused_reason?: string | null } | null)?.paused_reason ?? null,
  };
}

/** Cancela os chunks em voo e libera o job (usado ao cancelar/excluir). */
export async function cancelCleanerChunks(jobId: string): Promise<void> {
  const db = await admin();
  const { data } = await db
    .from("cleaner_chunks")
    .select("id, provider_job_id")
    .eq("job_id", jobId)
    .eq("status", "running");
  for (const chunk of (data ?? []) as { id: string; provider_job_id: string | null }[]) {
    if (chunk.provider_job_id) await cancelChunk(chunk.provider_job_id);
  }
  await db
    .from("cleaner_chunks")
    .update({ status: "cancelled", finished_at: new Date().toISOString() } as never)
    .eq("job_id", jobId)
    .in("status", ["pending", "running"]);
  // Cancelamento nunca monta vídeo: os temporários saem imediatamente.
  await purgeChunkArtifacts(jobId).catch(() => null);
  await db.from("cleaner_jobs").update({ lease_until: null } as never).eq("id", jobId);
}
