CREATE TABLE public.manual_social_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('youtube','instagram','tiktok','facebook')),
  label TEXT NOT NULL DEFAULT '',
  handle TEXT NOT NULL DEFAULT '',
  access_token_ciphertext TEXT NOT NULL,
  refresh_token_ciphertext TEXT,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, handle)
);

GRANT ALL ON public.manual_social_credentials TO service_role;

ALTER TABLE public.manual_social_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages manual credentials"
ON public.manual_social_credentials FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE TRIGGER update_manual_social_credentials_updated_at
BEFORE UPDATE ON public.manual_social_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX manual_social_credentials_user_idx ON public.manual_social_credentials (user_id, platform);