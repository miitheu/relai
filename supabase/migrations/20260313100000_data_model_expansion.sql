-- ============================================================
-- PHASE 3: Complete Data Model Expansion
-- Territories, Quotas, Forecasting, Commissions, Workflows,
-- Approvals, Email Templates, Health Scores, Custom Fields,
-- AI Usage, Integrations
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- 3.1 TERRITORIES & QUOTAS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE public.territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  region TEXT,
  segment TEXT,
  parent_territory_id UUID REFERENCES public.territories(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.territory_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_id UUID NOT NULL REFERENCES public.territories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID REFERENCES auth.users(id),
  UNIQUE(territory_id, user_id, client_id)
);

CREATE TABLE public.quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  territory_id UUID REFERENCES public.territories(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  quota_type TEXT NOT NULL DEFAULT 'revenue'
    CHECK (quota_type IN ('revenue', 'deals', 'meetings', 'pipeline')),
  target_value NUMERIC NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.quota_attainment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quota_id UUID NOT NULL REFERENCES public.quotas(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  attainment_value NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_territory_assignments_user ON public.territory_assignments(user_id);
CREATE INDEX idx_territory_assignments_territory ON public.territory_assignments(territory_id);
CREATE INDEX idx_territory_assignments_client ON public.territory_assignments(client_id);
CREATE INDEX idx_quotas_user_period ON public.quotas(user_id, period_start, period_end);
CREATE INDEX idx_quota_attainment_quota ON public.quota_attainment(quota_id, snapshot_date DESC);

-- RLS
ALTER TABLE public.territories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.territory_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quota_attainment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view territories" ON public.territories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage territories" ON public.territories FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_manager'));

CREATE POLICY "Authenticated can view territory assignments" ON public.territory_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage territory assignments" ON public.territory_assignments FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_manager'));

CREATE POLICY "Authenticated can view quotas" ON public.quotas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage quotas" ON public.quotas FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_manager'));

CREATE POLICY "Authenticated can view quota attainment" ON public.quota_attainment FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can insert quota attainment" ON public.quota_attainment FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_manager'));

-- Triggers
CREATE TRIGGER update_territories_updated_at BEFORE UPDATE ON public.territories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_quotas_updated_at BEFORE UPDATE ON public.quotas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════
-- 3.2 FORECASTING
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE public.forecast_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.forecast_categories (name, sort_order) VALUES
  ('Commit', 1), ('Best Case', 2), ('Pipeline', 3), ('Omitted', 4);

CREATE TABLE public.forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.forecast_categories(id),
  forecast_value NUMERIC NOT NULL DEFAULT 0,
  forecast_close_date DATE,
  notes TEXT,
  forecasted_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.forecast_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  territory_id UUID REFERENCES public.territories(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  commit_value NUMERIC NOT NULL DEFAULT 0,
  best_case_value NUMERIC NOT NULL DEFAULT 0,
  pipeline_value NUMERIC NOT NULL DEFAULT 0,
  closed_won_value NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_forecasts_opp ON public.forecasts(opportunity_id);
CREATE INDEX idx_forecasts_category ON public.forecasts(category_id);
CREATE INDEX idx_forecasts_user ON public.forecasts(forecasted_by);
CREATE INDEX idx_forecast_snapshots_date ON public.forecast_snapshots(snapshot_date, user_id);
CREATE INDEX idx_forecast_snapshots_period ON public.forecast_snapshots(period_start, period_end);

-- RLS
ALTER TABLE public.forecast_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecast_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view forecast categories" ON public.forecast_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can view forecasts" ON public.forecasts FOR SELECT TO authenticated USING (true);
CREATE POLICY "User can manage own forecasts" ON public.forecasts FOR INSERT TO authenticated WITH CHECK (auth.uid() = forecasted_by);
CREATE POLICY "User can update own forecasts" ON public.forecasts FOR UPDATE TO authenticated USING (auth.uid() = forecasted_by OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_manager'));
CREATE POLICY "Authenticated can view forecast snapshots" ON public.forecast_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage forecast snapshots" ON public.forecast_snapshots FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_manager'));

CREATE TRIGGER update_forecasts_updated_at BEFORE UPDATE ON public.forecasts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════
-- 3.3 CONTRACT LINE ITEMS & COMMISSIONS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE public.contract_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  dataset_id UUID REFERENCES public.datasets(id),
  description TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total_price NUMERIC GENERATED ALWAYS AS (quantity * unit_price) STORED,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.pricing_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID REFERENCES public.datasets(id),
  tier_name TEXT NOT NULL,
  min_value NUMERIC NOT NULL DEFAULT 0,
  max_value NUMERIC,
  price NUMERIC NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.contract_amendments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  amendment_type TEXT NOT NULL
    CHECK (amendment_type IN ('expansion', 'reduction', 'extension', 'termination')),
  effective_date DATE NOT NULL,
  description TEXT,
  value_change NUMERIC NOT NULL DEFAULT 0,
  approved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.commission_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  commission_type TEXT NOT NULL DEFAULT 'percentage'
    CHECK (commission_type IN ('percentage', 'flat', 'tiered')),
  base_rate NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  rules_json JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.commission_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  plan_id UUID REFERENCES public.commission_plans(id),
  opportunity_id UUID REFERENCES public.opportunities(id),
  contract_id UUID REFERENCES public.contracts(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  base_amount NUMERIC NOT NULL DEFAULT 0,
  commission_amount NUMERIC NOT NULL DEFAULT 0,
  commission_rate NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paid', 'reversed')),
  approved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_contract_line_items_contract ON public.contract_line_items(contract_id);
CREATE INDEX idx_contract_amendments_contract ON public.contract_amendments(contract_id);
CREATE INDEX idx_commission_ledger_user ON public.commission_ledger(user_id, period_start, period_end);
CREATE INDEX idx_commission_ledger_opp ON public.commission_ledger(opportunity_id);
CREATE INDEX idx_pricing_tiers_dataset ON public.pricing_tiers(dataset_id);

-- RLS
ALTER TABLE public.contract_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_amendments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view contract line items" ON public.contract_line_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage contract line items" ON public.contract_line_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update contract line items" ON public.contract_line_items FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can view pricing tiers" ON public.pricing_tiers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage pricing tiers" ON public.pricing_tiers FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can view contract amendments" ON public.contract_amendments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert contract amendments" ON public.contract_amendments FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can view commission plans" ON public.commission_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage commission plans" ON public.commission_plans FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "User can view own commissions" ON public.commission_ledger FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_manager'));
CREATE POLICY "Admin can manage commissions" ON public.commission_ledger FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_pricing_tiers_updated_at BEFORE UPDATE ON public.pricing_tiers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_commission_plans_updated_at BEFORE UPDATE ON public.commission_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_commission_ledger_updated_at BEFORE UPDATE ON public.commission_ledger
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════
-- 3.4 WORKFLOWS & APPROVALS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE public.workflow_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('opportunity', 'contract', 'renewal', 'delivery', 'client')),
  trigger_event TEXT NOT NULL
    CHECK (trigger_event IN ('created', 'updated', 'stage_change', 'value_change', 'status_change')),
  trigger_conditions JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.workflow_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.workflow_rules(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL
    CHECK (action_type IN ('notify', 'create_task', 'update_field', 'send_email', 'require_approval')),
  action_config JSONB NOT NULL DEFAULT '{}',
  action_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.workflow_execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.workflow_rules(id),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  triggered_by TEXT,
  status TEXT NOT NULL DEFAULT 'executed'
    CHECK (status IN ('executed', 'failed', 'skipped')),
  result_json JSONB DEFAULT '{}',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.approval_processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('opportunity', 'contract', 'discount', 'commission')),
  trigger_condition JSONB NOT NULL DEFAULT '{}',
  approval_chain JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id UUID NOT NULL REFERENCES public.approval_processes(id),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  current_step INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  approver_id UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  decision_at TIMESTAMPTZ,
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_workflow_rules_entity ON public.workflow_rules(entity_type, is_active);
CREATE INDEX idx_workflow_actions_rule ON public.workflow_actions(rule_id, action_order);
CREATE INDEX idx_workflow_exec_log_rule ON public.workflow_execution_log(rule_id, executed_at DESC);
CREATE INDEX idx_approval_requests_status ON public.approval_requests(status, requested_by);
CREATE INDEX idx_approval_steps_request ON public.approval_steps(request_id, step_order);
CREATE INDEX idx_approval_steps_approver ON public.approval_steps(approver_id, status);

-- RLS
ALTER TABLE public.workflow_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_execution_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view workflow rules" ON public.workflow_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage workflow rules" ON public.workflow_rules FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can view workflow actions" ON public.workflow_actions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage workflow actions" ON public.workflow_actions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can view workflow log" ON public.workflow_execution_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "System can insert workflow log" ON public.workflow_execution_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can view approval processes" ON public.approval_processes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage approval processes" ON public.approval_processes FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can view approval requests" ON public.approval_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "User can create approval requests" ON public.approval_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = requested_by);
CREATE POLICY "Approvers can update approval requests" ON public.approval_requests FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can view approval steps" ON public.approval_steps FOR SELECT TO authenticated USING (true);
CREATE POLICY "Approver can update own step" ON public.approval_steps FOR UPDATE TO authenticated USING (auth.uid() = approver_id);
CREATE POLICY "System can insert approval steps" ON public.approval_steps FOR INSERT TO authenticated WITH CHECK (true);

CREATE TRIGGER update_workflow_rules_updated_at BEFORE UPDATE ON public.workflow_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_approval_processes_updated_at BEFORE UPDATE ON public.approval_processes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_approval_requests_updated_at BEFORE UPDATE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════
-- 3.5 SUPPORT TABLES
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT
    CHECK (category IN ('prospecting', 'follow_up', 'renewal', 'trial', 'onboarding', 'general')),
  variables JSONB NOT NULL DEFAULT '[]',
  created_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  in_app_enabled BOOLEAN NOT NULL DEFAULT true,
  preferences_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.customer_health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  components_json JSONB NOT NULL DEFAULT '{}',
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_latest BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE public.custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('client', 'contact', 'opportunity', 'contract')),
  field_name TEXT NOT NULL,
  field_label TEXT NOT NULL,
  field_type TEXT NOT NULL
    CHECK (field_type IN ('text', 'number', 'date', 'select', 'multi_select', 'boolean')),
  field_options JSONB,
  is_required BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entity_type, field_name)
);

CREATE TABLE public.custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id UUID NOT NULL REFERENCES public.custom_field_definitions(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL,
  value_text TEXT,
  value_number NUMERIC,
  value_date DATE,
  value_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(definition_id, entity_id)
);

CREATE TABLE public.integration_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  integration_type TEXT NOT NULL
    CHECK (integration_type IN ('email', 'calendar', 'crm_sync', 'data_enrichment', 'webhook')),
  config_json JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.integration_configs(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL CHECK (sync_type IN ('full', 'incremental')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  records_processed INTEGER NOT NULL DEFAULT 0,
  records_created INTEGER NOT NULL DEFAULT 0,
  records_updated INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE public.enrichment_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  source TEXT NOT NULL,
  enrichment_type TEXT NOT NULL,
  data_json JSONB NOT NULL DEFAULT '{}',
  confidence NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  function_name TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  metadata_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_email_templates_category ON public.email_templates(category, is_active);
CREATE INDEX idx_health_scores_client ON public.customer_health_scores(client_id, is_latest);
CREATE INDEX idx_custom_fields_entity ON public.custom_fields(definition_id, entity_id);
CREATE INDEX idx_custom_field_defs_entity ON public.custom_field_definitions(entity_type);
CREATE INDEX idx_sync_log_integration ON public.sync_log(integration_id, started_at DESC);
CREATE INDEX idx_enrichment_results_entity ON public.enrichment_results(entity_type, entity_id);
CREATE INDEX idx_ai_usage_user ON public.ai_usage_log(user_id, created_at DESC);
CREATE INDEX idx_ai_usage_function ON public.ai_usage_log(function_name, created_at DESC);

-- RLS
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_health_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view email templates" ON public.email_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage email templates" ON public.email_templates FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "User can view own notification prefs" ON public.notification_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "User can manage own notification prefs" ON public.notification_preferences FOR ALL TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Authenticated can view health scores" ON public.customer_health_scores FOR SELECT TO authenticated USING (true);
CREATE POLICY "System can manage health scores" ON public.customer_health_scores FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can view custom field defs" ON public.custom_field_definitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage custom field defs" ON public.custom_field_definitions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can view custom fields" ON public.custom_fields FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage custom fields" ON public.custom_fields FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update custom fields" ON public.custom_fields FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Admin can view integration configs" ON public.integration_configs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can manage integration configs" ON public.integration_configs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can view sync log" ON public.sync_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "System can insert sync log" ON public.sync_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can view enrichment results" ON public.enrichment_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "System can insert enrichment results" ON public.enrichment_results FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admin can view AI usage" ON public.ai_usage_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR auth.uid() = user_id);
CREATE POLICY "System can insert AI usage" ON public.ai_usage_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notification_prefs_updated_at BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_custom_fields_updated_at BEFORE UPDATE ON public.custom_fields
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_integration_configs_updated_at BEFORE UPDATE ON public.integration_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
