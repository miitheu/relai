
-- ========================================
-- STEP 1: Security Master (canonical securities)
-- ========================================
CREATE TABLE public.security_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text,
  issuer_name text NOT NULL,
  cusip text,
  security_type text NOT NULL DEFAULT 'equity',
  is_etf boolean NOT NULL DEFAULT false,
  sector text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_security_master_cusip ON public.security_master (cusip) WHERE cusip IS NOT NULL;
CREATE INDEX idx_security_master_ticker ON public.security_master (ticker) WHERE ticker IS NOT NULL;
CREATE INDEX idx_security_master_is_etf ON public.security_master (is_etf) WHERE is_etf = true;

ALTER TABLE public.security_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view securities"
  ON public.security_master FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert securities"
  ON public.security_master FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update securities"
  ON public.security_master FOR UPDATE TO authenticated USING (true);

-- ========================================
-- STEP 2: Fund Filings (raw filing metadata)
-- ========================================
CREATE TABLE public.fund_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'SEC EDGAR',
  filing_type text NOT NULL DEFAULT '13F',
  filing_date date NOT NULL,
  source_url text,
  source_identifier text,
  raw_metadata_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fund_filings_fund ON public.fund_filings (fund_id);
CREATE INDEX idx_fund_filings_date ON public.fund_filings (filing_date DESC);
CREATE UNIQUE INDEX idx_fund_filings_unique ON public.fund_filings (fund_id, filing_type, filing_date);

ALTER TABLE public.fund_filings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view filings"
  ON public.fund_filings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert filings"
  ON public.fund_filings FOR INSERT TO authenticated WITH CHECK (true);

-- ========================================
-- STEP 3: Fund Reported Holdings (parsed per filing)
-- ========================================
CREATE TABLE public.fund_reported_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  filing_id uuid NOT NULL REFERENCES public.fund_filings(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  security_id uuid REFERENCES public.security_master(id),
  issuer_name text NOT NULL,
  ticker text,
  cusip text,
  security_type text DEFAULT 'equity',
  shares numeric DEFAULT 0,
  position_value numeric DEFAULT 0,
  weight_pct numeric DEFAULT 0,
  is_etf boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_frh_fund ON public.fund_reported_holdings (fund_id);
CREATE INDEX idx_frh_filing ON public.fund_reported_holdings (filing_id);
CREATE INDEX idx_frh_security ON public.fund_reported_holdings (security_id) WHERE security_id IS NOT NULL;
CREATE INDEX idx_frh_report_date ON public.fund_reported_holdings (report_date DESC);
CREATE INDEX idx_frh_cusip ON public.fund_reported_holdings (cusip) WHERE cusip IS NOT NULL;

ALTER TABLE public.fund_reported_holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view reported holdings"
  ON public.fund_reported_holdings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert reported holdings"
  ON public.fund_reported_holdings FOR INSERT TO authenticated WITH CHECK (true);

-- ========================================
-- STEP 4: ETF Constituent Snapshots
-- ========================================
CREATE TABLE public.etf_constituent_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etf_security_id uuid NOT NULL REFERENCES public.security_master(id) ON DELETE CASCADE,
  as_of_date date NOT NULL,
  constituent_security_id uuid NOT NULL REFERENCES public.security_master(id) ON DELETE CASCADE,
  weight_pct numeric NOT NULL DEFAULT 0,
  source_type text NOT NULL DEFAULT 'manual',
  source_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ecs_etf ON public.etf_constituent_snapshots (etf_security_id);
CREATE INDEX idx_ecs_date ON public.etf_constituent_snapshots (as_of_date DESC);
CREATE INDEX idx_ecs_constituent ON public.etf_constituent_snapshots (constituent_security_id);

ALTER TABLE public.etf_constituent_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view ETF constituents"
  ON public.etf_constituent_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert ETF constituents"
  ON public.etf_constituent_snapshots FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update ETF constituents"
  ON public.etf_constituent_snapshots FOR UPDATE TO authenticated USING (true);

-- ========================================
-- STEP 5: Fund Effective Exposure (aggregated)
-- ========================================
CREATE TABLE public.fund_effective_exposure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  security_id uuid NOT NULL REFERENCES public.security_master(id) ON DELETE CASCADE,
  direct_weight_pct numeric DEFAULT 0,
  implied_etf_weight_pct numeric DEFAULT 0,
  total_weight_pct numeric GENERATED ALWAYS AS (direct_weight_pct + implied_etf_weight_pct) STORED,
  source_breakdown_json jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_fee_unique ON public.fund_effective_exposure (fund_id, report_date, security_id);
CREATE INDEX idx_fee_fund ON public.fund_effective_exposure (fund_id);
CREATE INDEX idx_fee_security ON public.fund_effective_exposure (security_id);
CREATE INDEX idx_fee_date ON public.fund_effective_exposure (report_date DESC);
CREATE INDEX idx_fee_total ON public.fund_effective_exposure (total_weight_pct DESC);

ALTER TABLE public.fund_effective_exposure ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view effective exposure"
  ON public.fund_effective_exposure FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert effective exposure"
  ON public.fund_effective_exposure FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update effective exposure"
  ON public.fund_effective_exposure FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete effective exposure"
  ON public.fund_effective_exposure FOR DELETE TO authenticated USING (true);
