GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_connections TO authenticated;
GRANT ALL ON public.social_connections TO service_role;
GRANT ALL ON public.social_connection_credentials TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_sync_schedules TO authenticated;
GRANT ALL ON public.social_sync_schedules TO service_role;