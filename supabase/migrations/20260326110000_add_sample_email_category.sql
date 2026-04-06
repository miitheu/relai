-- Add sample_email to the category check constraint on email_templates
ALTER TABLE public.email_templates DROP CONSTRAINT IF EXISTS email_templates_category_check;
ALTER TABLE public.email_templates ADD CONSTRAINT email_templates_category_check
  CHECK (category IN ('outreach', 'follow_up', 'renewal', 'onboarding', 'support', 'marketing', 'internal', 'sample_email'));
