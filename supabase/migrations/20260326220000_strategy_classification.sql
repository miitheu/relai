-- Add strategy classification to discovery suggestions
ALTER TABLE public.discovery_suggestions ADD COLUMN IF NOT EXISTS strategy_classification text;
ALTER TABLE public.discovery_suggestions ADD COLUMN IF NOT EXISTS strategy_detail text;
