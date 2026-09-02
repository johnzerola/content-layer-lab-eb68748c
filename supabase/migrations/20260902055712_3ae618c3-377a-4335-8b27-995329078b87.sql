DO $$
DECLARE j bigint;
BEGIN
  SELECT jobid INTO j FROM cron.job WHERE jobname = 'publish-due-posts' LIMIT 1;
  IF j IS NOT NULL THEN
    PERFORM cron.alter_job(j, schedule => '* * * * *');
  END IF;
END;
$$;