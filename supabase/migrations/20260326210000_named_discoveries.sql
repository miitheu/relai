-- Add name field to discovery suggestions for saved discoveries
-- Group suggestions by a named discovery run
ALTER TABLE public.discovery_suggestions ADD COLUMN IF NOT EXISTS discovery_name text;

-- Index for grouping by name + user
CREATE INDEX IF NOT EXISTS idx_discovery_suggestions_name_user
  ON public.discovery_suggestions(created_by, discovery_name) WHERE discovery_name IS NOT NULL;
