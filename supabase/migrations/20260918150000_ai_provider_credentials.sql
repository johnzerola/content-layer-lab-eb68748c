-- Server-only credentials for optional creative AI providers.
-- The application encrypts the API key before it reaches Postgres.
CREATE TABLE IF NOT EXISTS public.ai_provider_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('elevenlabs')),
  api_key_ciphertext TEXT NOT NULL,
  masked_key TEXT NOT NULL DEFAULT '',
  account_label TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

REVOKE ALL ON public.ai_provider_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_provider_credentials TO service_role;

ALTER TABLE public.ai_provider_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_provider_credentials FORCE ROW LEVEL SECURITY;

CREATE POLICY "service role manages ai provider credentials"
ON public.ai_provider_credentials FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE TRIGGER update_ai_provider_credentials_updated_at
BEFORE UPDATE ON public.ai_provider_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX ai_provider_credentials_user_idx
ON public.ai_provider_credentials (user_id, provider);

COMMENT ON TABLE public.ai_provider_credentials IS
  'Encrypted, server-only user credentials for optional AI providers. Raw API keys are never returned to clients.';
