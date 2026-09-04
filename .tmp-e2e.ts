// Teste ponta a ponta temporário do CleanerIA (removido após o teste).
import { createClient } from "@supabase/supabase-js";
import { workerUploadToken, workerInputStatus, workerBase, workerStatus } from "@/lib/cleaner.server";
import { planCleanerChunks, pumpCleanerJob } from "@/lib/cleaner-chunks.server";

const db = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false },
});

const { data: users } = await db.auth.admin.listUsers();
const user = users.users[0];
if (!user) throw new Error("sem usuário");
console.log("usuário:", user.email);

const { data: job, error } = await db
  .from("cleaner_jobs")
  .insert({
    user_id: user.id,
    filename: "e2e-5s.mp4",
    mode: "subtitle",
    preset: "fast",
    status: "uploading",
    stage: "e2e",
    progress: 0,
    masks: [
      { id: "m1", role: "remove", shape: "rect", x: 0.08, y: 0.72, w: 0.84, h: 0.12, enabled: true },
    ],
    options: {},
  } as never)
  .select("*")
  .single();
if (error) throw new Error(error.message);
const jobId = (job as { id: string }).id;
console.log("job:", jobId);

// upload
const base = workerBase();
const token = await workerUploadToken(jobId);
const file = Bun.file("/tmp/e2e/t5.mp4");
const form = new FormData();
form.append("file", new Blob([await file.arrayBuffer()], { type: "video/mp4" }), "t5.mp4");
const up = await fetch(`${base}/v1/jobs/${jobId}/upload`, {
  method: "POST",
  headers: { "x-job-token": token },
  body: form,
});
console.log("upload:", up.status, (await up.text()).slice(0, 200));
console.log("input:", JSON.stringify(await workerInputStatus(jobId)).slice(0, 300));

// chunks GPU
const total = await planCleanerChunks(jobId, user.id);
console.log("chunks planejados:", total);
for (let i = 0; i < 40; i++) {
  const p = await pumpCleanerJob(jobId);
  console.log(i, JSON.stringify(p));
  if (p.done >= p.total && p.total > 0) break;
  if (p.failed) break;
  await new Promise((r) => setTimeout(r, 5000));
}

const { data: finalJob } = await db.from("cleaner_jobs").select("*").eq("id", jobId).single();
console.log("job final:", JSON.stringify(finalJob).slice(0, 600));
const { data: chunks } = await db.from("cleaner_chunks").select("idx,status,attempts,error").eq("job_id", jobId);
console.log("chunks:", JSON.stringify(chunks));
try {
  console.log("worker status:", JSON.stringify(await workerStatus(jobId)).slice(0, 400));
} catch (e) {
  console.log("worker status erro:", (e as Error).message);
}
console.log("JOB_ID=" + jobId);
