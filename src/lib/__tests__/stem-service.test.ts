import { afterEach, describe, expect, it, vi } from "vitest";
import { runStemJob, type StemTicket } from "@/lib/editor/stem-service";

vi.mock("@/lib/audio.functions", () => ({ prepareAudioSeparation: vi.fn() }));
import { encodeStereoWav } from "@/lib/editor/stems";

const ticket: StemTicket = {
  base: "https://worker.test/v1/audio/jobs/test",
  uploadToken: "upload",
  controlToken: "control",
  resultToken: "result",
  maxDuration: 180,
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());

describe("real audio separation", () => {
  it("encodes stereo without mixing left/right", async () => {
    const blob = encodeStereoWav([new Float32Array([1, 0]), new Float32Array([0, -1])], 44100);
    const data = new DataView(await blob.arrayBuffer());
    expect(data.getUint16(22, true)).toBe(2);
    expect(data.getUint32(24, true)).toBe(44100);
    expect([44, 46, 48, 50].map((p) => data.getInt16(p, true))).toEqual([32767, 0, 0, -32768]);
  });

  it("uploads once and downloads both stems with result-only tokens", async () => {
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      if (url.endsWith("/upload")) {
        expect(headers["x-job-token"]).toBe("upload");
        return json({});
      }
      if (url.endsWith("/start")) return json({});
      if (url.includes("/stems/")) {
        expect(headers["x-job-token"]).toBe("result");
        return new Response(new Uint8Array(256), { headers: { "content-type": "audio/mpeg" } });
      }
      return json({ status: "completed", duration: 5 });
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await runStemJob(ticket, new Blob(["wav"]));
    expect(result.duration).toBe(5);
    expect(result.voice.size).toBe(256);
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/start"))).toHaveLength(1);
  });

  it("does not fake success or retry a failed engine", async () => {
    const fetcher = vi.fn(async (url: string) =>
      url === ticket.base ? json({ status: "failed", error: "Model failed" }) : json({}),
    );
    vi.stubGlobal("fetch", fetcher);
    await expect(runStemJob(ticket, new Blob())).rejects.toThrow("Model failed");
    expect(fetcher.mock.calls.some(([url]) => url.endsWith("/cancel"))).toBe(true);
    expect(fetcher.mock.calls.some(([url]) => url.includes("/stems/"))).toBe(false);
  });

  it("cancels when a start response is lost", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/start")) throw new Error("network");
      return json({});
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(runStemJob(ticket, new Blob())).rejects.toThrow("network");
    expect(fetcher.mock.calls.at(-1)?.[0]).toBe(`${ticket.base}/cancel`);
  });

  it("rejects HTML disguised as completed output", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/stems/"))
          return new Response("<html>error</html>", { headers: { "content-type": "text/html" } });
        return json({ status: "completed", duration: 5 });
      }),
    );
    await expect(runStemJob(ticket, new Blob())).rejects.toThrow("trilha de áudio");
  });
});
