-- Durable ownership and recovery metadata for Editor V2 audio separation.
CREATE TABLE IF NOT EXISTS public.audio_separation_jobs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id text NOT NULL,
  group_id text NOT NULL,
  source_asset_id text NOT NULL,
  source_revision integer NOT NULL CHECK (source_revision >= 0),
  source_fingerprint text NOT NULL,
  source_in numeric NOT NULL CHECK (source_in >= 0),
  source_out numeric NOT NULL CHECK (source_out > source_in),
  recipe_id text NOT NULL,
  recipe_revision text NOT NULL,
  status text NOT NULL DEFAULT 'pending_upload' CHECK (status IN (
    'pending_upload', 'uploaded', 'queued', 'processing', 'downloading',
    'completed', 'failed', 'cancelling', 'cancelled'
  )),
  result_revision integer NOT NULL DEFAULT 0 CHECK (result_revision >= 0),
  dialogue_storage_key text,
  music_storage_key text,
  duration numeric CHECK (duration IS NULL OR duration > 0),
  error_code text,
  error_retryable boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audio_separation_completed_outputs CHECK (
    status <> 'completed' OR (
      dialogue_storage_key IS NOT NULL
      AND music_storage_key IS NOT NULL
      AND duration IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS audio_separation_jobs_user_project_updated_idx
  ON public.audio_separation_jobs (user_id, project_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.validate_audio_separation_job_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  allowed boolean;
  expected_prefix text := NEW.user_id::text || '/audio-jobs/' || NEW.id::text || '/';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id <> OLD.user_id
      OR NEW.project_id <> OLD.project_id
      OR NEW.group_id <> OLD.group_id
      OR NEW.source_asset_id <> OLD.source_asset_id
      OR NEW.source_revision <> OLD.source_revision
      OR NEW.source_fingerprint <> OLD.source_fingerprint
      OR NEW.source_in <> OLD.source_in
      OR NEW.source_out <> OLD.source_out
      OR NEW.recipe_id <> OLD.recipe_id
      OR NEW.recipe_revision <> OLD.recipe_revision THEN
      RAISE EXCEPTION 'audio separation source contract is immutable';
    END IF;

    allowed := CASE OLD.status
      WHEN 'pending_upload' THEN NEW.status IN ('pending_upload', 'uploaded', 'failed', 'cancelling', 'cancelled')
      WHEN 'uploaded' THEN NEW.status IN ('uploaded', 'queued', 'processing', 'downloading', 'failed', 'cancelling', 'cancelled')
      WHEN 'queued' THEN NEW.status IN ('queued', 'processing', 'downloading', 'failed', 'cancelling', 'cancelled')
      WHEN 'processing' THEN NEW.status IN ('processing', 'downloading', 'completed', 'failed', 'cancelling', 'cancelled')
      WHEN 'downloading' THEN NEW.status IN ('downloading', 'completed', 'failed', 'cancelling', 'cancelled')
      WHEN 'cancelling' THEN NEW.status IN ('cancelling', 'cancelled', 'completed', 'failed')
      WHEN 'completed' THEN NEW.status = 'completed'
      WHEN 'failed' THEN NEW.status = 'failed'
      WHEN 'cancelled' THEN NEW.status = 'cancelled'
      ELSE false
    END;
    IF NOT allowed THEN
      RAISE EXCEPTION 'invalid audio separation transition: % -> %', OLD.status, NEW.status;
    END IF;
    NEW.result_revision := CASE
      WHEN NEW.status = 'completed' AND OLD.status <> 'completed' THEN OLD.result_revision + 1
      ELSE OLD.result_revision
    END;
  END IF;

  IF NEW.status = 'completed' AND (
    NEW.dialogue_storage_key NOT LIKE expected_prefix || '%'
    OR NEW.music_storage_key NOT LIKE expected_prefix || '%'
  ) THEN
    RAISE EXCEPTION 'completed audio stems must use the owned job storage prefix';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_audio_separation_job_transition ON public.audio_separation_jobs;
CREATE TRIGGER validate_audio_separation_job_transition
  BEFORE INSERT OR UPDATE ON public.audio_separation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.validate_audio_separation_job_transition();

DROP TRIGGER IF EXISTS update_audio_separation_jobs_updated_at ON public.audio_separation_jobs;
CREATE TRIGGER update_audio_separation_jobs_updated_at
  BEFORE UPDATE ON public.audio_separation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.audio_separation_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own audio separation jobs" ON public.audio_separation_jobs;
CREATE POLICY "Users can view their own audio separation jobs"
  ON public.audio_separation_jobs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own audio separation jobs" ON public.audio_separation_jobs;
CREATE POLICY "Users can create their own audio separation jobs"
  ON public.audio_separation_jobs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending_upload');

DROP POLICY IF EXISTS "Users can update their own audio separation jobs" ON public.audio_separation_jobs;
CREATE POLICY "Users can update their own audio separation jobs"
  ON public.audio_separation_jobs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.audio_separation_jobs TO authenticated;
GRANT ALL ON public.audio_separation_jobs TO service_role;
