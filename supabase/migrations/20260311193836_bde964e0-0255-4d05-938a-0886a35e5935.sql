
-- Create external_source_mappings table for source-specific entity mappings
CREATE TABLE public.external_source_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  resolution_id UUID REFERENCES public.account_entity_resolutions(id) ON DELETE SET NULL,
  external_source_type TEXT NOT NULL,
  external_entity_name TEXT NOT NULL,
  external_identifier TEXT,
  source_url TEXT,
  confidence_score INTEGER DEFAULT 0,
  match_method TEXT,
  match_reasons JSONB DEFAULT '[]'::jsonb,
  manually_confirmed BOOLEAN DEFAULT false,
  confirmed_by UUID,
  confirmed_at TIMESTAMPTZ,
  metadata_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add unique constraint to prevent duplicate source mappings
ALTER TABLE public.external_source_mappings
  ADD CONSTRAINT unique_client_source_mapping UNIQUE (client_id, external_source_type, external_identifier);

-- Enable RLS
ALTER TABLE public.external_source_mappings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated can view external mappings" ON public.external_source_mappings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert external mappings" ON public.external_source_mappings
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update external mappings" ON public.external_source_mappings
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Admins can delete external mappings" ON public.external_source_mappings
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Add updated_at trigger
CREATE TRIGGER update_external_source_mappings_updated_at
  BEFORE UPDATE ON public.external_source_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate existing SEC data from account_entity_resolutions into external_source_mappings
INSERT INTO public.external_source_mappings (
  client_id, resolution_id, external_source_type, external_entity_name,
  external_identifier, confidence_score, match_method, manually_confirmed,
  confirmed_at, created_at
)
SELECT
  aer.client_id,
  aer.id,
  CASE
    WHEN aer.entity_type ILIKE '%hedge%' OR aer.entity_type ILIKE '%fund%' OR aer.entity_type ILIKE '%asset%'
      THEN 'sec_adviser'
    ELSE 'sec_issuer'
  END,
  aer.sec_filer_name,
  aer.sec_cik,
  aer.confidence_score,
  aer.matched_by,
  aer.manually_confirmed,
  aer.resolved_at,
  aer.created_at
FROM public.account_entity_resolutions aer
WHERE aer.sec_cik IS NOT NULL AND aer.sec_filer_name IS NOT NULL;
