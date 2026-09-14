type DatabaseErrorLike = {
  code?: unknown;
  message?: unknown;
};

export function isAudioSeparationJobsSchemaUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as DatabaseErrorLike;
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";
  if (code === "PGRST205" || code === "42P01") return true;
  return message.includes("audio_separation_jobs")
    && (message.includes("schema cache") || message.includes("does not exist") || message.includes("could not find"));
}
