-- Contracts table: stores metadata about uploaded contract files
-- Actual files live in Supabase Storage "contracts" bucket (created in account_action_items migration)

CREATE TABLE IF NOT EXISTS contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint,
  mime_type text,
  uploaded_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Add opportunity_id if it doesn't exist (table may have been created in an earlier migration)
DO $$ BEGIN
  ALTER TABLE contracts ADD COLUMN opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_contracts_client ON contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_opportunity ON contracts(opportunity_id);

-- RLS
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can read contracts"
    ON contracts FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can insert contracts"
    ON contracts FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can delete contracts"
    ON contracts FOR DELETE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Storage delete policy (upload and read policies already exist from account_action_items migration)
DO $$ BEGIN
  CREATE POLICY "Authenticated users can delete contract files"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'contracts');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
