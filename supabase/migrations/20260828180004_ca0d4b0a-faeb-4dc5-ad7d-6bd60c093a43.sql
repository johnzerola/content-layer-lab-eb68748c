ALTER TABLE public.render_items
  ADD COLUMN IF NOT EXISTS callback_seq bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metrics jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.render_batches
  ADD COLUMN IF NOT EXISTS callback_seq bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS worker_version text,
  ADD COLUMN IF NOT EXISTS metrics jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS render_items_heartbeat_idx
  ON public.render_items (status, heartbeat_at);