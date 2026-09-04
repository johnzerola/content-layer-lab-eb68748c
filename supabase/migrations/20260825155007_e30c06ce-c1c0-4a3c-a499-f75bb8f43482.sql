-- 1) OAuth credentials table: keep it strictly server-only (service_role), with an
--    explicit deny-all policy so intent is recorded instead of "RLS enabled, no policy".
REVOKE ALL ON TABLE public.social_connection_credentials FROM anon, authenticated;
GRANT ALL ON TABLE public.social_connection_credentials TO service_role;

ALTER TABLE public.social_connection_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_connection_credentials FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No client access to social credentials" ON public.social_connection_credentials;
CREATE POLICY "No client access to social credentials"
  ON public.social_connection_credentials
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.social_connection_credentials IS
  'Encrypted OAuth tokens. Server-only: accessed exclusively through the service role from trusted server code. Client roles are revoked and denied by a restrictive RLS policy.';

-- 2) has_role: signed-in callers may only ask about themselves.
--    Trusted server contexts (service_role / no JWT) keep full access, and RLS
--    policies keep working because they always evaluate has_role(auth.uid(), ...).
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL
      OR current_setting('request.jwt.claim.role', true) = 'service_role'
      OR current_setting('role', true) IN ('service_role', 'postgres')
      OR _user_id = auth.uid()
    THEN EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = _role
    )
    ELSE false
  END
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

COMMENT ON FUNCTION public.has_role(uuid, app_role) IS
  'Role check used by RLS policies. Signed-in callers can only check their own roles; other users role data is never disclosed to clients.';