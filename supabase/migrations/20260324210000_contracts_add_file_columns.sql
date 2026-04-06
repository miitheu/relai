-- Add file upload columns to existing contracts table
-- The original table only had contract metadata (value, dates, type, status)
-- This adds file storage support

ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS file_path TEXT;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES auth.users(id);
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_contracts_opportunity ON public.contracts(opportunity_id);
