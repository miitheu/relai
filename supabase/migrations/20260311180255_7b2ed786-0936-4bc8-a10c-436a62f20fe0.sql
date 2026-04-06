
-- Campaigns table
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  campaign_type text NOT NULL DEFAULT 'outbound',
  target_product_ids uuid[] DEFAULT '{}',
  target_account_types text[] DEFAULT '{}',
  target_segments text[] DEFAULT '{}',
  target_geographies text[] DEFAULT '{}',
  include_existing_clients boolean DEFAULT true,
  include_prospects boolean DEFAULT true,
  focus text DEFAULT 'new_business',
  max_targets integer DEFAULT 50,
  scoring_weights jsonb DEFAULT '{}',
  execution_plan jsonb DEFAULT '{}',
  messaging_guidance jsonb DEFAULT '{}',
  metrics jsonb DEFAULT '{}',
  created_by uuid NOT NULL,
  owner_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view campaigns" ON public.campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert campaigns" ON public.campaigns FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Authenticated can update campaigns" ON public.campaigns FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can delete campaigns" ON public.campaigns FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Campaign targets table
CREATE TABLE public.campaign_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  prospect_name text,
  prospect_type text,
  is_existing_client boolean DEFAULT true,
  fit_score integer DEFAULT 0,
  fit_rationale jsonb DEFAULT '{}',
  recommended_approach text DEFAULT '',
  recommended_messaging text DEFAULT '',
  recommended_contacts jsonb DEFAULT '[]',
  target_personas jsonb DEFAULT '[]',
  status text NOT NULL DEFAULT 'not_started',
  outreach_status text DEFAULT 'pending',
  notes text DEFAULT '',
  owner_id uuid,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  contacted_at timestamptz,
  responded_at timestamptz,
  meeting_booked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view campaign targets" ON public.campaign_targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert campaign targets" ON public.campaign_targets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update campaign targets" ON public.campaign_targets FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can delete campaign targets" ON public.campaign_targets FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
