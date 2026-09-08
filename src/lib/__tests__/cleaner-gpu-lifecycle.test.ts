import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chunkStatus, gpuHealth, submitChunk } from "@/lib/cleaner-gpu.server";

describe("RunPod lifecycle cost guards", () => {
  const fetchMock = vi.fn();
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
    fetchMock.mockResolvedValueOnce(Response.json({ id: "health-1", status: "IN_QUEUE" }));
    fetchMock.mockResolvedValueOnce(Response.json({ status: "CANCELLED" }));
    expect((await gpuHealth()).online).toBe(false);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/cancel/health-1");
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1].body);
    expect(body.policy).toEqual({ executionTimeout: 30_000, ttl: 180_000 });
  });

  it("does not cancel a completed diagnostic", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({
      id: "health-2", status: "COMPLETED", output: { ok: true, ai_ready: true },
    }));
    expect((await gpuHealth()).online).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sets provider deadlines even if the frontend stops polling", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ id: "chunk-1" }));
    await submitChunk({
      chunkIndex: 0, sourceUrl: "https://example.com/source.mp4", sourceIsChunk: true,
      start: 0, end: 5, overlap: 0.5, mode: "subtitle", preset: "quality", masks: [], options: {},
    });
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1].body);
    expect(body.policy).toEqual({ executionTimeout: 600_000, ttl: 1_800_000 });
    expect(body.input.source_is_chunk).toBe(true);
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
