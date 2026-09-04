import { jobChunkSourceUrl } from "@/lib/cleaner-gpu.server";
const jobId = "eeaecffb-6618-442c-91bd-a4e127942976";
const url = jobChunkSourceUrl(jobId, 0);
const body = { input: { source_url: url, chunk_index: 0, start: 0, end: 6, overlap: 0.6, preset: "quality", mode: "captions", masks: [{ x: 0.08, y: 0.74, w: 0.84, h: 0.16, role: "remove", enabled: true }] } };
const r = await fetch(`https://api.runpod.ai/v2/km860ju9ded2e0/runsync`, { method: "POST", headers: { authorization: `Bearer ${process.env["RUNPOD_API_KEY"]}`, "content-type": "application/json" }, body: JSON.stringify(body) });
const t = await r.text();
console.log(r.status, t.slice(0, 4000));
