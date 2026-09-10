import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queries: [] as Array<{ data?: unknown; error?: unknown }>,
  mutations: [] as Array<{ table: string; patch: Record<string, unknown> }>,
  list: vi.fn(), remove: vi.fn(), cancel: vi.fn(), workerCancel: vi.fn(), workerCleanup: vi.fn(), submit: vi.fn(),
}));

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from(table: string) {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "not", "order", "range", "limit", "maybeSingle", "single", "or"]) {
      builder[method] = () => builder;
    }
    builder["update"] = (patch: Record<string, unknown>) => { mocks.mutations.push({ table, patch }); return builder; };
    builder["then"] = (resolve: (result: unknown) => unknown) => Promise.resolve(mocks.queries.shift() ?? { data: [], error: null }).then(resolve);
    return builder;
  },
  storage: { from: () => ({ list: mocks.list, remove: mocks.remove }) },
} }));
vi.mock("@/lib/cleaner-gpu.server", () => ({
  cancelChunk: mocks.cancel, submitChunk: mocks.submit, chunkStatus: vi.fn(), gpuConfigured: () => false,
  jobChunkSourceUrl: vi.fn(), GpuBlockedError: class extends Error {}, GpuRetryableError: class extends Error {},
}));
vi.mock("@/lib/cleaner.server", () => ({
  workerCancel: mocks.workerCancel, workerCleanup: mocks.workerCleanup, workerAssemble: vi.fn(),
  workerPlanChunks: vi.fn(), workerStatus: vi.fn(),
}));

import { pumpCleanerJob, purgeChunkArtifacts, retryCleanerCleanup } from "@/lib/cleaner-chunks.server";

describe("temporary cleanup and terminal GPU jobs", () => {
  beforeEach(() => {
    mocks.queries.length = 0; mocks.mutations.length = 0;
    for (const fn of [mocks.list, mocks.remove, mocks.cancel, mocks.submit, mocks.workerCancel, mocks.workerCleanup]) fn.mockReset();
    mocks.list.mockResolvedValue({ data: [], error: null });
    mocks.remove.mockResolvedValue({ data: [], error: null });
    mocks.workerCleanup.mockResolvedValue({ ok: true });
  });

  it("keeps references when storage rejects removal, with bounded retries", async () => {
    mocks.queries.push({ data: [{ output_url: "job-1/chunk-0000-a1.mp4" }] });
    mocks.remove.mockResolvedValue({ error: { message: "storage down" } });
    await expect(purgeChunkArtifacts("job-1")).rejects.toThrow();
    expect(mocks.remove).toHaveBeenCalledTimes(2);
    expect(mocks.mutations).toHaveLength(0);
  });

  it("collects all pages before deletion and leaves originals/results alone", async () => {
    mocks.queries.push({ data: [] });
    mocks.list.mockResolvedValueOnce({ data: Array.from({ length: 200 }, (_, i) => ({ name: `chunk-${i}-a1.mp4` })), error: null });
    mocks.list.mockResolvedValueOnce({ data: [{ name: "chunk-200-a1.mp4" }, { name: "output.mp4" }, { name: "input.mp4" }], error: null });
    expect(await purgeChunkArtifacts("job-1")).toBe(201);
    expect(mocks.list.mock.calls[1]?.[1].offset).toBe(200);
    expect(mocks.remove).toHaveBeenCalledTimes(2);
    expect(mocks.remove.mock.calls.flatMap((call) => call[0])).not.toContain("job-1/output.mp4");
    expect(mocks.mutations.every((item) => item.patch["output_url"] === null)).toBe(true);
  });

  it("rejects references to another project's files", async () => {
    mocks.queries.push({ data: [{ output_url: "other/chunk-0-a1.mp4" }] });
    await expect(purgeChunkArtifacts("job-1")).rejects.toThrow(/fora/);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("does not delete artifacts or forget IDs after cancellation fails", async () => {
    mocks.queries.push({ data: { status: "cancelled", metrics: {} } }, {}, {},
      { data: [{ id: "chunk-1", provider_job_id: "provider-1" }] });
    mocks.cancel.mockRejectedValue(new Error("provider offline"));
    await expect(retryCleanerCleanup("job-1")).rejects.toThrow(/Cancelamento/);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.workerCleanup).not.toHaveBeenCalled();
    expect(mocks.mutations.some(({ patch }) => patch["provider_job_id"] === null)).toBe(false);
  });

  it("polling a completed job never submits or reassembles it", async () => {
    mocks.queries.push({ data: { status: "completed", engine: "gpu", metrics: { cleanup_pending: false } } },
      { data: [{ status: "done" }] }, { data: { status: "completed" } });
    expect((await pumpCleanerJob("job-1")).status).toBe("completed");
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.mutations).toHaveLength(0);
  });
});
