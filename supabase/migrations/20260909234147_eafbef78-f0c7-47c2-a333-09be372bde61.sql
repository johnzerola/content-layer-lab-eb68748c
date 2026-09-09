CREATE INDEX IF NOT EXISTS template_versions_template_created_idx
  ON public.template_versions (template_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.prune_template_versions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.template_versions tv
  WHERE tv.template_id = NEW.template_id
    AND tv.id IN (
      SELECT id FROM public.template_versions
      WHERE template_id = NEW.template_id
      ORDER BY created_at DESC
      OFFSET 20
    );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS template_versions_prune ON public.template_versions;
CREATE TRIGGER template_versions_prune
AFTER INSERT ON public.template_versions
FOR EACH ROW EXECUTE FUNCTION public.prune_template_versions();