-- Private reusable voice references. Raw audio remains in the authenticated
-- ChatScene voice service; Postgres stores only account-scoped metadata.
CREATE TABLE IF NOT EXISTS public.voice_reference_profiles (
  id UUID NOT NULL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  duration_sec DOUBLE PRECISION NOT NULL CHECK (duration_sec BETWEEN 3 AND 30),
  authorization_version TEXT NOT NULL DEFAULT 'adult-own-or-written-1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);

ALTER TABLE public.voice_reference_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_reference_profiles FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.voice_reference_profiles FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_reference_profiles TO authenticated;
GRANT ALL ON public.voice_reference_profiles TO service_role;

CREATE POLICY "users read own voice references"
ON public.voice_reference_profiles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "users create own voice references"
ON public.voice_reference_profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own voice references"
ON public.voice_reference_profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users delete own voice references"
ON public.voice_reference_profiles FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_voice_reference_profiles_updated_at
BEFORE UPDATE ON public.voice_reference_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX voice_reference_profiles_user_created_idx
ON public.voice_reference_profiles (user_id, created_at DESC);

COMMENT ON TABLE public.voice_reference_profiles IS
  'Private metadata for reusable authorized voice references. Raw audio is never stored in Postgres.';
