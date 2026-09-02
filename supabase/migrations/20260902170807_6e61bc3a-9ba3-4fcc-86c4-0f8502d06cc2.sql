-- 1) TRANSCRIÇÕES
CREATE TABLE public.video_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  video_id text NOT NULL,
  language text NOT NULL DEFAULT 'pt-BR',
  status text NOT NULL DEFAULT 'ready',
  text text NOT NULL DEFAULT '',
  duration numeric NOT NULL DEFAULT 0,
  words jsonb NOT NULL DEFAULT '[]'::jsonb,
  scenes jsonb NOT NULL DEFAULT '[]'::jsonb,
  speakers jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, video_id, language)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_transcripts TO authenticated;
GRANT ALL ON public.video_transcripts TO service_role;
ALTER TABLE public.video_transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own transcripts" ON public.video_transcripts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER video_transcripts_touch BEFORE UPDATE ON public.video_transcripts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX video_transcripts_user_video_idx ON public.video_transcripts (user_id, video_id);

-- 2) BATCH JOBS
CREATE TABLE public.batch_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid,
  type text NOT NULL DEFAULT 'template_apply',
  status text NOT NULL DEFAULT 'queued',
  template_id uuid REFERENCES public.video_templates(id) ON DELETE SET NULL,
  total_items integer NOT NULL DEFAULT 0,
  processed_items integer NOT NULL DEFAULT 0,
  successful_items integer NOT NULL DEFAULT 0,
  failed_items integer NOT NULL DEFAULT 0,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  paused_reason text,
  lock_id uuid,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batch_jobs TO authenticated;
GRANT ALL ON public.batch_jobs TO service_role;
ALTER TABLE public.batch_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own batch jobs" ON public.batch_jobs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER batch_jobs_touch BEFORE UPDATE ON public.batch_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX batch_jobs_user_status_idx ON public.batch_jobs (user_id, status, created_at DESC);

-- 3) RENDER JOBS
CREATE TABLE public.render_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  video_id text,
  template_instance_id uuid REFERENCES public.template_instances(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued',
  progress real NOT NULL DEFAULT 0,
  width integer NOT NULL DEFAULT 1080,
  height integer NOT NULL DEFAULT 1920,
  fps integer NOT NULL DEFAULT 30,
  format text NOT NULL DEFAULT 'mp4',
  output_url text,
  output_path text,
  attempts integer NOT NULL DEFAULT 0,
  idempotency_key text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  UNIQUE (user_id, idempotency_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.render_jobs TO authenticated;
GRANT ALL ON public.render_jobs TO service_role;
ALTER TABLE public.render_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own render jobs" ON public.render_jobs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER render_jobs_touch BEFORE UPDATE ON public.render_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX render_jobs_user_status_idx ON public.render_jobs (user_id, status, created_at DESC);

-- 4) BATCH ITEMS
CREATE TABLE public.batch_job_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_job_id uuid NOT NULL REFERENCES public.batch_jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id text,
  cut_id text,
  label text,
  status text NOT NULL DEFAULT 'queued',
  template_instance_id uuid REFERENCES public.template_instances(id) ON DELETE SET NULL,
  render_job_id uuid REFERENCES public.render_jobs(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  idempotency_key text NOT NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_job_id, idempotency_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batch_job_items TO authenticated;
GRANT ALL ON public.batch_job_items TO service_role;
ALTER TABLE public.batch_job_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own batch items" ON public.batch_job_items FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER batch_job_items_touch BEFORE UPDATE ON public.batch_job_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX batch_job_items_job_status_idx ON public.batch_job_items (batch_job_id, status);