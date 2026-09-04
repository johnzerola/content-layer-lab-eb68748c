CREATE TABLE public.render_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  tool TEXT NOT NULL DEFAULT 'lote',
  label TEXT,
  preset JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued',
  total INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.render_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES public.render_batches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_url TEXT,
  overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued',
  progress REAL NOT NULL DEFAULT 0,
  stage TEXT,
  result_path TEXT,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX render_items_batch_idx ON public.render_items(batch_id);
CREATE INDEX render_batches_user_idx ON public.render_batches(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.render_batches TO authenticated;
GRANT ALL ON public.render_batches TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.render_items TO authenticated;
GRANT ALL ON public.render_items TO service_role;

ALTER TABLE public.render_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.render_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own render batches" ON public.render_batches FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own render items" ON public.render_items FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_render_batches_updated_at BEFORE UPDATE ON public.render_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_render_items_updated_at BEFORE UPDATE ON public.render_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();