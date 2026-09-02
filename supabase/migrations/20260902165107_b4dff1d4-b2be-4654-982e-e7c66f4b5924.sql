CREATE TABLE public.video_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid,
  name text NOT NULL DEFAULT 'Novo template',
  description text,
  thumbnail_url text,
  aspect_ratio text NOT NULL DEFAULT '9:16',
  canvas_width integer NOT NULL DEFAULT 1080,
  canvas_height integer NOT NULL DEFAULT 1920,
  template_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  template_version integer NOT NULL DEFAULT 1,
  visibility text NOT NULL DEFAULT 'private',
  status text NOT NULL DEFAULT 'draft',
  category text,
  tags text[] NOT NULL DEFAULT '{}',
  usage_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT video_templates_visibility_chk CHECK (visibility IN ('private','public')),
  CONSTRAINT video_templates_status_chk CHECK (status IN ('draft','published'))
);

CREATE INDEX video_templates_user_idx ON public.video_templates (user_id, updated_at DESC);
CREATE INDEX video_templates_public_idx ON public.video_templates (visibility, status, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_templates TO authenticated;
GRANT ALL ON public.video_templates TO service_role;

ALTER TABLE public.video_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own templates full access" ON public.video_templates
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "public templates readable" ON public.video_templates
  FOR SELECT TO authenticated USING (visibility = 'public' AND status = 'published');

CREATE TABLE public.template_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.video_templates(id) ON DELETE SET NULL,
  template_version integer,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id text,
  cut_id text,
  project_id text,
  label text,
  instance_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX template_instances_user_idx ON public.template_instances (user_id, created_at DESC);
CREATE INDEX template_instances_template_idx ON public.template_instances (template_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_instances TO authenticated;
GRANT ALL ON public.template_instances TO service_role;

ALTER TABLE public.template_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own instances full access" ON public.template_instances
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER video_templates_updated_at BEFORE UPDATE ON public.video_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER template_instances_updated_at BEFORE UPDATE ON public.template_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();