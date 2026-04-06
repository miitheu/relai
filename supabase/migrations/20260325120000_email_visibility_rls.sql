-- Create a secure view that enforces email visibility server-side
-- Private emails: hide body_text, body_html for non-owners
-- Summary-only emails: show ai_summary instead of body for non-owners

CREATE OR REPLACE VIEW public.emails_visible AS
SELECT
  id, client_id, contact_id, opportunity_id, dataset_id,
  subject, email_date, created_by, created_at,
  gmail_message_id, gmail_thread_id, sync_source,
  from_address, to_addresses, direction, visibility,
  ai_summary, ai_next_action,
  -- Conditionally hide body based on visibility
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
    WHEN visibility = 'private' AND created_by != auth.uid() THEN '[Private email]'
    WHEN visibility = 'summary_only' AND created_by != auth.uid() THEN COALESCE(ai_summary, summary)
    ELSE summary
  END AS summary
FROM public.emails;

-- Grant access to the view
GRANT SELECT ON public.emails_visible TO authenticated;
