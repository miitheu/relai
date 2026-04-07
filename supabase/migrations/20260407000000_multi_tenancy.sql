-- ===========================================
-- Relai CRM — Multi-Tenancy Migration
-- ===========================================
-- Adds organization-based data isolation.
-- Every data table gets an org_id column.
-- RLS policies enforce org-level access.
-- A trigger auto-fills org_id from the current user's profile.

-- -----------------------------------------------
-- 1. Organizations table
-- -----------------------------------------------

CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------
-- 2. Add org_id to profiles
-- -----------------------------------------------

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id);

-- -----------------------------------------------
-- 3. Helper: get org_id for current user
-- -----------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT org_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- -----------------------------------------------
-- 4. Trigger: auto-set org_id on INSERT
-- -----------------------------------------------

CREATE OR REPLACE FUNCTION public.set_org_id_from_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := public.get_user_org_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

-- -----------------------------------------------
-- 5. Add org_id to ALL data tables
-- -----------------------------------------------

DO $$
DECLARE
  tbl TEXT;
  tables_to_update TEXT[] := ARRAY[
    'account_action_items',
    'account_entity_resolutions',
    'account_intelligence_signals',
    'account_intelligence_sources',
    'account_intelligence_summaries',
    'account_merge_events',
    'action_dismissals',
    'activities',
    'admin_audit_log',
    'ai_usage_log',
    'approval_processes',
    'approval_requests',
    'approval_steps',
    'campaign_targets',
    'campaigns',
    'client_aliases',
    'client_provenance',
    'clients',
    'commission_ledger',
    'commission_plans',
    'contact_import_batches',
    'contact_import_staging',
    'contacts',
    'contract_amendments',
    'contract_line_items',
    'contracts',
    'crm_settings',
    'custom_field_definitions',
    'custom_fields',
    'customer_health_scores',
    'dataset_aliases',
    'datasets',
    'deliveries',
    'discovery_suggestions',
    'drive_links',
    'email_templates',
    'emails',
    'embeddings_store',
    'enrichment_results',
    'etf_constituent_snapshots',
    'external_source_mappings',
    'forecast_categories',
    'forecast_snapshots',
    'forecasts',
    'fund_effective_exposure',
    'fund_filings',
    'fund_holdings_snapshot',
    'fund_intelligence_results',
    'fund_intelligence_runs',
    'fund_reported_holdings',
    'integration_configs',
    'intelligence_run_steps',
    'invoices',
    'meetings',
    'notes',
    'notification_preferences',
    'notifications',
    'opportunities',
    'opportunity_import_batches',
    'opportunity_import_staging',
    'opportunity_products',
    'opportunity_stage_history',
    'pricing_tiers',
    'product_fit_analyses',
    'quota_attainment',
    'quotas',
    'renewals',
    'research_signals',
    'security_master',
    'sync_log',
    'tasks',
    'territories',
    'territory_assignments',
    'workflow_actions',
    'workflow_execution_log',
    'workflow_rules'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_to_update
  LOOP
    -- Add column if not exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'org_id'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN org_id UUID REFERENCES public.organizations(id)', tbl);
    END IF;

    -- Create index for performance
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_org_id ON public.%I (org_id)', tbl, tbl);

    -- Auto-fill trigger
    EXECUTE format(
      'CREATE TRIGGER set_%s_org_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_user()',
      tbl, tbl
    );
  END LOOP;
END;
$$;

-- -----------------------------------------------
-- 6. Backfill: create default org, assign all data
-- -----------------------------------------------

INSERT INTO public.organizations (id, name, slug, plan)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Organization', 'default', 'free')
ON CONFLICT (slug) DO NOTHING;

-- Backfill profiles
UPDATE public.profiles SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

-- Backfill all data tables
DO $$
DECLARE
  tbl TEXT;
  tables_to_backfill TEXT[] := ARRAY[
    'account_action_items', 'account_entity_resolutions', 'account_intelligence_signals',
    'account_intelligence_sources', 'account_intelligence_summaries', 'account_merge_events',
    'action_dismissals', 'activities', 'admin_audit_log', 'ai_usage_log',
    'approval_processes', 'approval_requests', 'approval_steps',
    'campaign_targets', 'campaigns', 'client_aliases', 'client_provenance',
    'clients', 'commission_ledger', 'commission_plans',
    'contact_import_batches', 'contact_import_staging', 'contacts',
    'contract_amendments', 'contract_line_items', 'contracts',
    'crm_settings', 'custom_field_definitions', 'custom_fields', 'customer_health_scores',
    'dataset_aliases', 'datasets', 'deliveries', 'discovery_suggestions',
    'drive_links', 'email_templates', 'emails', 'embeddings_store',
    'enrichment_results', 'etf_constituent_snapshots', 'external_source_mappings',
    'forecast_categories', 'forecast_snapshots', 'forecasts',
    'fund_effective_exposure', 'fund_filings', 'fund_holdings_snapshot',
    'fund_intelligence_results', 'fund_intelligence_runs', 'fund_reported_holdings',
    'integration_configs', 'intelligence_run_steps', 'invoices',
    'meetings', 'notes', 'notification_preferences', 'notifications',
    'opportunities', 'opportunity_import_batches', 'opportunity_import_staging',
    'opportunity_products', 'opportunity_stage_history',
    'pricing_tiers', 'product_fit_analyses', 'quota_attainment', 'quotas',
    'renewals', 'research_signals', 'security_master', 'sync_log',
    'tasks', 'territories', 'territory_assignments',
    'workflow_actions', 'workflow_execution_log', 'workflow_rules'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_to_backfill
  LOOP
    EXECUTE format(
      'UPDATE public.%I SET org_id = %L WHERE org_id IS NULL',
      tbl, '00000000-0000-0000-0000-000000000001'
    );
  END LOOP;
END;
$$;

-- -----------------------------------------------
-- 7. RLS policies: organizations table
-- -----------------------------------------------

CREATE POLICY "Users can view own org"
  ON public.organizations FOR SELECT TO authenticated
  USING (id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can update own org"
  ON public.organizations FOR UPDATE TO authenticated
  USING (id = public.get_user_org_id(auth.uid()));

-- -----------------------------------------------
-- 8. RLS policies: org-scoped access for all tables
-- -----------------------------------------------
-- We add permissive org-scoped SELECT policies.
-- Existing more specific policies (owner-scoped writes etc.)
-- still apply — org_id is an ADDITIONAL constraint.

DO $$
DECLARE
  tbl TEXT;
  tables_to_policy TEXT[] := ARRAY[
    'account_action_items', 'account_entity_resolutions', 'account_intelligence_signals',
    'account_intelligence_sources', 'account_intelligence_summaries', 'account_merge_events',
    'action_dismissals', 'activities', 'admin_audit_log', 'ai_usage_log',
    'approval_processes', 'approval_requests', 'approval_steps',
    'campaign_targets', 'campaigns', 'client_aliases', 'client_provenance',
    'clients', 'commission_ledger', 'commission_plans',
    'contact_import_batches', 'contact_import_staging', 'contacts',
    'contract_amendments', 'contract_line_items', 'contracts',
    'crm_settings', 'custom_field_definitions', 'custom_fields', 'customer_health_scores',
    'dataset_aliases', 'datasets', 'deliveries', 'discovery_suggestions',
    'drive_links', 'email_templates', 'emails', 'embeddings_store',
    'enrichment_results', 'etf_constituent_snapshots', 'external_source_mappings',
    'forecast_categories', 'forecast_snapshots', 'forecasts',
    'fund_effective_exposure', 'fund_filings', 'fund_holdings_snapshot',
    'fund_intelligence_results', 'fund_intelligence_runs', 'fund_reported_holdings',
    'integration_configs', 'intelligence_run_steps', 'invoices',
    'meetings', 'notes', 'notification_preferences', 'notifications',
    'opportunities', 'opportunity_import_batches', 'opportunity_import_staging',
    'opportunity_products', 'opportunity_stage_history',
    'pricing_tiers', 'product_fit_analyses', 'quota_attainment', 'quotas',
    'renewals', 'research_signals', 'security_master', 'sync_log',
    'tasks', 'territories', 'territory_assignments',
    'workflow_actions', 'workflow_execution_log', 'workflow_rules'
  ];
  policy_name TEXT;
BEGIN
  FOREACH tbl IN ARRAY tables_to_policy
  LOOP
    -- Restrictive SELECT policy: user can only see rows from their org
    policy_name := format('org_isolation_%s', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (org_id = public.get_user_org_id(auth.uid()))',
      policy_name, tbl
    );
  END LOOP;
END;
$$;

-- -----------------------------------------------
-- 9. Update handle_new_user to accept org_id
-- -----------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  -- Check if org_id was passed in signup metadata
  v_org_id := (NEW.raw_user_meta_data->>'org_id')::UUID;

  INSERT INTO public.profiles (user_id, email, full_name, org_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    v_org_id
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'sales_rep');

  RETURN NEW;
END;
$$;
