-- ============================================================
-- CONTACT IMPORT & COMPANY RESOLUTION SCHEMA
-- ============================================================

-- 1. Import batch tracking table
CREATE TABLE public.contact_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  file_name text,
  total_rows integer DEFAULT 0,
  processed_rows integer DEFAULT 0,
  imported_rows integer DEFAULT 0,
  skipped_rows integer DEFAULT 0,
  status text NOT NULL DEFAULT 'pending', -- pending, processing, review, completed, failed
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  notes text
);

-- 2. Contact import staging table
CREATE TABLE public.contact_import_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.contact_import_batches(id) ON DELETE CASCADE,
  row_number integer,
  
  -- Raw imported data
  raw_name text,
  raw_company text,
  raw_organization_type text,
  raw_deals text,
  raw_contact_title text,
  raw_phone text,
  raw_email text,
  raw_people text,
  raw_source text,
  
  -- Normalized/processed data
  normalized_company_name text,
  normalized_email text,
  email_domain text,
  
  -- Company matching
  matched_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  company_match_confidence text DEFAULT 'none', -- exact, likely, ambiguous, new, none
  company_match_method text, -- name_exact, name_normalized, domain, fuzzy
  suggested_client_ids uuid[], -- array of potential matches for ambiguous
  
  -- Contact matching
  matched_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  contact_match_type text, -- email_exact, name_company, phone_company, new
  is_duplicate_contact boolean DEFAULT false,
  
  -- Validation
  validation_status text DEFAULT 'pending', -- pending, valid, invalid, warning
  validation_errors text[],
  validation_warnings text[],
  
  -- Resolution
  resolution_status text DEFAULT 'pending', -- pending, resolved, skipped, imported
  resolved_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  resolved_by uuid,
  resolved_at timestamptz,
  
  -- Import result
  imported_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  imported_at timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Client aliases for better future matching
CREATE TABLE public.client_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  alias_name text NOT NULL,
  normalized_alias text NOT NULL,
  alias_type text DEFAULT 'alternate_name', -- alternate_name, abbreviation, former_name, domain
  source text, -- manual, import, system
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, normalized_alias)
);

-- 4. Add import tracking columns to contacts
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES public.contact_import_batches(id) ON DELETE SET NULL;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS imported_at timestamptz;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS raw_import_data jsonb;

-- 5. Add normalized_name to clients for better matching
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS normalized_name text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS primary_domain text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS import_source text;

-- 6. Create indexes for efficient matching
CREATE INDEX IF NOT EXISTS idx_staging_batch ON public.contact_import_staging(batch_id);
CREATE INDEX IF NOT EXISTS idx_staging_company_normalized ON public.contact_import_staging(normalized_company_name);
CREATE INDEX IF NOT EXISTS idx_staging_email_domain ON public.contact_import_staging(email_domain);
CREATE INDEX IF NOT EXISTS idx_staging_resolution_status ON public.contact_import_staging(resolution_status);
CREATE INDEX IF NOT EXISTS idx_client_aliases_normalized ON public.client_aliases(normalized_alias);
CREATE INDEX IF NOT EXISTS idx_clients_normalized_name ON public.clients(normalized_name);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON public.contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON public.contacts(phone);

-- 7. Function to normalize company names
CREATE OR REPLACE FUNCTION public.normalize_company_name(raw_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF raw_name IS NULL THEN RETURN NULL; END IF;
  
  RETURN lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            trim(raw_name),
            '\s+', ' ', 'g'  -- collapse whitespace
          ),
          '&', 'and', 'g'  -- & to and
        ),
        '[.,''"\-]', '', 'g'  -- remove punctuation
      ),
      '\s+(inc|llc|ltd|corp|corporation|company|co|plc|lp|llp|gmbh|ag|sa|nv|bv)\.?$', '', 'gi'  -- remove suffixes
    )
  );
END;
$$;

-- 8. Trigger to auto-populate normalized_name on clients
CREATE OR REPLACE FUNCTION public.update_client_normalized_name()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.normalized_name := public.normalize_company_name(NEW.name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_normalize_name ON public.clients;
CREATE TRIGGER trg_client_normalize_name
  BEFORE INSERT OR UPDATE OF name ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_client_normalized_name();

-- Backfill existing clients
UPDATE public.clients SET normalized_name = public.normalize_company_name(name) WHERE normalized_name IS NULL;

-- 9. RLS Policies for new tables
ALTER TABLE public.contact_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_import_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_aliases ENABLE ROW LEVEL SECURITY;

-- Import batches policies
CREATE POLICY "Authenticated can view import batches" ON public.contact_import_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert import batches" ON public.contact_import_batches FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Batch creator can update" ON public.contact_import_batches FOR UPDATE TO authenticated USING (auth.uid() = created_by);

-- Staging policies
CREATE POLICY "Authenticated can view staging" ON public.contact_import_staging FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert staging" ON public.contact_import_staging FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update staging" ON public.contact_import_staging FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete staging" ON public.contact_import_staging FOR DELETE TO authenticated USING (true);

-- Aliases policies
CREATE POLICY "Authenticated can view aliases" ON public.client_aliases FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert aliases" ON public.client_aliases FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update aliases" ON public.client_aliases FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can delete aliases" ON public.client_aliases FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
