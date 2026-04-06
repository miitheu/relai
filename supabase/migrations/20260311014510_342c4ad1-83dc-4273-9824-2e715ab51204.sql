
-- Fund Intelligence Runs
CREATE TABLE public.fund_intelligence_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  filing_source text NOT NULL DEFAULT 'SEC EDGAR',
  filing_type text NOT NULL DEFAULT '13F',
  filing_date date,
  filing_url text,
  filing_cik text,
  run_status text NOT NULL DEFAULT 'pending',
  error_message text,
  generated_at timestamp with time zone,
  generated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Fund Intelligence Results
CREATE TABLE public.fund_intelligence_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.fund_intelligence_runs(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  strategy_summary text,
  sector_exposure_summary text,
  portfolio_theme_summary text,
  relevant_datasets_json jsonb DEFAULT '[]'::jsonb,
  recommended_approach text,
  suggested_target_personas_json jsonb DEFAULT '[]'::jsonb,
  suggested_messaging text,
  suggested_engagement_plan_json jsonb DEFAULT '[]'::jsonb,
  confidence_score integer DEFAULT 50,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Fund Holdings Snapshot
CREATE TABLE public.fund_holdings_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.fund_intelligence_runs(id) ON DELETE CASCADE,
  issuer_name text NOT NULL,
  ticker text,
  cusip text,
  position_value numeric DEFAULT 0,
  shares numeric DEFAULT 0,
  portfolio_weight numeric DEFAULT 0,
  sector text,
  relevance_flags_json jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fund_intelligence_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_intelligence_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_holdings_snapshot ENABLE ROW LEVEL SECURITY;

-- RLS Policies for runs
CREATE POLICY "Authenticated can view intelligence runs" ON public.fund_intelligence_runs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert intelligence runs" ON public.fund_intelligence_runs
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update intelligence runs" ON public.fund_intelligence_runs
  FOR UPDATE TO authenticated USING (true);

-- RLS Policies for results
CREATE POLICY "Authenticated can view intelligence results" ON public.fund_intelligence_results
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert intelligence results" ON public.fund_intelligence_results
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update intelligence results" ON public.fund_intelligence_results
  FOR UPDATE TO authenticated USING (true);

-- RLS Policies for holdings
CREATE POLICY "Authenticated can view holdings snapshots" ON public.fund_holdings_snapshot
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert holdings snapshots" ON public.fund_holdings_snapshot
  FOR INSERT TO authenticated WITH CHECK (true);

-- Updated_at triggers
CREATE TRIGGER update_fund_intelligence_runs_updated_at
  BEFORE UPDATE ON public.fund_intelligence_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_fund_intelligence_results_updated_at
  BEFORE UPDATE ON public.fund_intelligence_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
