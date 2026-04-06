-- Web Enrichment & Account Discovery support tables
-- Adds discovery_suggestions table for storing AI-powered account suggestions

-- ─── Discovery Suggestions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.discovery_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.fund_intelligence_runs(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  normalized_name TEXT,
  suggested_type TEXT,
  country TEXT,
  estimated_aum TEXT,
  similarity_score INTEGER CHECK (similarity_score BETWEEN 0 AND 100),
  product_fit_score INTEGER CHECK (product_fit_score BETWEEN 0 AND 100),
  composite_score INTEGER GENERATED ALWAYS AS (
    (COALESCE(similarity_score, 0) * 40 + COALESCE(product_fit_score, 0) * 60) / 100
  ) STORED,
  discovery_source TEXT CHECK (discovery_source IN ('sec_edgar', 'web_search', 'ai_lookalike')),
  similarity_reason TEXT,
  product_fit_reason TEXT,
  recommended_approach TEXT,
  target_datasets JSONB DEFAULT '[]'::jsonb,
  sec_cik TEXT,
  metadata_json JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'imported', 'dismissed', 'in_review')),
  imported_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  dismissed_reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_discovery_suggestions_status
  ON public.discovery_suggestions(status, composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_suggestions_run
  ON public.discovery_suggestions(run_id);
CREATE INDEX IF NOT EXISTS idx_discovery_suggestions_name
  ON public.discovery_suggestions(normalized_name);

-- RLS
ALTER TABLE public.discovery_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view discovery suggestions"
  ON public.discovery_suggestions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert discovery suggestions"
  ON public.discovery_suggestions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update discovery suggestions"
  ON public.discovery_suggestions FOR UPDATE TO authenticated USING (true);

-- Updated_at trigger
CREATE TRIGGER update_discovery_suggestions_updated_at
  BEFORE UPDATE ON public.discovery_suggestions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Index on enrichment_results for source filtering ──────────────
CREATE INDEX IF NOT EXISTS idx_enrichment_results_source
  ON public.enrichment_results(source, entity_id);
