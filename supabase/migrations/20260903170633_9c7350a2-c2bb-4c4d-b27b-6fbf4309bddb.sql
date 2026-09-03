ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS scheduled_timezone text,
  ADD COLUMN IF NOT EXISTS publish_meta jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.post_insights
  ADD COLUMN IF NOT EXISTS clicks integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'provider';