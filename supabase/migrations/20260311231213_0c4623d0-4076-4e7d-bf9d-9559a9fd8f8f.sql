
-- 1. Add merge tracking columns to clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS is_merged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS merged_into_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

-- 2. Create account_merge_events audit table
CREATE TABLE public.account_merge_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_account_id uuid NOT NULL REFERENCES public.clients(id),
  secondary_account_id uuid NOT NULL REFERENCES public.clients(id),
  merged_by uuid NOT NULL,
  merged_at timestamptz NOT NULL DEFAULT now(),
  merge_summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_merge_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view merge events"
  ON public.account_merge_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can insert merge events"
  ON public.account_merge_events FOR INSERT TO authenticated
  WITH CHECK (true);

-- 3. Index for fast duplicate detection
CREATE INDEX IF NOT EXISTS idx_clients_normalized_name ON public.clients (normalized_name) WHERE normalized_name IS NOT NULL AND is_merged = false;
CREATE INDEX IF NOT EXISTS idx_clients_is_merged ON public.clients (is_merged) WHERE is_merged = true;
CREATE INDEX IF NOT EXISTS idx_client_aliases_normalized ON public.client_aliases (normalized_alias);
