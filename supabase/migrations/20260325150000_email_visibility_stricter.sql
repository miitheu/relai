-- Update the visibility view to hide more fields for private emails
-- Non-owners of private emails see only: client_id, contact_id, email_date, direction, created_by
-- This lets other users see "X emails exchanged, last on Y" without content

DROP VIEW IF EXISTS public.emails_visible;
CREATE VIEW public.emails_visible AS
SELECT
  id, client_id, contact_id, opportunity_id, dataset_id,
  email_date, created_by, created_at,
  gmail_message_id, gmail_thread_id, sync_source,
  direction, visibility,
  -- Hide subject for private emails from non-owners
  CASE
    WHEN visibility = 'private' AND created_by != auth.uid() THEN NULL
    ELSE subject
  END AS subject,
  -- Hide addresses for private emails from non-owners
  CASE
    WHEN visibility = 'private' AND created_by != auth.uid() THEN NULL
    ELSE from_address
  END AS from_address,
  CASE
    WHEN visibility = 'private' AND created_by != auth.uid() THEN NULL
    ELSE to_addresses
  END AS to_addresses,
  -- AI fields visible to all (they don't contain email content)
  ai_summary, ai_next_action,
  -- Body fields
  CASE
    WHEN visibility = 'private' AND created_by != auth.uid() THEN NULL
    WHEN visibility = 'summary_only' AND created_by != auth.uid() THEN NULL
    ELSE body_text
  END AS body_text,
  CASE
    WHEN visibility = 'private' AND created_by != auth.uid() THEN NULL
    WHEN visibility = 'summary_only' AND created_by != auth.uid() THEN NULL
    ELSE body_html
  END AS body_html,
  CASE
    WHEN visibility = 'private' AND created_by != auth.uid() THEN NULL
    WHEN visibility = 'summary_only' AND created_by != auth.uid() THEN COALESCE(ai_summary, summary)
    ELSE summary
  END AS summary
FROM public.emails;

GRANT SELECT ON public.emails_visible TO authenticated;
