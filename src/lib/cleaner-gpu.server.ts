/**
 * CleanerIA v3 — camada GPU sob demanda (RunPod Serverless).
 *
 * Cada chunk do vídeo vira UMA invocação serverless: o worker baixa o trecho
 * pela URL assinada do worker CPU, roda ProPainter/DiffuEraser na GPU, devolve
 * apenas o miolo (sem a sobreposição) e envia o resultado para o storage.
 */
import { jobToken, workerPublicBase } from "@/lib/cleaner.server";

const RUNPOD_BASE = "https://api.runpod.ai/v2";

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

export type ChunkPayload = {
  chunkIndex: number;
  sourceUrl: string;
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
  const body = {
    input: {
      chunk_index: payload.chunkIndex,
      source_url: payload.sourceUrl,
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
  residualText?: number;
  outputUrl?: string | null;
  seconds?: number;
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
  if (raw === "IN_PROGRESS") return { state: "running" };
  if (raw === "COMPLETED") {
    const output = (result.output ?? {}) as Record<string, unknown>;
    if (output["ok"] === false) {
      return { state: "failed", error: String(output["error"] ?? "falha no chunk").slice(0, 400) };
    }
    return {
      state: "completed",
      residualText: Number(output["residual_text"] ?? 0) || 0,
      outputUrl: (output["output_url"] as string | undefined) ?? null,
      seconds: Number(output["seconds"] ?? (result.executionTime ?? 0) / 1000) || 0,
    };
  }
  return {
    state: "failed",
    error: String(result.error ?? raw || "falha desconhecida na GPU").slice(0, 400),
  };
}

export async function cancelChunk(providerJobId: string): Promise<void> {
  try {
    await runpod(`/cancel/${encodeURIComponent(providerJobId)}`, { method: "POST" });
  } catch {
    // cancelamento é best-effort
  }
}

/** URL assinada (HMAC do worker) do vídeo original — consumida pela GPU. */
export function jobSourceUrl(jobId: string, ttlSeconds = 60 * 60 * 3): string {
  const base = workerPublicBase();
  if (!base) throw new Error("worker-offline");
  return `${base}/v1/jobs/${jobId}/source?token=${encodeURIComponent(jobToken(jobId, "result", ttlSeconds))}`;
}
