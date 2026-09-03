import { createHmac, timingSafeEqual } from "crypto";
import { getRequest } from "@tanstack/react-start/server";
import type { CleanerRegion } from "@/lib/cleaner";

type JobTokenScope = "upload" | "control" | "result";
type ServiceTokenScope = "media" | "publish-hook";
type MediaHeaders = Record<string, string>;

export function appOrigin(): string {
  const configuredUrl = process.env["PUBLIC_SITE_URL"];
  if (configuredUrl) return configuredUrl.replace(/\/+$/, "");
  try {
    const request = getRequest();
    const proto =
      request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (host) return `${proto}://${host}`;
    return new URL(request.url).origin;
  } catch {
    return "";
  }
}

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "");
}

function compactWorkerError(body: string, status?: number): string {
  const text = body.trim();
  if (/^<!doctype html/i.test(text) || /<html[\s>]/i.test(text)) {
    return status
      ? `motor respondeu HTML em vez de API JSON (${status}); verifique CLEANER_WORKER_URL`
      : "motor respondeu HTML em vez de API JSON; verifique CLEANER_WORKER_URL";
  }
  return text.slice(0, 400) || (status ? `worker ${status}` : "resposta vazia do motor");
}

export function workerBase(): string | null {
  const url = process.env["CLEANER_WORKER_URL"];
  const publicUrl = process.env["CLEANER_WORKER_PUBLIC_URL"];
  // O runtime serverless bloqueia subrequisições em http:// e acesso direto a IP.
  // Sempre que existir um domínio HTTPS público, ele é a base de controle.
  const isSafe = (value?: string | null) =>
    !!value && /^https:\/\//i.test(value) && !/^https:\/\/(\d{1,3}\.){3}\d{1,3}(:|\/|$)/i.test(value);
  if (isSafe(publicUrl)) return normalizeBase(publicUrl!);
  return url ? normalizeBase(url) : publicUrl ? normalizeBase(publicUrl) : null;
}


export function workerPublicBase(): string | null {
  const url = process.env["CLEANER_WORKER_PUBLIC_URL"];
  return url ? normalizeBase(url) : workerBase();
}


function secret(): string {
  const value = process.env["CLEANER_WORKER_SECRET"] ?? "";
  if (value.length < 32 || value === "default_secret") {
    throw new Error("CLEANER_WORKER_SECRET ausente ou fraco");
  }
  return value;
}

let legacyTokenCache: boolean | null = null;
let legacyTokenCacheAt = 0;

function legacyJobToken(jobId: string): string {
  return createHmac("sha256", secret()).update(jobId).digest("hex");
}

async function usesLegacyWorkerToken(): Promise<boolean> {
  if (process.env["CLEANER_WORKER_LEGACY_AUTH"] === "1") return true;
  if (process.env["CLEANER_WORKER_LEGACY_AUTH"] === "0") return false;
  if (legacyTokenCache !== null && Date.now() - legacyTokenCacheAt < 30_000) return legacyTokenCache;
  const base = workerBase();
  if (!base) return false;
  try {
    const response = await fetch(`${base}/v1/health`);
    const body = (await response.json()) as { version?: unknown };
    legacyTokenCache = body.version === "1.0.0";
  } catch {
    legacyTokenCache = false;
  }
  legacyTokenCacheAt = Date.now();
  return legacyTokenCache;
}

export function jobToken(jobId: string, scope: JobTokenScope, ttlSeconds = 60 * 60): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `v2.${jobId}.${expires}.${scope}`;
  const signature = createHmac("sha256", secret()).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function serviceToken(scope: ServiceTokenScope, ttlSeconds = 60): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `v2.service.${expires}.${scope}`;
  const signature = createHmac("sha256", secret()).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function mediaProxyTicket(url: string, headers: MediaHeaders = {}, ttlSeconds = 10 * 60) {
  const safeHeaders = Object.fromEntries(
    Object.entries(headers).filter(
      ([key, value]) => ["user-agent", "referer", "origin", "range"].includes(key.toLowerCase()) && value.length <= 1000,
    ),
  );
  const payload = Buffer.from(
    JSON.stringify({ url, headers: safeHeaders, exp: Math.floor(Date.now() / 1000) + ttlSeconds }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret()).update(`media.${payload}`).digest("hex");
  return `${payload}.${signature}`;
}

export function hookSecret(): string {
  const value = process.env["PUBLISH_HOOK_SECRET"] ?? "";
  if (value.length < 32 || value === "default_secret") {
    throw new Error("PUBLISH_HOOK_SECRET ausente ou fraco");
  }
  return value;
}

export function authorizedHook(request: Request): boolean {
  const configured = hookSecret();
  const supplied =
    request.headers.get("x-publish-hook-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!supplied || supplied.length !== configured.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(configured));
}

export function verifyMediaProxyTicket(ticket: string | null): {
  url: string;
  headers: MediaHeaders;
} | null {
  if (!ticket || ticket.length > 12_000) return null;
  const [payload, supplied, extra] = ticket.split(".");
  if (!payload || !supplied || extra || !/^[0-9a-f]{64}$/i.test(supplied)) return null;
  const expected = createHmac("sha256", secret()).update(`media.${payload}`).digest("hex");
  if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(supplied, "hex"))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      url?: unknown;
      headers?: unknown;
      exp?: unknown;
    };
    if (
      typeof parsed.url !== "string" ||
      typeof parsed.exp !== "number" ||
      parsed.exp < Math.floor(Date.now() / 1000) ||
      !parsed.headers ||
      typeof parsed.headers !== "object"
    ) {
      return null;
    }
    const headers = Object.fromEntries(
      Object.entries(parsed.headers as Record<string, unknown>).filter(
        ([key, value]) =>
          ["user-agent", "referer", "origin", "range"].includes(key.toLowerCase()) &&
          typeof value === "string" &&
          value.length <= 1000,
      ),
    ) as MediaHeaders;
    return { url: parsed.url, headers };
  } catch {
    return null;
  }
}

export function workerResultUrl(pathOrUrl: unknown): string | null {
  if (typeof pathOrUrl !== "string" || !pathOrUrl) return null;
  const base = workerPublicBase() ?? workerBase();
  if (!base) return null;
  let result: URL;
  try {
    result = new URL(pathOrUrl, `${base}/`);
    if (result.origin !== new URL(base).origin) return null;
  } catch {
    return null;
  }
  const match = /^\/v1\/jobs\/([0-9a-f-]{36})\/(result|preview)$/i.exec(result.pathname);
  if (!match?.[1]) return null;
  result.searchParams.set("token", jobToken(match[1], "result", 60 * 60 * 72));
  return result.toString();
}

export function verifyCallback(
  body: string,
  signature: string | null,
  timestamp: string | null,
): boolean {
  if (!signature || !timestamp || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return false;
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret()).update(`${timestamp}.${body}`).digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

async function call<T>(path: string, init: RequestInit & { jobId?: string } = {}): Promise<T> {
  const base = workerBase();
  if (!base) throw new Error("worker-offline");
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (init.jobId) {
    headers.set(
      "x-job-token",
      (await usesLegacyWorkerToken()) ? legacyJobToken(init.jobId) : jobToken(init.jobId, "control"),
    );
  }
  const response = await fetch(`${base}${path}`, { ...init, headers });
  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(compactWorkerError(responseBody, response.status));
  }
  const responseBody = await response.text();
  try {
    return (responseBody ? JSON.parse(responseBody) : {}) as T;
  } catch {
    throw new Error(compactWorkerError(responseBody));
  }
}

type HealthDiagnosis =
  | "not_configured"
  | "edge_blocked"
  | "unauthorized"
  | "unreachable"
  | "bad_response";

const DIAGNOSIS_ACTION: Record<HealthDiagnosis, string> = {
  not_configured: "Defina CLEANER_WORKER_PUBLIC_URL com o domínio HTTPS do worker GPU.",
  edge_blocked:
    "A borda (Cloudflare) recusou o acesso — use um domínio HTTPS válido, nunca um IP direto.",
  unauthorized: "Credenciais do worker inválidas — revise CLEANER_WORKER_SECRET.",
  unreachable: "O worker não respondeu a tempo — verifique se a instância GPU está ligada.",
  bad_response: "O endereço respondeu algo que não é a API do worker — confira a URL.",
};

function isIpHost(base: string): boolean {
  try {
    const host = new URL(base).hostname;
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[");
  } catch {
    return false;
  }
}

function diagnose(body: string, status?: number): HealthDiagnosis {
  if (/error code:\s*1003/i.test(body) || /direct ip access/i.test(body)) return "edge_blocked";
  if (status === 401 || status === 403) return "unauthorized";
  if (/^<!doctype html/i.test(body.trim()) || /<html[\s>]/i.test(body)) return "bad_response";
  if (status && status >= 500) return "unreachable";
  return "bad_response";
}

function offline(diagnosis: HealthDiagnosis, reason: string) {
  return {
    online: false as const,
    diagnosis,
    reason,
    action: DIAGNOSIS_ACTION[diagnosis],
  };
}

export async function workerHealth() {
  const base = workerBase();
  if (!base) return offline("not_configured", "CLEANER_WORKER_URL nao configurada");
  if (isIpHost(base)) {
    return offline("edge_blocked", "endereço do worker aponta para um IP direto");
  }
  try {
    const response = await fetch(`${base}/v1/health`, { signal: AbortSignal.timeout(12_000) });

    const responseBody = await response.text();
    if (!response.ok) {
      return offline(
        diagnose(responseBody, response.status),
        compactWorkerError(responseBody, response.status),
      );
    }
    try {
      const parsed = JSON.parse(responseBody) as Record<string, unknown>;
      legacyTokenCache = parsed["version"] === "1.0.0";
      return { online: true as const, ...parsed };
    } catch {
      return offline(diagnose(responseBody), compactWorkerError(responseBody));
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "sem resposta";
    return offline(/timeout|abort/i.test(message) ? "unreachable" : "unreachable", message);
  }
}


export async function workerResolveMedia(url: string) {
  const base = workerBase();
  if (!base) throw new Error("worker-offline");
  const response = await fetch(`${base}/v1/media/resolve`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-service-token": serviceToken("media"),
    },
    body: JSON.stringify({ url }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(compactWorkerError(body, response.status));
  try {
    return JSON.parse(body) as {
    url: string;
    headers: MediaHeaders;
    title?: string;
    thumbnail?: string | null;
    source?: string;
    ext?: string;
    duration?: number;
    size?: number;
  };
  } catch {
    throw new Error(compactWorkerError(body));
  }
}

export async function workerDetect(jobId: string, mode: string, roi?: CleanerRegion | null) {
  return call<{ regions: CleanerRegion[] }>(`/v1/jobs/${jobId}/detect`, {
    method: "POST",
    jobId,
    body: JSON.stringify({ mode, roi: roi ?? null }),
  });
}

export async function workerInputStatus(jobId: string) {
  return call<{ exists: boolean; size: number; probe?: unknown; file_id?: string | null }>(
    `/v1/jobs/${jobId}/input`,
    { jobId },
  );
}

export async function workerProcess(input: {
  jobId: string;
  mode: string;
  preset: string;
  masks: CleanerRegion[];
  options: Record<string, unknown>;
  callbackUrl?: string | null;
}) {
  const send = (payload: typeof input) =>
    call<{ status: string }>(`/v1/jobs/${input.jobId}/process`, {
      method: "POST",
      jobId: input.jobId,
      body: JSON.stringify(payload),
    });
  try {
    return await send(input);
  } catch (err) {
    // O worker pode recusar a origem do callback (ambiente de preview / domínio novo).
    // O app acompanha por polling, então seguimos sem callback em vez de falhar.
    const msg = String((err as Error)?.message ?? "");
    if (input.callbackUrl && /callback origin is not allowed/i.test(msg)) {
      return await send({ ...input, callbackUrl: null });
    }
    throw err;
  }
}


export async function workerStatus(jobId: string) {
  const status = await call<Record<string, unknown>>(`/v1/jobs/${jobId}`, { jobId });
  if (status["result_url"]) status["result_url"] = workerResultUrl(status["result_url"]);
  if (status["preview_url"]) status["preview_url"] = workerResultUrl(status["preview_url"]);
  return status;
}

export async function workerCancel(jobId: string) {
  return call<{ ok: boolean }>(`/v1/jobs/${jobId}/cancel`, { method: "POST", jobId });
}

export async function workerDelete(jobId: string) {
  return call<{ ok: boolean }>(`/v1/jobs/${jobId}`, { method: "DELETE", jobId });
}

export async function workerUploadToken(jobId: string) {
  return (await usesLegacyWorkerToken()) ? legacyJobToken(jobId) : jobToken(jobId, "upload");
}
