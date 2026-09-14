ALTER TABLE public.social_connection_credentials
  DROP CONSTRAINT IF EXISTS social_connection_credentials_token_kind_check;

ALTER TABLE public.social_connection_credentials
  ADD CONSTRAINT social_connection_credentials_token_kind_check
  CHECK (token_kind IN ('facebook_page', 'instagram_login', 'tiktok'));