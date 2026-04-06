-- Set all existing Gmail-synced emails to private (they were created as public)
UPDATE public.emails
SET visibility = 'private'
WHERE sync_source = 'gmail' AND visibility = 'public';
