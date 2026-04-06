-- Make discovery suggestions personal and add run context
ALTER TABLE public.discovery_suggestions ADD COLUMN IF NOT EXISTS seed_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.discovery_suggestions ADD COLUMN IF NOT EXISTS run_type text CHECK (run_type IN ('lookalike', 'sector', 'combined'));
ALTER TABLE public.discovery_suggestions ADD COLUMN IF NOT EXISTS run_params jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_discovery_suggestions_created_by
  ON public.discovery_suggestions(created_by);
