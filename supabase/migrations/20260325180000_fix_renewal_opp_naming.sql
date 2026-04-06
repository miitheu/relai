-- Fix renewal opportunity naming: use "Company - Renewal - Year" instead of dataset name
-- Fixes GitHub issue #6

CREATE OR REPLACE FUNCTION create_opportunity_for_renewal()
RETURNS TRIGGER AS $$
DECLARE
  v_client_name text;
  v_dataset_name text;
  v_renewal_year text;
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

  -- Build opportunity name: "Company - Renewal - Year"
  SELECT name INTO v_client_name FROM clients WHERE id = NEW.client_id;
  SELECT name INTO v_dataset_name FROM datasets WHERE id = NEW.dataset_id;
  v_renewal_year := EXTRACT(YEAR FROM COALESCE(NEW.renewal_date, now()))::text;
  v_opp_name := COALESCE(v_client_name, 'Unknown') || ' — Renewal — ' || v_renewal_year;

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

-- Also fix existing renewal opportunities with the old naming format
UPDATE opportunities o
SET name = c.name || ' — Renewal — ' || EXTRACT(YEAR FROM COALESCE(r.renewal_date, o.created_at))::text
FROM renewals r
JOIN clients c ON c.id = r.client_id
WHERE o.renewal_id = r.id
  AND o.source = 'renewal'
  AND o.name LIKE 'Renewal:%';
