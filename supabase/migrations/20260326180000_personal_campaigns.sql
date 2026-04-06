-- Add visibility to campaigns: 'personal' (default for new) or 'team' (legacy)
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'personal'
  CHECK (visibility IN ('personal', 'team'));

-- Backfill existing campaigns as team (legacy)
UPDATE public.campaigns SET visibility = 'team' WHERE visibility = 'personal';
