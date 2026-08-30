CREATE TABLE public.social_sync_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  social_account_id uuid NOT NULL REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'youtube',
  enabled boolean NOT NULL DEFAULT true,
  interval_minutes integer NOT NULL DEFAULT 720,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  last_status text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (social_account_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_sync_schedules TO authenticated;
GRANT ALL ON public.social_sync_schedules TO service_role;

ALTER TABLE public.social_sync_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own sync schedules" ON public.social_sync_schedules
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX social_sync_schedules_due_idx
  ON public.social_sync_schedules (next_run_at)
  WHERE enabled;

CREATE TRIGGER social_sync_schedules_updated_at
  BEFORE UPDATE ON public.social_sync_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();