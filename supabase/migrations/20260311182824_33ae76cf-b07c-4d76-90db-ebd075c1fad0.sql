DO $$ BEGIN
  ALTER TABLE public.campaign_targets DROP CONSTRAINT IF EXISTS campaign_targets_campaign_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.campaign_targets ADD CONSTRAINT campaign_targets_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE POLICY "Creator can delete own campaigns" ON public.campaigns FOR DELETE TO authenticated USING (auth.uid() = created_by);
