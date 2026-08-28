import { jobToken, workerBase, workerPublicBase } from "@/lib/cleaner.server";

/**
 * Cliente HTTP do serviço de render da VPS. Reaproveita o mesmo host e a mesma
 * autenticação HMAC já usados pelo CleanerIA.
 */

interface WorkerItemStatus {
  id?: string;
  status?: string;
  progress?: number;
  stage?: string | null;
  result_url?: string | null;
  error?: string | null;
}

function compact(body: string, status?: number): string {
  const text = body.trim();
  if (/^<!doctype html/i.test(text) || /<html[\s>]/i.test(text)) {
    return `motor de render respondeu HTML em vez de API JSON${status ? ` (${status})` : ""}`;
  }
  return text.slice(0, 400) || (status ? `worker ${status}` : "resposta vazia do motor");
}

async function call<T>(path: string, init: RequestInit & { jobId?: string } = {}): Promise<T> {
  const base = workerBase();
  if (!base) throw new Error("worker-offline");
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (init.jobId) headers.set("x-job-token", jobToken(init.jobId, "control"));
  const response = await fetch(`${base}${path}`, { ...init, headers });
  const body = await response.text();
  if (!response.ok) throw new Error(compact(body, response.status));
  try {
    return (body ? JSON.parse(body) : {}) as T;
  } catch {
    throw new Error(compact(body));
  }
}

/** Assina o link de download de um item já renderizado. */
export function renderResultUrl(batchId: string, itemId: string): string | null {
  const base = workerPublicBase() ?? workerBase();
  if (!base) return null;
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return null;
  const url = new URL(`/v1/render/items/${itemId}/result`, `${base}/`);
  url.searchParams.set("token", jobToken(batchId, "result", 60 * 60 * 72));
  return url.toString();
}

export async function workerCreateRenderJob(input: {
  batchId: string;
  preset: unknown;
  items: { id: string; name: string; sourceUrl?: string | null; overrides?: unknown }[];
  callbackUrl: string;
}) {
  return call<{ ok: boolean; queued?: number }>(`/v1/render/jobs`, {
    method: "POST",
    jobId: input.batchId,
    body: JSON.stringify({
      job_id: input.batchId,
      preset: input.preset,
      callback_url: input.callbackUrl,
      items: input.items.map((item) => ({
        id: item.id,
        name: item.name,
        source_url: item.sourceUrl ?? null,
        overrides: item.overrides ?? {},
      })),
    }),
  });
}

export async function workerRenderStatus(batchId: string) {
  return call<{ status?: string; items?: WorkerItemStatus[] }>(`/v1/render/jobs/${batchId}`, {
    jobId: batchId,
  });
}

export async function workerCancelRender(batchId: string) {
  return call<{ ok: boolean }>(`/v1/render/jobs/${batchId}/cancel`, {
    method: "POST",
    jobId: batchId,
  });
}

export async function workerStartRender(batchId: string) {
  return call<{ ok: boolean }>(`/v1/render/jobs/${batchId}/start`, {
    method: "POST",
    jobId: batchId,
  });
}

export function renderUploadToken(batchId: string): string {
  return jobToken(batchId, "upload", 60 * 60 * 6);
}
