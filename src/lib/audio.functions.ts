import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isAudioSeparationJobsSchemaUnavailable } from "@/lib/audio-job-errors";

const jobContextSchema = z.object({
  projectId: z.string().min(1).max(200),
  groupId: z.string().min(1).max(200),
  sourceAssetId: z.string().min(1).max(240),
  sourceRevision: z.number().int().nonnegative(),
  sourceFingerprint: z.string().min(1).max(500),
  sourceIn: z.number().finite().nonnegative(),
  sourceOut: z.number().finite().positive(),
}).refine((value) => value.sourceOut > value.sourceIn, "Intervalo de áudio inválido.");

const statusSchema = z.enum([
  "uploaded", "queued", "processing", "downloading", "completed",
  "failed", "cancelling", "cancelled",
]);

const jobUpdateSchema = z.object({
  id: z.string().uuid(),
  status: statusSchema,
  outputs: z.object({
    dialogueStorageKey: z.string().min(1).max(1000),
    musicStorageKey: z.string().min(1).max(1000),
    duration: z.number().finite().positive(),
  }).optional(),
  error: z.object({ code: z.string().min(1).max(160), retryable: z.boolean() }).optional(),
}).superRefine((value, context) => {
  if (value.status === "completed" && !value.outputs) {
    context.addIssue({ code: "custom", message: "Um job concluído exige as duas trilhas persistidas." });
  }
});

/** Only scoped, short-lived tickets leave the server, never the worker secret. */
export const prepareAudioSeparation = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((input: unknown) => jobContextSchema.optional().parse(input))
  .handler(async ({ data, context }) => {
    const { jobToken, workerBase, workerPublicBase } = await import("@/lib/cleaner.server");
    const base = workerBase();
    const publicBase = workerPublicBase();
    if (!base || !publicBase) throw new Error("Servidor de separação de áudio não configurado.");
    const response = await fetch(`${base}/v1/audio/capabilities`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error("O serviço de separação de áudio está indisponível.");
    const caps = (await response.json()) as {
      ready?: boolean;
      max_duration?: number;
      engine?: string;
      model?: string;
      sample_rate?: number;
      revision?: string;
      quality?: string;
      shifts?: number;
      overlap?: number;
      ensemble?: { enabled?: boolean; model?: string };
    };
    if (caps.ready !== true)
      throw new Error(
        "O motor de separação não está habilitado no servidor. O áudio original não foi alterado.",
      );
    if (caps.engine !== "bandit")
      throw new Error(
        "O Editor V2 exige o Bandit V2 na RTX para esta separação. O motor antigo não foi usado.",
      );
    const jobId = crypto.randomUUID();
    const recipe = {
      id: `${caps.engine ?? "unknown"}:${caps.model ?? "unknown"}`,
      revision: caps.revision ?? [
        caps.quality ?? "unknown",
        `shifts=${caps.shifts ?? "unknown"}`,
        `overlap=${caps.overlap ?? "unknown"}`,
        `ensemble=${caps.ensemble?.enabled ? caps.ensemble.model ?? "enabled" : "off"}`,
      ].join(";"),
    };
    let persistenceReady = true;
    if (data) {
      const { error } = await context.supabase
        .from("audio_separation_jobs" as never)
        .insert({
          id: jobId,
          user_id: context.userId,
          project_id: data.projectId,
          group_id: data.groupId,
          source_asset_id: data.sourceAssetId,
          source_revision: data.sourceRevision,
          source_fingerprint: data.sourceFingerprint,
          source_in: data.sourceIn,
          source_out: data.sourceOut,
          recipe_id: recipe.id,
          recipe_revision: recipe.revision,
          status: "pending_upload",
        } as never);
      if (error) {
        if (isAudioSeparationJobsSchemaUnavailable(error)) persistenceReady = false;
        else throw new Error(`Não foi possível registrar o processamento de áudio: ${error.message}`);
      }
    }
    return {
      jobId,
      base: `${publicBase}/v1/audio/jobs/${jobId}`,
      uploadToken: jobToken(jobId, "upload", 600),
      controlToken: jobToken(jobId, "control", 1800),
      resultToken: jobToken(jobId, "result", 1800),
      maxDuration: Math.min(180, caps.max_duration ?? 180),
      sampleRate: caps.sample_rate === 48_000 ? 48_000 : 44_100,
      recipe,
      persistenceReady,
    };
  });

/** Persists only lifecycle metadata; worker tickets never enter the database. */
export const updateAudioSeparationJob = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((input: unknown) => jobUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const patch = {
      status: data.status,
      dialogue_storage_key: data.outputs?.dialogueStorageKey ?? null,
      music_storage_key: data.outputs?.musicStorageKey ?? null,
      duration: data.outputs?.duration ?? null,
      error_code: data.error?.code ?? null,
      error_retryable: data.error?.retryable ?? null,
    };
    const { data: row, error } = await context.supabase
      .from("audio_separation_jobs" as never)
      .update(patch as never)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("id,status,result_revision,updated_at")
      .maybeSingle();
    if (error) {
      if (isAudioSeparationJobsSchemaUnavailable(error)) {
        return { id: data.id, status: data.status, result_revision: 0, updated_at: new Date().toISOString() };
      }
      throw new Error(error.message);
    }
    if (!row) throw new Error("Processamento de áudio não encontrado.");
    return row as unknown as { id: string; status: string; result_revision: number; updated_at: string };
  });

/** Reissues short-lived control/result tickets after refresh without persisting secrets. */
export const resumeAudioSeparationJob = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("audio_separation_jobs" as never)
      .select("id,project_id,group_id,source_asset_id,source_revision,source_fingerprint,source_in,source_out,recipe_id,recipe_revision,status,result_revision,dialogue_storage_key,music_storage_key,duration,error_code,error_retryable,created_at,updated_at")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Processamento de áudio não encontrado.");
    const { jobToken, workerPublicBase } = await import("@/lib/cleaner.server");
    const publicBase = workerPublicBase();
    if (!publicBase) throw new Error("Servidor de separação de áudio não configurado.");
    return {
      job: row,
      ticket: {
        jobId: data.id,
        base: `${publicBase}/v1/audio/jobs/${data.id}`,
        controlToken: jobToken(data.id, "control", 1800),
        resultToken: jobToken(data.id, "result", 1800),
      },
    };
  });
