-- Cache live Insight Hub stats on datasets for AI draft consumption
ALTER TABLE public.datasets ADD COLUMN IF NOT EXISTS live_stats_json jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.datasets ADD COLUMN IF NOT EXISTS stats_updated_at timestamptz;
