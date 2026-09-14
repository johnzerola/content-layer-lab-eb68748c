import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914090000_audio_separation_jobs.sql"),
  "utf8",
);

describe("audio separation job persistence migration", () => {
  it("requires owned durable stems before a job can complete", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.audio_separation_jobs");
    expect(migration).toContain("status <> 'completed'");
    expect(migration).toContain("dialogue_storage_key IS NOT NULL");
    expect(migration).toContain("music_storage_key IS NOT NULL");
    expect(migration).toContain("expected_prefix text := NEW.user_id::text || '/audio-jobs/' || NEW.id::text || '/'");
  });

  it("keeps the source contract immutable and restricts rows to their owner", () => {
    expect(migration).toContain("audio separation source contract is immutable");
    expect(migration).toContain("ALTER TABLE public.audio_separation_jobs ENABLE ROW LEVEL SECURITY");
    expect(migration.match(/auth\.uid\(\) = user_id/g)).toHaveLength(4);
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE ON public.audio_separation_jobs TO authenticated");
  });
});
