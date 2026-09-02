CREATE TABLE public.post_insights (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL UNIQUE REFERENCES public.scheduled_posts(id) ON DELETE CASCADE,
  impressions integer NOT NULL DEFAULT 0,
  reach integer NOT NULL DEFAULT 0,
  likes integer NOT NULL DEFAULT 0,
  comments integer NOT NULL DEFAULT 0,
  shares integer NOT NULL DEFAULT 0,
  saves integer NOT NULL DEFAULT 0,
  views integer NOT NULL DEFAULT 0,
  platform_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_insights TO authenticated;
GRANT ALL ON public.post_insights TO service_role;

ALTER TABLE public.post_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own post insights"
ON public.post_insights FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX post_insights_user_id_idx ON public.post_insights(user_id);
CREATE INDEX post_insights_post_id_idx ON public.post_insights(post_id);

CREATE TRIGGER update_post_insights_updated_at
BEFORE UPDATE ON public.post_insights
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();