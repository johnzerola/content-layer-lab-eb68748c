-- lovable-cron-fallback-reviewed: 1440 runs/day; chunks de ~15s terminam em segundos e a proxima leva so e despachada nesta checagem; cadencia maior deixaria a GPU ociosa e o job travado
select cron.schedule(
  'cleaner-chunk-tick',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--047b7fe9-fa62-47b2-afde-df74f0f42573.lovable.app/api/public/cleaner-chunk-tick',
    headers := '{"Content-Type": "application/json", "x-hook-secret": "9FqJNC5r9WNVt4qFA9vmozZYho5dxO4C0WN0mfBbI8yCeP"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);