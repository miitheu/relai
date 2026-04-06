DO $$ BEGIN
  ALTER TABLE public.opportunities DROP CONSTRAINT IF EXISTS opportunities_stage_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.opportunities ADD CONSTRAINT opportunities_stage_check CHECK (stage IN ('Lead', 'Initial Discussion', 'Demo Scheduled', 'Trial', 'Evaluation', 'Commercial Discussion', 'Contract Sent', 'Closed Won', 'Closed Lost', 'Inactive'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
