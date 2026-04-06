ALTER TABLE public.fund_intelligence_runs 
ADD COLUMN playbook_type text NOT NULL DEFAULT 'fund_strategy';

COMMENT ON COLUMN public.fund_intelligence_runs.playbook_type IS 'Intelligence playbook used: fund_strategy, corporate, financial_institution, partnership';