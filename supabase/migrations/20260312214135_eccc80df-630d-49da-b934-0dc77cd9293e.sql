-- Add 'Merged' to the relationship_status check constraint
DO $$ BEGIN
  ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_relationship_status_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.clients ADD CONSTRAINT clients_relationship_status_check
    CHECK (relationship_status = ANY (ARRAY['Prospect', 'Active Client', 'Dormant', 'Strategic', 'Merged']));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Now mark all secondary accounts from merge events as merged
UPDATE public.clients
SET is_merged = true,
    merged_into_client_id = ame.primary_account_id,
    relationship_status = 'Merged'
FROM public.account_merge_events ame
WHERE clients.id = ame.secondary_account_id
  AND clients.is_merged = false;
