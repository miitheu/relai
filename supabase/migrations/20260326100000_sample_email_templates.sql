-- Add dataset_ids column to email_templates for product-tagged sample emails
ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS dataset_ids jsonb DEFAULT '[]'::jsonb;

-- Add index for querying sample emails by category + active status
CREATE INDEX IF NOT EXISTS idx_email_templates_category_active ON public.email_templates (category, is_active) WHERE is_active = true;
