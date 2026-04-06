
-- ═══════════════════════════════════════════════════════════════
-- INTELLIGENCE PIPELINE TABLES
-- ═══════════════════════════════════════════════════════════════

-- 1. intelligence_run_steps — tracks each step within a run
CREATE TABLE public.intelligence_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.fund_intelligence_runs(id) ON DELETE CASCADE,
  step_name text NOT NULL,
  step_order integer NOT NULL DEFAULT 0,
  step_status text NOT NULL DEFAULT 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  output_summary text,
  output_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.intelligence_run_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view run steps" ON public.intelligence_run_steps
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert run steps" ON public.intelligence_run_steps
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update run steps" ON public.intelligence_run_steps
  FOR UPDATE TO authenticated USING (true);

-- 2. account_intelligence_sources — tracks data sources used per run
CREATE TABLE public.account_intelligence_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.fund_intelligence_runs(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_identifier text,
  source_url text,
  source_date date,
  source_status text NOT NULL DEFAULT 'discovered',
  metadata_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_intelligence_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view sources" ON public.account_intelligence_sources
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert sources" ON public.account_intelligence_sources
  FOR INSERT TO authenticated WITH CHECK (true);

-- 3. account_intelligence_signals — structured signals extracted
CREATE TABLE public.account_intelligence_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.fund_intelligence_runs(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  signal_type text NOT NULL,
  signal_category text,
  signal_value text,
  confidence integer DEFAULT 50,
  evidence_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_intelligence_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view signals" ON public.account_intelligence_signals
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert signals" ON public.account_intelligence_signals
  FOR INSERT TO authenticated WITH CHECK (true);

-- 4. product_fit_analyses — reusable product-fit records
CREATE TABLE public.product_fit_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.fund_intelligence_runs(id) ON DELETE SET NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.datasets(id) ON DELETE CASCADE,
  fit_score integer DEFAULT 0,
  coverage_overlap_score integer DEFAULT 0,
  sector_relevance_score integer DEFAULT 0,
  timing_score integer DEFAULT 0,
  sector_relevance jsonb DEFAULT '[]'::jsonb,
  supporting_entities_json jsonb DEFAULT '[]'::jsonb,
  evidence_summary text,
  is_latest boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_fit_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view product fit" ON public.product_fit_analyses
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert product fit" ON public.product_fit_analyses
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update product fit" ON public.product_fit_analyses
  FOR UPDATE TO authenticated USING (true);

-- 5. account_intelligence_summaries — latest summary per client
CREATE TABLE public.account_intelligence_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.fund_intelligence_runs(id) ON DELETE SET NULL,
  strategy_summary text,
  sector_summary text,
  theme_summary text,
  recommended_approach text,
  suggested_messaging text,
  freshness_status text NOT NULL DEFAULT 'fresh',
  freshness_checked_at timestamptz,
  new_source_available boolean DEFAULT false,
  new_source_metadata jsonb DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_intelligence_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view summaries" ON public.account_intelligence_summaries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert summaries" ON public.account_intelligence_summaries
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update summaries" ON public.account_intelligence_summaries
  FOR UPDATE TO authenticated USING (true);

-- Create unique constraint on client_id for upsert
CREATE UNIQUE INDEX idx_account_intelligence_summaries_client ON public.account_intelligence_summaries (client_id);

-- 6. Add columns to fund_intelligence_runs for enhanced job tracking
ALTER TABLE public.fund_intelligence_runs 
  ADD COLUMN IF NOT EXISTS run_reason text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS triggered_by uuid,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS total_steps integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_steps integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_step text;

-- 7. Realtime for run steps (for live progress tracking)
ALTER PUBLICATION supabase_realtime ADD TABLE public.intelligence_run_steps;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fund_intelligence_runs;
