create index if not exists projects_user_mode_updated_idx on public.projects (user_id, mode, updated_at desc);
create index if not exists video_transcripts_user_lang_video_idx on public.video_transcripts (user_id, language, video_id);
create index if not exists batch_job_items_job_created_idx on public.batch_job_items (batch_job_id, created_at desc);
create index if not exists cleaner_jobs_user_status_created_idx on public.cleaner_jobs (user_id, status, created_at desc);
drop index if exists public.versions_template_idx;