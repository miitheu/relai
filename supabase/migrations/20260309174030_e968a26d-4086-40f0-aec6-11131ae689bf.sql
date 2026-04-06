
-- Drop and re-add FK constraints with CASCADE for tables referencing opportunities
-- Use DO blocks to handle cases where constraint names differ

DO $$ BEGIN
  ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_opportunity_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
ALTER TABLE public.activities ADD CONSTRAINT activities_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE NOT VALID;

-- deliveries table has no opportunity_id column, skipping

DO $$ BEGIN
  ALTER TABLE public.emails DROP CONSTRAINT IF EXISTS emails_opportunity_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
ALTER TABLE public.emails ADD CONSTRAINT emails_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE NOT VALID;

DO $$ BEGIN
  ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_opportunity_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
ALTER TABLE public.meetings ADD CONSTRAINT meetings_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE NOT VALID;

DO $$ BEGIN
  ALTER TABLE public.notes DROP CONSTRAINT IF EXISTS notes_opportunity_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
ALTER TABLE public.notes ADD CONSTRAINT notes_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE NOT VALID;

DO $$ BEGIN
  ALTER TABLE public.opportunity_stage_history DROP CONSTRAINT IF EXISTS opportunity_stage_history_opportunity_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
ALTER TABLE public.opportunity_stage_history ADD CONSTRAINT opportunity_stage_history_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE NOT VALID;

DO $$ BEGIN
  ALTER TABLE public.opportunity_import_staging DROP CONSTRAINT IF EXISTS opportunity_import_staging_duplicate_opportunity_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.opportunity_import_staging ADD CONSTRAINT opportunity_import_staging_duplicate_opportunity_id_fkey FOREIGN KEY (duplicate_opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.opportunity_import_staging DROP CONSTRAINT IF EXISTS opportunity_import_staging_imported_opportunity_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.opportunity_import_staging ADD CONSTRAINT opportunity_import_staging_imported_opportunity_id_fkey FOREIGN KEY (imported_opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
