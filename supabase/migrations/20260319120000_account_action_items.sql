-- Account action items: persistent reminders for Closed Won (upload contract) and Closed Lost (document loss reason)

CREATE TABLE IF NOT EXISTS account_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
  action_type text NOT NULL CHECK (action_type IN ('upload_contract', 'document_loss_reason')),
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'dismissed')),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  resolution_note text,
  file_url text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_action_items_client ON account_action_items(client_id) WHERE status = 'pending';
CREATE INDEX idx_action_items_opp ON account_action_items(opportunity_id);

-- RLS
ALTER TABLE account_action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read action items"
  ON account_action_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert action items"
  ON account_action_items FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update action items"
  ON account_action_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Trigger: auto-create action items when opportunity closes
CREATE OR REPLACE FUNCTION create_action_item_on_close()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stage = 'Closed Won' AND (OLD.stage IS NULL OR OLD.stage != 'Closed Won') THEN
    INSERT INTO account_action_items (client_id, opportunity_id, action_type, title, description)
    VALUES (
      NEW.client_id, NEW.id, 'upload_contract',
      'Upload contract for ' || NEW.name,
      'This deal was marked Closed Won. Please upload the signed contract.'
    );
  ELSIF NEW.stage = 'Closed Lost' AND (OLD.stage IS NULL OR OLD.stage != 'Closed Lost') THEN
    INSERT INTO account_action_items (client_id, opportunity_id, action_type, title, description)
    VALUES (
      NEW.client_id, NEW.id, 'document_loss_reason',
      'Document loss reason for ' || NEW.name,
      'This deal was marked Closed Lost. Please describe what went wrong.'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_opportunity_close_action
  AFTER INSERT OR UPDATE OF stage ON opportunities
  FOR EACH ROW EXECUTE FUNCTION create_action_item_on_close();

-- Storage bucket for contract uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('contracts', 'contracts', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated users can upload/read contracts
CREATE POLICY "Authenticated users can upload contracts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contracts');

CREATE POLICY "Authenticated users can read contracts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'contracts');

-- Backfill: create action items for existing Closed Won/Lost opportunities that don't have them
INSERT INTO account_action_items (client_id, opportunity_id, action_type, title, description)
SELECT o.client_id, o.id, 'upload_contract',
  'Upload contract for ' || o.name,
  'This deal was marked Closed Won. Please upload the signed contract.'
FROM opportunities o
WHERE o.stage = 'Closed Won'
  AND NOT EXISTS (
    SELECT 1 FROM account_action_items ai
    WHERE ai.opportunity_id = o.id AND ai.action_type = 'upload_contract'
  );

INSERT INTO account_action_items (client_id, opportunity_id, action_type, title, description)
SELECT o.client_id, o.id, 'document_loss_reason',
  'Document loss reason for ' || o.name,
  'This deal was marked Closed Lost. Please describe what went wrong.'
FROM opportunities o
WHERE o.stage = 'Closed Lost'
  AND NOT EXISTS (
    SELECT 1 FROM account_action_items ai
    WHERE ai.opportunity_id = o.id AND ai.action_type = 'document_loss_reason'
  );
