-- Add owner to renewals + auto-create opportunity at Commercial Discussion stage

-- 1. Add owner_id to renewals
ALTER TABLE renewals ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_renewals_owner ON renewals(owner_id) WHERE owner_id IS NOT NULL;

-- 2. Add renewal_id FK to opportunities so we can link them back
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS renewal_id uuid REFERENCES renewals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_renewal ON opportunities(renewal_id) WHERE renewal_id IS NOT NULL;

-- 3. Trigger: when a renewal is created or gets an owner, auto-create a linked opportunity
--    at "Commercial Discussion" stage assigned to the same owner.
--    If the renewal already has a linked opportunity, skip.
CREATE OR REPLACE FUNCTION create_opportunity_for_renewal()
RETURNS TRIGGER AS $$
DECLARE
  v_client_name text;
  v_dataset_name text;
  v_opp_name text;
  v_existing_opp_id uuid;
BEGIN
  -- Only proceed if renewal has an owner
  IF NEW.owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if renewal is already closed
  IF NEW.status IN ('Renewed', 'Lost') THEN
    RETURN NEW;
  END IF;

  -- Check if an opportunity already exists for this renewal
  SELECT id INTO v_existing_opp_id
  FROM opportunities
  WHERE renewal_id = NEW.id
  LIMIT 1;

  IF v_existing_opp_id IS NOT NULL THEN
    -- Update the existing opportunity's owner to match renewal owner
    UPDATE opportunities
    SET owner_id = NEW.owner_id, updated_at = now()
    WHERE id = v_existing_opp_id AND owner_id IS DISTINCT FROM NEW.owner_id;
    RETURN NEW;
  END IF;

  -- Build opportunity name
  SELECT name INTO v_client_name FROM clients WHERE id = NEW.client_id;
  SELECT name INTO v_dataset_name FROM datasets WHERE id = NEW.dataset_id;
  v_opp_name := 'Renewal: ' || COALESCE(v_client_name, 'Unknown') || ' — ' || COALESCE(v_dataset_name, 'Product');

  -- Create the opportunity
  INSERT INTO opportunities (
    name, client_id, dataset_id, stage, value, value_min, value_max,
    expected_close, probability, owner_id, source, renewal_id, created_by
  ) VALUES (
    v_opp_name,
    NEW.client_id,
    NEW.dataset_id,
    'Commercial Discussion',
    COALESCE(NEW.value, 0),
    COALESCE(NEW.value, 0),
    COALESCE(NEW.value, 0),
    NEW.renewal_date,
    COALESCE(NEW.probability, 50),
    NEW.owner_id,
    'renewal',
    NEW.id,
    NEW.owner_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_renewal_create_opportunity
  AFTER INSERT OR UPDATE OF owner_id ON renewals
  FOR EACH ROW EXECUTE FUNCTION create_opportunity_for_renewal();

-- 4. Sync: when renewal status changes to Renewed → close opportunity as Won
--         when renewal status changes to Lost → close opportunity as Lost
CREATE OR REPLACE FUNCTION sync_renewal_status_to_opportunity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'Renewed' AND (OLD.status IS NULL OR OLD.status != 'Renewed') THEN
    UPDATE opportunities
    SET stage = 'Closed Won', updated_at = now(), stage_entered_at = now()
    WHERE renewal_id = NEW.id AND stage NOT IN ('Closed Won', 'Closed Lost');
  ELSIF NEW.status = 'Lost' AND (OLD.status IS NULL OR OLD.status != 'Lost') THEN
    UPDATE opportunities
    SET stage = 'Closed Lost', updated_at = now(), stage_entered_at = now()
    WHERE renewal_id = NEW.id AND stage NOT IN ('Closed Won', 'Closed Lost');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_renewal_sync_status
  AFTER UPDATE OF status ON renewals
  FOR EACH ROW EXECUTE FUNCTION sync_renewal_status_to_opportunity();

-- 5. Backfill: assign owner_id from created_by where missing
UPDATE renewals SET owner_id = created_by WHERE owner_id IS NULL AND created_by IS NOT NULL;
