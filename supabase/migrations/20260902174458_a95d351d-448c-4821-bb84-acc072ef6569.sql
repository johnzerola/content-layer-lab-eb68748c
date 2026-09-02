CREATE TABLE public.video_cuts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  cut_key TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  title TEXT NOT NULL,
  caption TEXT,
  start_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
  end_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  thumbnail_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, cut_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_cuts TO authenticated;
GRANT ALL ON public.video_cuts TO service_role;

ALTER TABLE public.video_cuts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own cuts" ON public.video_cuts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX video_cuts_user_created_idx ON public.video_cuts (user_id, created_at DESC);

CREATE TRIGGER update_video_cuts_updated_at
  BEFORE UPDATE ON public.video_cuts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();