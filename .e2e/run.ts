/* E2E CleanerIA: upload -> plan -> GPU chunks -> assemble -> purge */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { workerUploadToken, workerStatus, workerDelete } from "@/lib/cleaner.server";
import { planCleanerChunks, pumpCleanerJob, purgeChunkArtifacts } from "@/lib/cleaner-chunks.server";

const base = process.env["CLEANER_WORKER_URL"]!;
const file = process.argv[2] ?? "/tmp/e2e/real.mp4";

const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
const db = supabaseAdmin;

const { data: users } = await db.from("cleaner_jobs").select("user_id").limit(1);
const userId = (users?.[0] as { user_id: string } | undefined)?.user_id;
if (!userId) throw new Error("nenhum user_id encontrado");

const jobId = randomUUID();
const masks = [{ x: 0.08, y: 0.74, w: 0.84, h: 0.16, role: "remove", enabled: true }];
const { error } = await db.from("cleaner_jobs").insert({
  id: jobId,
  user_id: userId,
  filename: "real.mp4",
  mode: "captions",
  preset: "quality",
  status: "uploading",
  stage: "e2e",
  masks,
  options: {},
} as never);
if (error) throw new Error(error.message);
console.log("job", jobId, "user", userId);

const token = await workerUploadToken(jobId);
const bytes = readFileSync(file);
const up = await fetch(`${base}/v1/jobs/${jobId}/upload`, {
  method: "POST",
  headers: { "x-job-token": token, "content-type": "video/mp4" },
  body: bytes,
});
console.log("upload", up.status, (await up.text()).slice(0, 200));

const total = await planCleanerChunks(jobId, userId);
console.log("chunks planejados:", total);

const started = Date.now();
let last = "";
for (;;) {
  const r = await pumpCleanerJob(jobId);
  const line = JSON.stringify(r);
  if (line !== last) {
    console.log(`[${Math.round((Date.now() - started) / 1000)}s]`, line);
    last = line;
  }
  const { data: chunks } = await db
    .from("cleaner_chunks")
    .select("idx,status,attempts,residual_text,seconds")
    .eq("job_id", jobId)
    .order("idx");
  if (r.status === "done" || r.status === "failed" || r.paused) {
    console.log("chunks:", JSON.stringify(chunks));
    break;
  }
  if (Date.now() - started > 25 * 60 * 1000) {
    console.log("TIMEOUT", JSON.stringify(chunks));
    break;
  }
  await new Promise((res) => setTimeout(res, 10_000));
}

const { data: job } = await db.from("cleaner_jobs").select("*").eq("id", jobId).maybeSingle();
const j = job as Record<string, unknown>;
console.log("job final:", JSON.stringify({
  status: j?.["status"], stage: j?.["stage"], progress: j?.["progress"],
  engine: j?.["engine"], error: j?.["error"], has_result: Boolean(j?.["result_url"]),
}));
try {
  console.log("worker status:", JSON.stringify(await workerStatus(jobId)).slice(0, 400));
} catch (e) { console.log("worker status erro", String(e)); }

const resultUrl = String(j?.["result_url"] ?? "");
if (resultUrl) {
  const res = await fetch(resultUrl);
  const buf = new Uint8Array(await res.arrayBuffer());
  console.log("download final:", res.status, buf.byteLength, "bytes");
  await Bun.write("/tmp/e2e/final.mp4", buf);
}

const purged = await purgeChunkArtifacts(jobId);
console.log("temporários removidos:", purged);
const { data: leftovers } = await db.storage.from("cleaner-chunks").list(jobId, { limit: 100 });
console.log("restam no storage:", (leftovers ?? []).length);
console.log("JOB_ID", jobId);
