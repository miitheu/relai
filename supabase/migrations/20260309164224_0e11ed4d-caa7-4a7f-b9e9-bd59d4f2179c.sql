
-- 1. Create opportunity_import_batches table
CREATE TABLE public.opportunity_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  name text NOT NULL DEFAULT '',
  file_name text,
  total_rows integer DEFAULT 0,
  processed_rows integer DEFAULT 0,
  imported_rows integer DEFAULT 0,
  skipped_rows integer DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.opportunity_import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view opp import batches" ON public.opportunity_import_batches
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert opp import batches" ON public.opportunity_import_batches
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Batch creator can update opp import batches" ON public.opportunity_import_batches
  FOR UPDATE TO authenticated USING (auth.uid() = created_by);

-- 2. Create opportunity_import_staging table
CREATE TABLE public.opportunity_import_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.opportunity_import_batches(id) ON DELETE CASCADE,
  row_number integer,
  
  -- Raw imported fields
  raw_name text,
  raw_stage text,
  raw_client_type text,
  raw_product text,
  raw_owner text,
  raw_deal_value_min text,
  raw_deal_value_max text,
  raw_source text,
  raw_contacts text,
  raw_deal_creation_date text,
  raw_expected_close_date text,
  raw_renewal_due text,
  raw_comment text,
  raw_deal_type text,
  
  -- Normalized / derived
  normalized_client_name text,
  normalized_product_name text,
  normalized_owner_name text,
  normalized_stage text,
  parsed_value_min numeric,
  parsed_value_max numeric,
  parsed_value_estimate numeric,
  parsed_deal_creation_date date,
  parsed_expected_close_date date,
  parsed_renewal_due date,
  
  -- Resolution references
  matched_client_id uuid REFERENCES public.clients(id),
  matched_dataset_id uuid REFERENCES public.datasets(id),
  matched_owner_id uuid,
  matched_contact_ids uuid[] DEFAULT '{}',
  
  -- Match metadata
  client_match_confidence text DEFAULT 'none',
  client_match_method text,
  dataset_match_confidence text DEFAULT 'none',
  owner_match_confidence text DEFAULT 'none',
  contact_match_confidence text DEFAULT 'none',
  suggested_client_ids uuid[],
  suggested_dataset_ids uuid[],
  
  -- Duplicate detection
  duplicate_status text DEFAULT 'unchecked',
  duplicate_opportunity_id uuid REFERENCES public.opportunities(id),
  
  -- Validation
  validation_status text DEFAULT 'pending',
  validation_errors text[],
  validation_warnings text[],
  
  -- Resolution
  resolution_status text DEFAULT 'pending',
  resolved_client_id uuid REFERENCES public.clients(id),
  resolved_dataset_id uuid REFERENCES public.datasets(id),
  resolved_owner_id uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  
  -- Import outcome
  imported_opportunity_id uuid REFERENCES public.opportunities(id),
  imported_at timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.opportunity_import_staging ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view opp staging" ON public.opportunity_import_staging
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert opp staging" ON public.opportunity_import_staging
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update opp staging" ON public.opportunity_import_staging
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can delete opp staging" ON public.opportunity_import_staging
  FOR DELETE TO authenticated USING (true);

-- 3. Add value_min, value_max, import fields to opportunities
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS value_min numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS value_max numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS deal_type text,
  ADD COLUMN IF NOT EXISTS source_created_date date,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES public.opportunity_import_batches(id),
  ADD COLUMN IF NOT EXISTS imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS contact_ids uuid[] DEFAULT '{}';

-- 4. Create dataset_aliases table
CREATE TABLE public.dataset_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  alias_name text NOT NULL,
  normalized_alias text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.dataset_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view dataset aliases" ON public.dataset_aliases
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert dataset aliases" ON public.dataset_aliases
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admins can delete dataset aliases" ON public.dataset_aliases
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
