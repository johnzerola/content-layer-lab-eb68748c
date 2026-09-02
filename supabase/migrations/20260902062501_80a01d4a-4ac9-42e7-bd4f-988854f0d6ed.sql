ALTER TABLE public.social_connection_credentials ADD COLUMN IF NOT EXISTS token_kind text NOT NULL DEFAULT 'facebook_page';
ALTER TABLE public.social_connection_credentials DROP CONSTRAINT IF EXISTS social_connection_credentials_token_kind_check;
ALTER TABLE public.social_connection_credentials ADD CONSTRAINT social_connection_credentials_token_kind_check CHECK (token_kind IN ('facebook_page', 'instagram_login'));

CREATE OR REPLACE FUNCTION public.link_meta_oauth_account(
  p_user_id uuid,
  p_username text,
  p_provider_account_id text,
  p_access_token_ciphertext text,
  p_expires_at timestamptz
)
RETURNS TABLE (
  id uuid,
  platform text,
  username text,
  display_name text,
  avatar_url text,
  provider text,
  provider_account_id text,
  status text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_column
DECLARE
  v_account public.social_accounts%ROWTYPE;
  v_connection_id uuid;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('meta:' || p_provider_account_id, 0));
  IF EXISTS (SELECT 1 FROM public.social_connections AS sc WHERE sc.provider = 'meta' AND sc.provider_account_id = p_provider_account_id AND sc.user_id <> p_user_id) THEN
    RAISE EXCEPTION 'account ownership mismatch';
  END IF;
  SELECT sa.* INTO v_account FROM public.social_accounts AS sa JOIN public.social_connections AS sc ON sc.social_account_id = sa.id WHERE sa.user_id = p_user_id AND sc.provider = 'meta' AND sc.provider_account_id = p_provider_account_id FOR UPDATE OF sa;
  IF v_account.id IS NULL THEN
    INSERT INTO public.social_accounts AS target_account (user_id, platform, username, provider, provider_account_id, status)
    VALUES (p_user_id, 'instagram', p_username, 'meta', p_provider_account_id, 'conectado')
    ON CONFLICT (user_id, platform, username) DO UPDATE
    SET provider = 'meta', provider_account_id = EXCLUDED.provider_account_id, status = 'conectado', updated_at = pg_catalog.now()
    WHERE target_account.provider IN ('pending', 'meta') AND (target_account.provider_account_id IS NULL OR target_account.provider_account_id = EXCLUDED.provider_account_id)
    RETURNING target_account.* INTO v_account;
  ELSE
    UPDATE public.social_accounts AS sa SET username = p_username, provider = 'meta', provider_account_id = p_provider_account_id, status = 'conectado', updated_at = pg_catalog.now()
    WHERE sa.id = v_account.id RETURNING sa.* INTO v_account;
  END IF;
  IF v_account.id IS NULL OR v_account.user_id <> p_user_id THEN
    RAISE EXCEPTION 'provider conflict';
  END IF;
  INSERT INTO public.social_connections AS target (user_id, social_account_id, provider, provider_account_id, status, expires_at)
  VALUES (p_user_id, v_account.id, 'meta', p_provider_account_id, 'conectado', p_expires_at)
  ON CONFLICT (social_account_id) DO UPDATE
  SET provider = EXCLUDED.provider, provider_account_id = EXCLUDED.provider_account_id, status = EXCLUDED.status, expires_at = EXCLUDED.expires_at, updated_at = pg_catalog.now()
  WHERE target.user_id = EXCLUDED.user_id AND target.provider IN ('pending', 'meta') AND (target.provider_account_id IS NULL OR target.provider_account_id = EXCLUDED.provider_account_id)
  RETURNING target.id INTO v_connection_id;
  IF v_connection_id IS NULL THEN
    RAISE EXCEPTION 'provider conflict';
  END IF;
  INSERT INTO public.social_connection_credentials AS credential (connection_id, access_token_ciphertext, expires_at, token_kind)
  VALUES (v_connection_id, p_access_token_ciphertext, p_expires_at, 'instagram_login')
  ON CONFLICT (connection_id) DO UPDATE
  SET access_token_ciphertext = EXCLUDED.access_token_ciphertext, expires_at = EXCLUDED.expires_at, token_kind = EXCLUDED.token_kind, updated_at = pg_catalog.now();
  RETURN QUERY SELECT sa.id, sa.platform, sa.username, sa.display_name, sa.avatar_url, sa.provider, sa.provider_account_id, sa.status, sa.created_at FROM public.social_accounts AS sa WHERE sa.id = v_account.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.link_meta_oauth_account(uuid, text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_meta_oauth_account(uuid, text, text, text, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.link_meta_oauth_account(uuid, text, text, text, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.link_meta_oauth_account(uuid, text, text, text, timestamptz) TO authenticated;