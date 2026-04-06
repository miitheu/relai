-- Enable pg_cron and pg_net extensions (needed for scheduled HTTP calls)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schedule daily Gmail sync at 7:00 AM UTC (9:00 AM CET)
-- Calls the gmail-sync edge function with full_rescan for each active Gmail integration
SELECT cron.schedule(
  'gmail-daily-sync',
  '0 7 * * *',
  $$
  SELECT extensions.http((
    'POST',
    current_setting('app.settings.supabase_url') || '/functions/v1/gmail-sync',
    ARRAY[
      extensions.http_header('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
      extensions.http_header('Content-Type', 'application/json')
    ],
    'application/json',
    '{"full_rescan": true}'
  )::extensions.http_request);
  $$
);
