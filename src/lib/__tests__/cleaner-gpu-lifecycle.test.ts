import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelChunk, chunkStatus, ensureGpuAutoShutdown, gpuHealth, submitChunk } from "@/lib/cleaner-gpu.server";

describe("RunPod lifecycle cost guards", () => {
  const fetchMock = vi.fn();
  const safeConfig = { workersMin: 0, workersMax: 1, gpuCount: 1, idleTimeout: 5, executionTimeoutMs: 600_000 };
  beforeEach(() => {
    vi.stubEnv("RUNPOD_ENDPOINT_ID", "test-endpoint");
    vi.stubEnv("RUNPOD_API_KEY", "test-key-with-enough-characters");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("cancels a diagnostic still queued after runsync returns", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(safeConfig));
    fetchMock.mockResolvedValueOnce(Response.json({ id: "health-1", status: "IN_QUEUE" }));
    fetchMock.mockResolvedValueOnce(Response.json({ status: "CANCELLED" }));
    expect((await gpuHealth()).online).toBe(false);
    expect(fetchMock.mock.calls[2]?.[0]).toContain("/cancel/health-1");
    const body = JSON.parse(fetchMock.mock.calls[1]?.[1].body);
    expect(body.policy).toEqual({ executionTimeout: 30_000, ttl: 180_000 });
  });

  it("does not cancel a completed diagnostic", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(safeConfig));
    fetchMock.mockResolvedValueOnce(Response.json({
      id: "health-2", status: "COMPLETED", output: { ok: true, ai_ready: true, pipeline_revision: "scene-roi-v3" },
    }));
    expect((await gpuHealth()).online).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sets provider deadlines even if the frontend stops polling", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(safeConfig));
    fetchMock.mockResolvedValueOnce(Response.json({ id: "chunk-1" }));
    await submitChunk({
      chunkIndex: 0, sourceUrl: "https://example.com/source.mp4", sourceIsChunk: true,
      start: 0, end: 5, overlap: 0.5, mode: "subtitle", preset: "quality", masks: [], options: {},
    });
    const body = JSON.parse(fetchMock.mock.calls[1]?.[1].body);
    expect(body.policy).toEqual({ executionTimeout: 600_000, ttl: 1_800_000 });
    expect(body.input.source_is_chunk).toBe(true);
    expect(body.input.expected_revision).toBe("scene-roi-v3");
  });

  it.each([
    { workersMin: 1 }, { workersMax: 2 }, { workersMax: 0 },
    { gpuCount: 2 }, { idleTimeout: 60 }, { executionTimeoutMs: 0 },
  ])("blocks paid work with unsafe/unavailable capacity %j", async (override) => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...safeConfig, ...override }));
    await expect(ensureGpuAutoShutdown()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("rest.runpod.io/v1/endpoints/");
  });

  it("does not start a diagnostic when capacity is disabled", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...safeConfig, workersMax: 0 }));
    expect((await gpuHealth()).online).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports older workers as unavailable for the refined flow", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(safeConfig));
    fetchMock.mockResolvedValueOnce(Response.json({ status: "COMPLETED", output: {
      ok: true, pipeline_revision: "scene-masks-v1",
    } }));
    expect((await gpuHealth()).online).toBe(false);
  });

  it("propagates cancellation failure so the orchestrator can retry it", async () => {
    fetchMock.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    await expect(cancelChunk("still-running")).rejects.toThrow();
  });

  it("separates handler duration from provider duration and records the GPU", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ status: "COMPLETED", executionTime: 12_500, output: {
      ok: true, seconds: 10.2, gpu_name: "NVIDIA RTX A5000", pipeline_revision: "scene-roi-v3",
    } }));
    expect(await chunkStatus("timed")).toMatchObject({ seconds: 10.2,
      providerExecutionSeconds: 12.5, gpuName: "NVIDIA RTX A5000", pipelineRevision: "scene-roi-v3" });
  });

  it("rejects completed provider responses that contain no successful pipeline result", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ status: "COMPLETED", output: {} }));
    expect((await chunkStatus("invalid-result")).state).toBe("failed");
  });

  it("preserves visual review warnings from a completed GPU job", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ status: "COMPLETED", output: {
      ok: true, quality_issues: ["possivel_borrado", "texto_residual", null],
    } }));
    expect((await chunkStatus("review-result")).qualityIssues).toEqual([
      "possivel_borrado", "texto_residual",
    ]);
  });

  it("does not silently pass outputs from workers without quality verification", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ status: "COMPLETED", output: { ok: true } }));
    expect((await chunkStatus("legacy-result")).qualityIssues).toEqual(["verificacao_indisponivel"]);
  });
});
