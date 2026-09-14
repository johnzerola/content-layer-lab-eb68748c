import { describe, expect, it } from "vitest";
import { isAudioSeparationJobsSchemaUnavailable } from "@/lib/audio-job-errors";

describe("audio separation persistence availability", () => {
  it("recognizes only missing-schema errors as a temporary compatibility case", () => {
    expect(isAudioSeparationJobsSchemaUnavailable({ code: "PGRST205", message: "table missing" })).toBe(true);
    expect(isAudioSeparationJobsSchemaUnavailable({ code: "42P01", message: "relation missing" })).toBe(true);
    expect(isAudioSeparationJobsSchemaUnavailable({ message: "Could not find public.audio_separation_jobs in the schema cache" })).toBe(true);
    expect(isAudioSeparationJobsSchemaUnavailable({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isAudioSeparationJobsSchemaUnavailable(null)).toBe(false);
  });
});
