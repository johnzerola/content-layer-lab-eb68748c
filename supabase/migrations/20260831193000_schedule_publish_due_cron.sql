-- Server-side dispatcher for scheduled social posts.
-- The job is installed only when Supabase Vault contains the environment URL
-- and the shared bearer secret. No secret value is stored in this migration.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
DECLARE
  dispatch_url text;
  cron_secret text;
  existing_job_id bigint;
BEGIN
  IF pg_catalog.to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE NOTICE 'Skipping publish-due cron: vault.decrypted_secrets is unavailable.';
    RETURN;
  END IF;

  SELECT decrypted_secret
  INTO dispatch_url
  FROM vault.decrypted_secrets
  WHERE name = 'publish_dispatch_url'
  LIMIT 1;

  SELECT decrypted_secret
  INTO cron_secret
  FROM vault.decrypted_secrets
  WHERE name = 'publish_cron_secret'
  LIMIT 1;

  IF NULLIF(pg_catalog.btrim(dispatch_url), '') IS NULL THEN
    RAISE NOTICE 'Skipping publish-due cron: Vault secret publish_dispatch_url is missing.';
    RETURN;
  END IF;

  IF pg_catalog.right(dispatch_url, 29) <> '/api/public/hooks/publish-due' THEN
    RAISE NOTICE 'Skipping publish-due cron: publish_dispatch_url must end with /api/public/hooks/publish-due.';
    RETURN;
  END IF;

  IF pg_catalog.length(COALESCE(cron_secret, '')) < 32 THEN
    RAISE NOTICE 'Skipping publish-due cron: Vault secret publish_cron_secret is missing or too short.';
    RETURN;
  END IF;

  SELECT jobid
  INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'publish-due-every-minute'
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'publish-due-every-minute',
    '* * * * *',
    $cron$
      SELECT net.http_post(
        url := (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'publish_dispatch_url'
        ),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'publish_cron_secret'
          )
        ),
        body := jsonb_build_object('triggered_at', now(), 'source', 'supabase-cron'),
        timeout_milliseconds := 55000
      ) AS request_id;
    $cron$
  );
END;
$$;
