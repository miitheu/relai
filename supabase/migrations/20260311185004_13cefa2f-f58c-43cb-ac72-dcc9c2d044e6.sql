
-- Entity resolution table for SEC name verification
CREATE TABLE public.account_entity_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  source_name text NOT NULL,
  normalized_name text,
  canonical_name text,
  entity_type text DEFAULT 'unknown',
  sec_filer_name text,
  sec_cik text,
  resolution_status text NOT NULL DEFAULT 'unresolved',
  confidence_score integer DEFAULT 0,
  matched_by text,
  manually_confirmed boolean DEFAULT false,
  match_candidates jsonb DEFAULT '[]'::jsonb,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

ALTER TABLE public.account_entity_resolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view entity resolutions" ON public.account_entity_resolutions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert entity resolutions" ON public.account_entity_resolutions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update entity resolutions" ON public.account_entity_resolutions FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER update_entity_resolutions_updated_at BEFORE UPDATE ON public.account_entity_resolutions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
