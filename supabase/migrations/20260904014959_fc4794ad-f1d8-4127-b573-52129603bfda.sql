-- CleanerIA v3: orquestração por chunks (GPU sob demanda)

ALTER TABLE public.cleaner_jobs
  ADD COLUMN IF NOT EXISTS engine text NOT NULL DEFAULT 'cpu',
  ADD COLUMN IF NOT EXISTS chunks_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chunks_done integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paused_reason text,
  ADD COLUMN IF NOT EXISTS lease_until timestamptz;

CREATE TABLE IF NOT EXISTS public.cleaner_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.cleaner_jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idx integer NOT NULL,
  start_seconds numeric NOT NULL,
  end_seconds numeric NOT NULL,
  overlap_seconds numeric NOT NULL DEFAULT 0.5,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  provider_job_id text,
  output_url text,
  residual_text numeric,
  cost_seconds numeric,
  error text,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, idx)
);

CREATE INDEX IF NOT EXISTS cleaner_chunks_job_status_idx ON public.cleaner_chunks (job_id, status);
CREATE INDEX IF NOT EXISTS cleaner_chunks_pending_idx ON public.cleaner_chunks (status, lease_until);

GRANT SELECT ON public.cleaner_chunks TO authenticated;
GRANT ALL ON public.cleaner_chunks TO service_role;

ALTER TABLE public.cleaner_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own cleaner chunks"
  ON public.cleaner_chunks FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_cleaner_chunks_updated_at
  BEFORE UPDATE ON public.cleaner_chunks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();