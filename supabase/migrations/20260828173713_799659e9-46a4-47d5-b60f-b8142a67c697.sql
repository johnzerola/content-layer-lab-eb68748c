CREATE TABLE public.data_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_type text NOT NULL DEFAULT 'meta_data' CHECK (request_type IN ('meta_data', 'social_connections', 'full_account')),
  platforms text[] NOT NULL DEFAULT ARRAY['facebook', 'instagram']::text[],
  reason text CHECK (reason IS NULL OR char_length(reason) <= 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
  confirmation_code text NOT NULL UNIQUE DEFAULT ('DEL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.data_deletion_requests TO authenticated;
GRANT ALL ON public.data_deletion_requests TO service_role;

ALTER TABLE public.data_deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own deletion requests"
ON public.data_deletion_requests
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own deletion requests"
ON public.data_deletion_requests
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND status = 'pending' AND completed_at IS NULL);

CREATE INDEX data_deletion_requests_user_requested_idx
ON public.data_deletion_requests (user_id, requested_at DESC);

CREATE TRIGGER data_deletion_requests_touch
BEFORE UPDATE ON public.data_deletion_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();