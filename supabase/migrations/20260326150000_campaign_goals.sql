-- Store campaign goals set at launch time
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS goals_json jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS launched_at timestamptz;
