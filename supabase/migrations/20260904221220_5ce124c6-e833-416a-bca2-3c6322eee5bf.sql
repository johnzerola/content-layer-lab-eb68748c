ALTER TABLE public.cleaner_jobs
  DROP CONSTRAINT IF EXISTS cleaner_jobs_status_valid,
  ADD CONSTRAINT cleaner_jobs_status_valid CHECK (
    status IN (
      'queued', 'uploading', 'uploaded', 'analyzing', 'detecting', 'tracking', 'processing',
      'inpainting', 'refining', 'encoding', 'chunking', 'assembling', 'cleaning',
      'completed', 'failed', 'cancelled', 'paused'
    )
  );

ALTER TABLE public.cleaner_jobs
  DROP CONSTRAINT IF EXISTS cleaner_jobs_engine_valid,
  ADD CONSTRAINT cleaner_jobs_engine_valid CHECK (engine IN ('cpu', 'gpu'));