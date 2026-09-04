ALTER TABLE public.social_accounts ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS social_accounts_primary_per_platform
  ON public.social_accounts (user_id, platform)
  WHERE is_primary;