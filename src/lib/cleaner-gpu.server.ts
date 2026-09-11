/**
 * CleanerIA v3 — camada GPU sob demanda (RunPod Serverless).
 *
 * Cada chunk do vídeo vira UMA invocação serverless: o worker baixa o trecho
 * pela URL assinada do worker CPU, roda ProPainter/DiffuEraser na GPU, devolve
 * apenas o miolo (sem a sobreposição) e envia o resultado para o storage.
 */
import { jobToken, workerPublicBase } from "@/lib/cleaner.server";

const RUNPOD_BASE = "https://api.runpod.ai/v2";
const RUNPOD_CONTROL_BASE = "https://rest.runpod.io/v1";
export const CLEANER_PIPELINE_REVISION = "scene-roi-v4";

export type GpuDenied = { denied: true; status: number; message: string; requires?: string };

export class GpuBlockedError extends Error {
  readonly status: number;
  readonly requires: string | undefined;
  constructor(status: number, message: string, requires?: string) {
    super(message);
    this.name = "GpuBlockedError";
    this.status = status;
    this.requires = requires;
  }
}

export class GpuRetryableError extends Error {
  readonly status: number;
  readonly retryAfter: number;
  constructor(status: number, message: string, retryAfter: number) {
    super(message);
    this.name = "GpuRetryableError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function endpointId(): string | null {
  const value = process.env["RUNPOD_ENDPOINT_ID"];
  return value && value.trim() ? value.trim() : null;
}

function apiKey(): string | null {
  const value = process.env["RUNPOD_API_KEY"];
  return value && value.trim().length >= 20 ? value.trim() : null;
}

export function gpuConfigured(): boolean {
  return !!endpointId() && !!apiKey();
}

export type GpuHealth = {
  configured: boolean;
  online: boolean;
  workerVersion?: string;
  pipelineRevision?: string;
  gpuName?: string;
  gpuVramGb?: number | null;
  aiReady?: boolean;
  maxReady?: boolean;
  engines?: Record<string, { ready?: boolean; missing?: string[] }>;
  reason?: string;
};

/** Read-only preflight: never submit paid work to always-on/unbounded capacity. */
export async function ensureGpuAutoShutdown(): Promise<void> {
  const id = endpointId();
  const key = apiKey();
  if (!id || !key) throw new GpuBlockedError(403, "GPU não configurada", "admin_action");
  const response = await fetch(`${RUNPOD_CONTROL_BASE}/endpoints/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new GpuBlockedError(503, "Não foi possível conferir o desligamento automático da GPU", "admin_action");
  }
  const config = await response.json() as Record<string, unknown>;
  // Use the provider's actual settings, not a local checkbox or stale cache.
  // One endpoint can serve several jobs: scale-to-zero belongs to RunPod, not
  // to a per-job shutdown request that could interrupt somebody else's work.
  if (config["workersMin"] !== 0 || config["gpuCount"] !== 1
      || typeof config["idleTimeout"] !== "number" || config["idleTimeout"] < 1 || config["idleTimeout"] > 5
      || typeof config["workersMax"] !== "number" || config["workersMax"] > 1
      || typeof config["executionTimeoutMs"] !== "number"
      || config["executionTimeoutMs"] < 5_000 || config["executionTimeoutMs"] > 600_000) {
    throw new GpuBlockedError(409,
      "GPU pausada: configure mínimo 0, máximo 1, uma GPU, desligamento em até 5 s e execução em até 10 min",
      "admin_action");
  }
  if (config["workersMax"] !== 1) {
    throw new GpuBlockedError(409, "GPU desligada: endpoint sem capacidade habilitada", "admin_action");
  }
}

async function runpod<T>(path: string, init: RequestInit = {}): Promise<T> {
  const id = endpointId();
  const key = apiKey();
  if (!id || !key) throw new GpuBlockedError(403, "GPU não configurada (RUNPOD_*)", "admin_action");
  const response = await fetch(`${RUNPOD_BASE}/${id}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
  });
  const text = await response.text();
  if (!response.ok) {
    const message = text.slice(0, 300) || `runpod ${response.status}`;
    if (response.status === 401 || response.status === 403) {
      throw new GpuBlockedError(response.status, `GPU bloqueada: ${message}`, "admin_action");
    }
    if (response.status === 402) {
      throw new GpuBlockedError(402, `Créditos de GPU esgotados: ${message}`, "top_up");
    }
    if (response.status === 429 || response.status >= 500) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "") || 20;
      throw new GpuRetryableError(response.status, message, retryAfter);
    }
    throw new Error(message);
  }
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new Error("resposta inválida do provedor GPU");
  }
}

/** Diagnóstico real do container GPU, incluindo pesos montados no volume. */
export async function gpuHealth(): Promise<GpuHealth> {
  if (!gpuConfigured()) {
    return { configured: false, online: false, reason: "RUNPOD_API_KEY ou RUNPOD_ENDPOINT_ID ausente" };
  }
  let pendingJobId: string | undefined;
  try {
    await ensureGpuAutoShutdown();
    const result = await runpod<{
      id?: string;
      status?: string;
      output?: Record<string, unknown> | null;
      error?: unknown;
    }>("/runsync?wait=60000", {
      method: "POST",
      signal: AbortSignal.timeout(70_000),
      body: JSON.stringify({
        input: { action: "health" },
        policy: { executionTimeout: 30_000, ttl: 180_000 },
      }),
    });
    if (["IN_QUEUE", "IN_PROGRESS", "RUNNING"].includes(String(result.status).toUpperCase())) {
      pendingJobId = result.id;
    }
    const output = (result.output ?? {}) as Record<string, unknown>;
    if (String(result.status ?? "").toUpperCase() !== "COMPLETED" || output["ok"] !== true) {
      return {
        configured: true,
        online: false,
        reason: String(output["error"] ?? result.error ?? result.status ?? "worker sem resposta"),
      };
    }
    const revision = String(output["pipeline_revision"] ?? "");
    if (revision !== CLEANER_PIPELINE_REVISION) {
      return { configured: true, online: false, pipelineRevision: revision,
        reason: "Motor GPU precisa ser atualizado para o processamento refinado" };
    }
    return {
      configured: true,
      online: true,
      pipelineRevision: revision,
      ...(typeof output["gpu_name"] === "string" ? { gpuName: output["gpu_name"] } : {}),
      ...(typeof output["worker_version"] === "string"
        ? { workerVersion: output["worker_version"] }
        : {}),
      gpuVramGb: Number.isFinite(Number(output["gpu_vram_gb"])) ? Number(output["gpu_vram_gb"]) : null,
      aiReady: output["ai_ready"] === true,
      maxReady: output["max_ready"] === true,
      engines: (output["engines"] as GpuHealth["engines"] | undefined) ?? {},
    };
  } catch (error) {
    return {
      configured: true,
      online: false,
      reason: error instanceof Error ? error.message : "falha ao consultar RunPod",
    };
  } finally {
    // runsync can return a queued job: leaving it behind starts a paid worker
    // even though the UI already reported a failed diagnostic. TTL also covers
    // a lost HTTP response for which we never received the provider job ID.
    // A cancellation failure must be visible, not presented as a successful
    // shutdown. The provider TTL remains an independent final limit.
    if (pendingJobId) await cancelChunk(pendingJobId);
  }
}

export type ChunkPayload = {
  chunkIndex: number;
  sourceUrl: string;
  sourceIsChunk?: boolean;
  uploadUrl?: string | null;
  outputUrl?: string | null;
  start: number;
  end: number;
  overlap: number;
  mode: string;
  preset: string;
  masks: unknown[];
  options: Record<string, unknown>;
};

export async function submitChunk(payload: ChunkPayload): Promise<string> {
  await ensureGpuAutoShutdown();
  const body = {
    // Provider-enforced deadlines remain effective when the browser/ticker is
    // closed. Align total lifetime with the orchestrator's 30-minute deadline.
    policy: { executionTimeout: 600_000, ttl: 1_800_000 },
    input: {
      expected_revision: CLEANER_PIPELINE_REVISION,
      chunk_index: payload.chunkIndex,
      source_url: payload.sourceUrl,
      source_is_chunk: payload.sourceIsChunk ?? false,
      upload_url: payload.uploadUrl ?? null,
      output_url: payload.outputUrl ?? null,
      start: payload.start,
      end: payload.end,
      overlap: payload.overlap,
      mode: payload.mode,
      preset: payload.preset,
      masks: payload.masks,
      options: payload.options,
    },
  };
  const result = await runpod<{ id?: string; status?: string }>("/run", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!result.id) throw new Error("provedor GPU não retornou id do job");
  return result.id;
}

export type ChunkStatus = {
  state: "queued" | "running" | "completed" | "failed";
  qualityIssues?: string[];
  residualText?: number;
  outputUrl?: string | null;
  seconds?: number;
  providerExecutionSeconds?: number;
  gpuName?: string;
  pipelineRevision?: string;
  checksum?: string | null;
  bytes?: number | null;
  error?: string | null;
};

export async function chunkStatus(providerJobId: string): Promise<ChunkStatus> {
  const result = await runpod<{
    status?: string;
    output?: Record<string, unknown> | null;
    error?: unknown;
    executionTime?: number;
  }>(`/status/${encodeURIComponent(providerJobId)}`);
  const raw = String(result.status ?? "").toUpperCase();
  if (raw === "IN_QUEUE") return { state: "queued" };
  if (raw === "IN_PROGRESS" || raw === "RUNNING") return { state: "running" };
  if (raw === "COMPLETED") {
    const output = (result.output ?? {}) as Record<string, unknown>;
    if (output["ok"] !== true) {
      return { state: "failed", error: String(output["error"] ?? "falha no chunk").slice(0, 400),
        providerExecutionSeconds: Number(result.executionTime ?? 0) / 1000,
        seconds: Number(output["seconds"] ?? 0) || 0 };
    }
    return {
      state: "completed",
      qualityIssues: Array.isArray(output["quality_issues"])
        ? output["quality_issues"].filter((item): item is string => typeof item === "string").slice(0, 10)
        : ["verificacao_indisponivel"],
      residualText: Number(output["residual_text"] ?? 0) || 0,
      outputUrl: (output["output_url"] as string | undefined) ?? null,
      seconds: Number(output["seconds"] ?? (result.executionTime ?? 0) / 1000) || 0,
      providerExecutionSeconds: Number(result.executionTime ?? 0) / 1000,
      ...(typeof output["gpu_name"] === "string" ? { gpuName: output["gpu_name"] } : {}),
      ...(typeof output["pipeline_revision"] === "string" ? { pipelineRevision: output["pipeline_revision"] } : {}),
      checksum: typeof output["checksum"] === "string" ? (output["checksum"] as string) : null,
      bytes: Number(output["bytes"] ?? 0) || null,
    };
  }
  return {
    state: "failed",
    providerExecutionSeconds: Number(result.executionTime ?? 0) / 1000,
    error: String((result.error ?? raw) || "falha desconhecida na GPU").slice(0, 400),

  };
}

export async function cancelChunk(providerJobId: string): Promise<void> {
  await runpod(`/cancel/${encodeURIComponent(providerJobId)}`, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
  });
}

/** URL assinada (HMAC do worker) do vídeo original — consumida pela GPU. */
export function jobChunkSourceUrl(jobId: string, chunkIndex: number, ttlSeconds = 60 * 60 * 3): string {
  const base = workerPublicBase();
  if (!base) throw new Error("worker-offline");
  return `${base}/v1/jobs/${jobId}/chunks/${chunkIndex}/source?token=${encodeURIComponent(jobToken(jobId, "result", ttlSeconds))}`;
}
