ALTER TABLE public.social_connection_credentials
  ADD COLUMN IF NOT EXISTS refresh_token_ciphertext text,
  ADD COLUMN IF NOT EXISTS refresh_expires_at timestamptz;