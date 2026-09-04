import { createClient } from "@supabase/supabase-js";
import { pumpCleanerJob } from "@/lib/cleaner-chunks.server";
const jobId = process.argv[2]!;
const db = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
for (let i = 0; i < 60; i++) {
  const p = await pumpCleanerJob(jobId);
  const { data: j } = await db.from("cleaner_jobs").select("status,stage,result_url,error").eq("id", jobId).single();
  console.log(i, JSON.stringify(p), JSON.stringify(j));
  if (j && (j as any).status !== "processing") break;
  await new Promise((r) => setTimeout(r, 5000));
}
const { data: chunks } = await db.from("cleaner_chunks").select("idx,status,attempts,residual_text,error").eq("job_id", jobId);
console.log("chunks:", JSON.stringify(chunks));
