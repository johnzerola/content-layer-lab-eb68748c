ALTER TABLE public.social_accounts
  ADD COLUMN IF NOT EXISTS owner_provider_id text,
  ADD COLUMN IF NOT EXISTS owner_label text;
CREATE INDEX IF NOT EXISTS social_accounts_owner_idx
  ON public.social_accounts (user_id, provider, owner_provider_id);