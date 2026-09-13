-- Compressão lz4 nos campos JSONB grandes (TOAST). Sem mudança de comportamento no app.
ALTER TABLE public.template_versions ALTER COLUMN data SET COMPRESSION lz4;
ALTER TABLE public.templates ALTER COLUMN data SET COMPRESSION lz4;
ALTER TABLE public.projects ALTER COLUMN data SET COMPRESSION lz4;
ALTER TABLE public.video_templates ALTER COLUMN template_data SET COMPRESSION lz4;
ALTER TABLE public.template_instances ALTER COLUMN instance_data SET COMPRESSION lz4;
ALTER TABLE public.batch_jobs ALTER COLUMN settings SET COMPRESSION lz4;
ALTER TABLE public.batch_job_items ALTER COLUMN payload SET COMPRESSION lz4;
ALTER TABLE public.video_transcripts ALTER COLUMN words SET COMPRESSION lz4;
ALTER TABLE public.video_transcripts ALTER COLUMN scenes SET COMPRESSION lz4;
ALTER TABLE public.video_transcripts ALTER COLUMN speakers SET COMPRESSION lz4;
ALTER TABLE public.cleaner_jobs ALTER COLUMN options SET COMPRESSION lz4;
ALTER TABLE public.cleaner_jobs ALTER COLUMN detections SET COMPRESSION lz4;
ALTER TABLE public.cleaner_jobs ALTER COLUMN masks SET COMPRESSION lz4;
ALTER TABLE public.cleaner_jobs ALTER COLUMN probe SET COMPRESSION lz4;
ALTER TABLE public.cleaner_jobs ALTER COLUMN metrics SET COMPRESSION lz4;

-- Histórico de versões passa a aceitar versões-parciais (somente as diferenças).
ALTER TABLE public.template_versions ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'full';
ALTER TABLE public.template_versions ADD COLUMN IF NOT EXISTS base_id uuid NULL REFERENCES public.template_versions(id) ON DELETE SET NULL;
ALTER TABLE public.template_versions ADD COLUMN IF NOT EXISTS patch jsonb NULL;
ALTER TABLE public.template_versions ALTER COLUMN data DROP NOT NULL;
ALTER TABLE public.template_versions ALTER COLUMN data SET DEFAULT '{}'::jsonb;
ALTER TABLE public.template_versions ALTER COLUMN patch SET COMPRESSION lz4;
CREATE INDEX IF NOT EXISTS template_versions_base_idx ON public.template_versions (base_id) WHERE format = 'diff';