ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS video_id text,
  ADD COLUMN IF NOT EXISTS media_duration numeric;

UPDATE public.projects
SET video_id = NULLIF(data->>'videoId', ''),
    media_duration = CASE
      WHEN jsonb_typeof(data->'media'->'duration') = 'number'
        THEN (data->'media'->>'duration')::numeric
      ELSE NULL
    END
WHERE mode = 'video-editor'
  AND (video_id IS NULL OR media_duration IS NULL);

CREATE OR REPLACE FUNCTION public.sync_project_media_summary()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.mode = 'video-editor' THEN
    NEW.video_id := NULLIF(NEW.data->>'videoId', '');
    NEW.media_duration := CASE
      WHEN jsonb_typeof(NEW.data->'media'->'duration') = 'number'
        THEN (NEW.data->'media'->>'duration')::numeric
      ELSE NULL
    END;
  ELSE
    NEW.video_id := NULL;
    NEW.media_duration := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_media_summary ON public.projects;
CREATE TRIGGER projects_media_summary
BEFORE INSERT OR UPDATE OF data, mode ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.sync_project_media_summary();