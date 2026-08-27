ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'video';

ALTER TABLE public.scheduled_posts
  DROP CONSTRAINT IF EXISTS scheduled_posts_media_type_check;
ALTER TABLE public.scheduled_posts
  ADD CONSTRAINT scheduled_posts_media_type_check CHECK (media_type IN ('video', 'image'));

DROP FUNCTION IF EXISTS public.claim_due_scheduled_posts(UUID, INTEGER, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.claim_due_scheduled_posts(
  p_lock_id UUID,
  p_limit INTEGER,
  p_lock_timeout_seconds INTEGER,
  p_max_attempts INTEGER
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  account_id UUID,
  kind TEXT,
  caption TEXT,
  video_url TEXT,
  video_path TEXT,
  media_type TEXT,
  attempts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT sp.id
    FROM public.scheduled_posts sp
    WHERE sp.status IN ('agendado', 'processando')
      AND sp.attempts < p_max_attempts
      AND sp.scheduled_at <= now()
      AND (sp.next_attempt_at IS NULL OR sp.next_attempt_at <= now())
      AND (
        sp.lock_id IS NULL
        OR sp.locked_at IS NULL
        OR sp.locked_at < now() - make_interval(secs => p_lock_timeout_seconds)
      )
    ORDER BY sp.scheduled_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.scheduled_posts sp
  SET status = 'processando',
      lock_id = p_lock_id,
      locked_at = now(),
      attempts = sp.attempts + 1,
      updated_at = now()
  FROM due
  WHERE sp.id = due.id
  RETURNING sp.id, sp.user_id, sp.account_id, sp.kind, sp.caption, sp.video_url, sp.video_path, sp.media_type, sp.attempts;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_scheduled_posts(UUID, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_scheduled_posts(UUID, INTEGER, INTEGER, INTEGER) TO service_role;