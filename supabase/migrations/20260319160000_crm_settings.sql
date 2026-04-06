-- CRM Settings table for storing configuration values
CREATE TABLE IF NOT EXISTS crm_settings (
  key text PRIMARY KEY,
  category text NOT NULL DEFAULT 'config',
  value jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE crm_settings ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read settings
DO $$ BEGIN
  CREATE POLICY "Authenticated users can read settings" ON crm_settings FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Only admins can modify settings
DO $$ BEGIN
  CREATE POLICY "Admins can manage settings" ON crm_settings FOR ALL TO authenticated
    USING (has_role(auth.uid(), 'admin'::app_role))
    WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Index for category lookups
CREATE INDEX IF NOT EXISTS idx_crm_settings_category ON crm_settings(category);
