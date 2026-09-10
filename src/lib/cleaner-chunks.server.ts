/**
 * Orquestrador de chunks do CleanerIA v3.
 *
 * Fluxo: planeja janelas com sobreposição -> despacha N chunks em paralelo na
 * GPU -> mede resíduo de texto por chunk -> concatena e remonta o áudio no
 * worker CPU. Falhas técnicas ainda são repetidas; score visual alto vira
 * aviso, pois repetir exatamente o mesmo modelo só triplica tempo e custo.
 *
 * Todo o estado vive no banco (`cleaner_jobs`, `cleaner_chunks`), então a fila
 * sobrevive a reload da página, queda de rede e reinício do servidor.
 */
import { workerAssemble, workerCancel, workerCleanup, workerPlanChunks, workerStatus } from "@/lib/cleaner.server";
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
const MAX_ATTEMPTS = 2;
const LEASE_MS = 3 * 60 * 1000;
const PAGE_SIZE = 200;
export const CLEANER_TERMINAL_STATUSES = ["completed", "failed", "cancelled"];
const terminal = (status: unknown) => CLEANER_TERMINAL_STATUSES.includes(String(status));

async function retryStorage<T extends { error: unknown }>(operation: () => PromiseLike<T>): Promise<T> {
  let result = await operation();
  if (result.error) result = await operation();
  if (result.error) throw new Error("Limpeza temporaria pendente; o armazenamento recusou a operacao.");
  return result;
}

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
  error: string | null;
  lease_until: string | null;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function concurrencyFor(_preset: string): number {
  const configured = Number(process.env["CLEANER_GPU_CONCURRENCY"] ?? "");
  if (Number.isFinite(configured) && configured > 0) return Math.min(12, Math.floor(configured));
  // Validate one GPU request at a time. More concurrency requires explicit configuration.
  return 1;
}

function chunkPath(jobId: string, idx: number, attempt: number) {
  return `${jobId}/chunk-${String(idx).padStart(4, "0")}-a${attempt}.mp4`;
}

/** Coloca o job em modo GPU e cria as linhas de chunk. Idempotente. */
export async function planCleanerChunks(jobId: string, userId: string): Promise<number> {
  const db = await admin();
  const { data: job, error } = await db
    .from("cleaner_jobs")
    .select("id, preset, status")
    .eq("id", jobId)
    .eq("user_id", userId)
    .single();
  if (error || !job) throw new Error("Job nao encontrado");
  if (terminal(job.status)) throw new Error("Este processamento terminou; crie um novo job para processar novamente.");
  const { data: existing } = await db
    .from("cleaner_chunks")
    .select("id")
    .eq("job_id", jobId)
    .limit(1);
  if (existing && existing.length) return 0;

  const { data: started, error: startError } = await db
    .from("cleaner_jobs")
    .update({ status: "chunking", stage: "dividindo o vídeo em partes" } as never)
    .eq("id", jobId)
    .not("status", "in", "(completed,failed,cancelled)")
    .select("id");
  if (startError) throw new Error(startError.message);
  if (!started?.length) return 0;

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
    .eq("id", jobId)
    .not("status", "in", "(completed,failed,cancelled)");
  return rows.length;
}

/** Confirma que o arquivo do trecho realmente existe no armazenamento. */
async function chunkArtifactExists(path: string | null): Promise<boolean> {
  if (!path) return false;
  const db = await admin();
  const slash = path.lastIndexOf("/");
  const folder = slash > 0 ? path.slice(0, slash) : "";
  const name = slash > 0 ? path.slice(slash + 1) : path;
  const { data } = await db.storage.from(BUCKET).list(folder, { search: name, limit: 100 });
  return (data ?? []).some((item) => item.name === name);
}

/**
 * Apaga os artefatos temporários de um job (chunks de saída no storage).
 * Idempotente: pode rodar em sucesso, falha, cancelamento ou timeout.
 */
export async function purgeChunkArtifacts(jobId: string): Promise<number> {
  if (!/^[a-zA-Z0-9-]+$/.test(jobId)) throw new Error("Identificador de job invalido");
  const db = await admin();
  const paths = new Set<string>();
  const chunkName = /^chunk-\d+-a\d+\.mp4$/;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await db.from("cleaner_chunks").select("output_url")
      .eq("job_id", jobId).order("idx", { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error("Nao foi possivel consultar os arquivos temporarios.");
    for (const row of data ?? []) {
      if (!row.output_url) continue;
      if (!row.output_url.startsWith(`${jobId}/`) || !chunkName.test(row.output_url.slice(jobId.length + 1))) {
        throw new Error("Referencia de arquivo fora da pasta de chunks; limpeza interrompida.");
      }
      paths.add(row.output_url);
    }
    if ((data?.length ?? 0) < PAGE_SIZE) break;
  }
  // Collect every page before deleting: deleting while advancing an offset skips files.
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data: files } = await retryStorage(() => db.storage.from(BUCKET).list(jobId, {
      limit: PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" },
    }));
    for (const file of files ?? []) {
      if (chunkName.test(file.name)) paths.add(`${jobId}/${file.name}`);
    }
    if ((files?.length ?? 0) < PAGE_SIZE) break;
  }
  const all = [...paths];
  for (let offset = 0; offset < all.length; offset += PAGE_SIZE) {
    const batch = all.slice(offset, offset + PAGE_SIZE);
    await retryStorage(() => db.storage.from(BUCKET).remove(batch));
    // Only forget references whose removal was confirmed. A later failed batch stays retryable.
    const { error } = await db.from("cleaner_chunks").update({ output_url: null } as never)
      .eq("job_id", jobId).in("output_url", batch);
    if (error) throw new Error("Arquivos removidos; confirmacao da limpeza pendente no banco.");
  }
  return all.length;
}


async function pauseJob(jobId: string, reason: string, message: string) {
  const db = await admin();
  await db
    .from("cleaner_jobs")
    .update({ paused_reason: reason, stage: message, error: message, lease_until: null } as never)
    .eq("id", jobId)
    .not("status", "in", "(completed,failed,cancelled)");
}

async function jobIsTerminal(jobId: string): Promise<boolean> {
  const db = await admin();
  const { data, error } = await db.from("cleaner_jobs").select("status").eq("id", jobId).maybeSingle();
  if (error) throw new Error("Nao foi possivel confirmar o estado do job.");
  return !data || terminal(data.status);
}

/** Retries only cancellation/temporary storage cleanup; it never submits GPU work. */
export async function retryCleanerCleanup(jobId: string): Promise<void> {
  const db = await admin();
  const { data: job, error: jobError } = await db.from("cleaner_jobs")
    .select("status, metrics").eq("id", jobId).maybeSingle();
  if (jobError || !job) throw new Error("Nao foi possivel consultar o job para limpeza.");
  if (!terminal(job.status)) throw new Error("Limpeza terminal recusada enquanto o job esta ativo.");
  const metrics = job.metrics && typeof job.metrics === "object" && !Array.isArray(job.metrics)
    ? job.metrics : {};
  const { error: pendingError } = await db.from("cleaner_jobs").update({
    metrics: { ...metrics, cleanup_pending: true }, lease_until: null,
  } as never).eq("id", jobId).in("status", CLEANER_TERMINAL_STATUSES);
  if (pendingError) throw new Error("Nao foi possivel registrar a limpeza pendente.");
  // Stop dispatch before cancelling remote requests. Keep provider IDs on errors for the cron.
  const { error: stopError } = await db.from("cleaner_chunks").update({
    status: "cancelled", finished_at: new Date().toISOString(), lease_until: null,
  } as never).eq("job_id", jobId).in("status", ["pending", "running"]);
  if (stopError) throw new Error("Nao foi possivel interromper a fila de chunks.");
  const requests: { id: string; provider_job_id: string | null }[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await db.from("cleaner_chunks").select("id, provider_job_id")
      .eq("job_id", jobId).eq("status", "cancelled").not("provider_job_id", "is", null)
      .order("idx", { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error("Nao foi possivel consultar cancelamentos pendentes.");
    requests.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) break;
  }
  let failed = false;
  for (const chunk of requests) {
    try {
      await cancelChunk(chunk.provider_job_id!);
      const { error } = await db.from("cleaner_chunks").update({ provider_job_id: null } as never)
        .eq("id", chunk.id).eq("provider_job_id", chunk.provider_job_id!);
      if (error) failed = true;
    } catch {
      failed = true;
    }
  }
  if (failed) throw new Error("Cancelamento de GPU pendente; sera repetido antes de apagar os temporarios.");
  if (job.status !== "completed") await workerCancel(jobId);
  await purgeChunkArtifacts(jobId);
  const workerCleanupResult = await workerCleanup(jobId);
  if (!workerCleanupResult.ok) throw new Error("Limpeza da VPS pendente; sera repetida.");
  const { error } = await db.from("cleaner_jobs").update({
    metrics: { ...metrics, cleanup_pending: false }, lease_until: null,
  } as never).eq("id", jobId).in("status", CLEANER_TERMINAL_STATUSES);
  if (error) throw new Error("Confirmacao da limpeza pendente no banco.");
}

/**
 * Avança o job uma "batida": coleta resultados, despacha novos chunks e
 * finaliza quando tudo estiver limpo. Chamada pelo cron e pela UI.
 */
export async function pumpCleanerJob(jobId: string): Promise<PumpResult> {
  const db = await admin();
  const { data: job } = await db
    .from("cleaner_jobs")
    .select("id, user_id, mode, preset, masks, options, status, engine, paused_reason, chunks_total, metrics")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) throw new Error("Job não encontrado");
  const row = job as unknown as Record<string, unknown>;
  if (terminal(row["status"])) {
    const metrics = row["metrics"] as Record<string, unknown> | null;
    if (metrics?.["cleanup_pending"] === false) return await summarize(jobId);
    try {
      await retryCleanerCleanup(jobId);
      return await summarize(jobId);
    } catch {
      return { ...(await summarize(jobId)), message: "Processamento encerrado; limpeza temporaria pendente." };
    }
  }
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
    .not("status", "in", "(completed,failed,cancelled)")
    .or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`)
    .select("id");
  if (!leased || !leased.length) {
    const snapshot = await summarize(jobId);
    return { ...snapshot, message: "outra execução em andamento" };
  }

  try {
    const { data: chunkData } = await db
      .from("cleaner_chunks")
      .select("id, idx, start_seconds, end_seconds, overlap_seconds, status, attempts, provider_job_id, output_url, residual_text, lease_until, error")
      .eq("job_id", jobId)
      .order("idx", { ascending: true });
    const chunks = (chunkData ?? []) as unknown as ChunkRow[];
    if (!chunks.length) {
      await db.from("cleaner_jobs").update({ lease_until: null } as never).eq("id", jobId);
      return await summarize(jobId);
    }

    // 1) Coleta o que está rodando na GPU.
    for (const chunk of chunks.filter((c) => c.status === "running" && c.provider_job_id)) {
      if (await jobIsTerminal(jobId)) return await pumpCleanerJob(jobId);
      const state = await chunkStatus(chunk.provider_job_id!);
      if (state.state === "completed" || state.state === "failed") {
        const prior = (row["metrics"] ?? {}) as Record<string, unknown>;
        const usage = (prior["gpu_usage"] ?? {}) as Record<string, unknown>;
        const metrics = { ...prior, gpu_usage: { ...usage, [chunk.provider_job_id!]: {
          gpu_name: state.gpuName ?? null,
          handler_seconds: state.seconds ?? null,
          provider_execution_seconds: state.providerExecutionSeconds ?? null,
          pipeline_revision: state.pipelineRevision ?? null,
          status: state.state,
          billing_note: "execution telemetry, excludes startup/idle and is not an invoice",
        } } };
        const { error: usageError } = await db.from("cleaner_jobs").update({ metrics } as never)
          .eq("id", jobId).not("status", "in", "(completed,failed,cancelled)");
        if (usageError) throw new Error("Nao foi possivel registrar o tempo de uso da GPU");
        row["metrics"] = metrics;
      }
      if (state.state === "queued" || state.state === "running") {
        const deadline = chunk.lease_until ? Date.parse(chunk.lease_until) : Number.NaN;
        if (!Number.isFinite(deadline) || deadline > Date.now()) continue;

        await cancelChunk(chunk.provider_job_id!);
        const message = "RunPod excedeu 30 minutos na fila/execução; solicitação cancelada";
        await db
          .from("cleaner_chunks")
          .update({ status: "failed", provider_job_id: null, error: message, finished_at: new Date().toISOString() } as never)
          .eq("id", chunk.id);
        await db
          .from("cleaner_jobs")
          .update({ status: "failed", stage: "tempo limite da GPU", error: message, lease_until: null,
            metrics: { ...((row["metrics"] ?? {}) as Record<string, unknown>), cleanup_pending: true } } as never)
          .eq("id", jobId).not("status", "in", "(completed,failed,cancelled)");
        await cancelCleanerChunks(jobId);
        return await summarize(jobId);
      }
      if (state.state === "completed") {
        // O provedor pode responder "pronto" sem que o arquivo tenha chegado ao storage.
        const stored = await chunkArtifactExists(chunk.output_url);
        if (!stored) {
          // `attempts` is incremented when a request is submitted. A failed
          // response must not consume a second attempt.
          const attempts = chunk.attempts;
          const dead = attempts >= MAX_ATTEMPTS;
          chunk.status = dead ? "failed" : "pending";
          chunk.attempts = attempts;
          await db
            .from("cleaner_chunks")
            .update({
              status: chunk.status,
              provider_job_id: null,
              attempts,
              error: "arquivo do trecho não chegou ao armazenamento",
              finished_at: dead ? new Date().toISOString() : null,
            } as never)
            .eq("id", chunk.id);
          if (dead) {
            await db
              .from("cleaner_jobs")
              .update({
                status: "failed",
                stage: "falha em uma parte do vídeo",
                error: "arquivo do trecho não chegou ao armazenamento",
                lease_until: null,
                metrics: { ...((row["metrics"] ?? {}) as Record<string, unknown>), cleanup_pending: true },
              } as never)
              .eq("id", jobId).not("status", "in", "(completed,failed,cancelled)");
            await cancelCleanerChunks(jobId);
            return await summarize(jobId);
          }
          continue;
        }
        const residual = state.residualText ?? 0;
        const residualWarning = residual > RESIDUAL_LIMIT;
        chunk.status = "done";
        chunk.residual_text = residual;
        chunk.error = state.qualityIssues?.length
          ? `${state.qualityIssues.join(", ")} — revisar resultado`
          : residualWarning ? `resíduo ${residual.toFixed(3)} — revisar resultado` : null;
        await db
          .from("cleaner_chunks")
          .update({
            status: chunk.status,
            provider_job_id: null,
            residual_text: residual,
            output_url: chunk.output_url,
            cost_seconds: state.seconds ?? null,
            checksum: state.checksum ?? null,
            bytes: state.bytes ?? null,
            finished_at: new Date().toISOString(),
            error: chunk.error,
          } as never)
          .eq("id", chunk.id);

      } else {
        const attempts = chunk.attempts;
        const dead = attempts >= MAX_ATTEMPTS;
        chunk.status = dead ? "failed" : "pending";
        chunk.attempts = attempts;
        await db
          .from("cleaner_chunks")
          .update({
            status: chunk.status,
            provider_job_id: null,
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
              metrics: { ...((row["metrics"] ?? {}) as Record<string, unknown>), cleanup_pending: true },
            } as never)
            .eq("id", jobId).not("status", "in", "(completed,failed,cancelled)");
          // Stop sibling requests before removing artifacts; otherwise they
          // keep consuming GPU after the parent job has already failed.
          await cancelCleanerChunks(jobId);
          return await summarize(jobId);
        }
      }
    }

    // 2) Despacha o que está pendente, respeitando a concorrência do plano.
    const limit = concurrencyFor(String(row["preset"] ?? "quality"));
    const running = chunks.filter((c) => c.status === "running").length;
    const pending = chunks.filter((c) => c.status === "pending");
    for (const chunk of pending.slice(0, Math.max(0, limit - running))) {
      if (await jobIsTerminal(jobId)) return await pumpCleanerJob(jobId);
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
          // Reservado para imagens futuras do worker. Retries atuais só
          // acontecem após falha técnica ou artefato ausente.
          retry_pass: attempt > 1,
        },
      });
      chunk.status = "running";
      chunk.attempts = attempt;
      const { data: accepted, error: persistError } = await db
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
        .eq("id", chunk.id).eq("status", "pending").select("id");
      if (persistError || !accepted?.length || await jobIsTerminal(jobId)) {
        // Cancellation may have happened while submitChunk awaited the provider.
        // Persist the request even on a cancelled row so a failed cancellation can be retried.
        await db.from("cleaner_chunks").update({
          provider_job_id: providerId, output_url: path,
        } as never).eq("id", chunk.id);
        await cancelCleanerChunks(jobId);
        return await summarize(jobId);
      }
    }

    // 3) Tudo pronto? Concatena e remonta o áudio no worker CPU.
    const done = chunks.filter((c) => c.status === "done");
    if (done.length === chunks.length) {
      if (await jobIsTerminal(jobId)) return await pumpCleanerJob(jobId);
      const worst = done.reduce((max, c) => Math.max(max, Number(c.residual_text ?? 0)), 0);
      const reviewNotes = done.filter((c) => c.error).map((c) => `trecho ${c.idx + 1}: ${c.error}`);
      const review = worst > RESIDUAL_LIMIT || reviewNotes.length > 0;
      const metrics = {
        ...((row["metrics"] ?? {}) as Record<string, unknown>),
        residual_text: worst, chunks: done.length, engine: "gpu",
        quality_status: review ? "needs_review" : "checks_passed",
        quality_issues: reviewNotes,
      };
      let resultUrl: string | null = null;
      // Recover after a crash following assembly without rebuilding an existing output.
      if (row["status"] === "assembling" || row["status"] === "cleaning") {
        const final = await workerStatus(jobId);
        resultUrl = (final as { result_url?: string | null }).result_url ?? null;
      }
      if (!resultUrl) {
        const parts: { index: number; url: string }[] = [];
        for (const chunk of done) {
          const { data: link, error: linkError } = await db.storage.from(BUCKET)
            .createSignedUrl(chunk.output_url ?? "", 60 * 60);
          if (linkError || !link) throw new Error(linkError?.message ?? "chunk sem arquivo");
          parts.push({ index: chunk.idx, url: link.signedUrl });
        }
        const { data: assembling, error: assemblyError } = await db.from("cleaner_jobs").update({
          status: "assembling", stage: "montando o video final na resolucao original", progress: 0.98,
        } as never).eq("id", jobId).not("status", "in", "(completed,failed,cancelled)").select("id");
        if (assemblyError) throw new Error(assemblyError.message);
        if (!assembling?.length) return await pumpCleanerJob(jobId);
        await workerAssemble(jobId, parts, metrics);
        const final = await workerStatus(jobId);
        resultUrl = (final as { result_url?: string | null }).result_url ?? null;
      }
      if (!resultUrl) throw new Error("Montagem sem link de resultado; temporarios preservados para recuperacao.");
      // Persist the downloadable result and terminal state before any destructive cleanup.
      const { data: completed, error: completeError } = await db
        .from("cleaner_jobs")
        .update({
          status: "completed",
          stage: review ? "concluído — revisar resultado" : "concluído",
          progress: 1,
          chunks_done: done.length,
          result_url: resultUrl,
          metrics: { ...metrics, cleanup_pending: true },
          error: review ? "Há trechos com alertas de qualidade; confira a prévia." : null,
          lease_until: null,
        } as never)
        .eq("id", jobId).not("status", "in", "(completed,failed,cancelled)").select("id");
      if (completeError) throw new Error(completeError.message);
      if (!completed?.length) return await pumpCleanerJob(jobId);
      return await pumpCleanerJob(jobId);
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
      .eq("id", jobId).not("status", "in", "(completed,failed,cancelled)");
    return await summarize(jobId);
  } catch (error) {
    if (error instanceof GpuBlockedError) {
      await pauseJob(jobId, error.requires ?? "admin_action", error.message);
      return { status: "paused", total: 0, done: 0, running: 0, progress: 0, paused: error.requires ?? "admin_action" };
    }
    if (error instanceof GpuRetryableError) {
      // Rate limit / falha transitória: solta o lock e tenta na próxima batida.
      await db.from("cleaner_jobs").update({ lease_until: null, stage: "aguardando GPU" } as never)
        .eq("id", jobId).not("status", "in", "(completed,failed,cancelled)");
      return { ...(await summarize(jobId)), message: "GPU ocupada; nova tentativa em instantes" };
    }
    await db
      .from("cleaner_jobs")
      .update({ lease_until: null, error: String((error as Error).message).slice(0, 400) } as never)
      .eq("id", jobId).not("status", "in", "(completed,failed,cancelled)");
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
    paused: terminal(job?.status) ? null : (job as { paused_reason?: string | null } | null)?.paused_reason ?? null,
  };
}

/** Cancela os chunks em voo e libera o job (usado ao cancelar/excluir). */
export async function cancelCleanerChunks(jobId: string): Promise<void> {
  const db = await admin();
  const { data: current, error: currentError } = await db.from("cleaner_jobs").select("metrics")
    .eq("id", jobId).maybeSingle();
  if (currentError || !current) throw new Error("Nao foi possivel consultar o processamento.");
  const { error } = await db.from("cleaner_jobs").update({
    status: "cancelled", stage: "cancelado; encerrando tarefas e removendo temporarios",
    paused_reason: null, lease_until: null,
    metrics: { ...((current.metrics ?? {}) as Record<string, unknown>), cleanup_pending: true },
  } as never).eq("id", jobId).not("status", "in", "(completed,failed,cancelled)");
  if (error) throw new Error("Nao foi possivel registrar o cancelamento.");
  await retryCleanerCleanup(jobId);
}
