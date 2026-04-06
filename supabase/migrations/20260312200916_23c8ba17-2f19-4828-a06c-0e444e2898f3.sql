-- Add campaign bridge columns to opportunities
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS campaign_target_id UUID REFERENCES public.campaign_targets(id) ON DELETE SET NULL;
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL;