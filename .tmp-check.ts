import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const jobId = "1f30f59e-5014-429e-a967-27acaba628f9";
const { data: chunks } = await db.from("cleaner_chunks").select("*").eq("job_id", jobId);
console.log(JSON.stringify(chunks, null, 1).slice(0, 1500));
const { data: list, error } = await db.storage.from("cleaner-chunks").list(jobId);
console.log("storage:", JSON.stringify(list), error?.message);
