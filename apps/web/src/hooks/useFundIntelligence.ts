import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeTable } from '@/hooks/useRealtimeSubscription';

// ─── Types ───────────────────────────────────────────────────────────
export interface RelevantDataset {
  dataset_name: string;
  dataset_id: string | null;
  relevance_score: number;
  reason: string;
  supporting_holdings?: string[];
}

export interface TargetPersona {
  title: string;
  reason: string;
}

export interface EngagementStep {
  step: number;
  action: string;
  description: string;
  timing: string;
}

export interface IntelligenceResult {
  id: string;
  run_id: string;
  client_id: string;
  strategy_summary: string | null;
  sector_exposure_summary: string | null;
  portfolio_theme_summary: string | null;
  relevant_datasets_json: RelevantDataset[];
  recommended_approach: string | null;
  suggested_target_personas_json: TargetPersona[];
  suggested_messaging: string | null;
  suggested_engagement_plan_json: EngagementStep[];
  confidence_score: number;
  created_at: string;
}

export interface IntelligenceRun {
  id: string;
  client_id: string;
  filing_source: string;
  filing_type: string;
  filing_date: string | null;
  filing_url: string | null;
  filing_cik: string | null;
  run_status: string;
  run_reason: string;
  error_message: string | null;
  generated_at: string | null;
  generated_by: string | null;
  created_at: string;
  completed_at: string | null;
  total_steps: number;
  completed_steps: number;
  current_step: string | null;
  playbook_type: string;
}

export interface RunStep {
  id: string;
  run_id: string;
  step_name: string;
  step_order: number;
  step_status: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  output_summary: string | null;
  output_json: any;
}

export interface HoldingSnapshot {
  id: string;
  run_id: string;
  issuer_name: string;
  ticker: string | null;
  cusip: string | null;
  position_value: number;
  shares: number;
  portfolio_weight: number;
  sector: string | null;
}

export interface IntelligenceSummary {
  id: string;
  client_id: string;
  run_id: string | null;
  strategy_summary: string | null;
  sector_summary: string | null;
  theme_summary: string | null;
  recommended_approach: string | null;
  suggested_messaging: string | null;
  freshness_status: string;
  freshness_checked_at: string | null;
  new_source_available: boolean;
  new_source_metadata: any;
  generated_at: string;
}

export interface SECFreshnessResult {
  has_sec_data: boolean;
  cik: string | null;
  last_processed_filing: { date: string; run_id: string; run_date: string } | null;
  latest_filing_available: { date: string; type: string; url: string } | null;
  new_filing_available: boolean;
  freshness_status: string;
  days_since_last_run: number | null;
}

export interface ProductFitAnalysis {
  id: string;
  client_id: string;
  product_id: string | null;
  fit_score: number;
  coverage_overlap_score: number;
  sector_relevance_score: number;
  timing_score: number;
  sector_relevance: string[];
  supporting_entities_json: any[];
  evidence_summary: string | null;
  is_latest: boolean;
  created_at: string;
}

// ─── Hooks ───────────────────────────────────────────────────────────

export function useIntelligenceRuns(clientId?: string, forcePolling?: boolean) {
  const supabase = useSupabase();
  const query = useQuery({
    queryKey: ['fund-intelligence-runs', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fund_intelligence_runs')
        .select('*')
        .eq('client_id', clientId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as IntelligenceRun[];
    },
    // Poll every 3s while any run is processing or generation was just triggered
    refetchInterval: (query) => {
      if (forcePolling) return 3000;
      const runs = query.state.data;
      const hasProcessing = runs?.some((r) => r.run_status === 'processing');
      return hasProcessing ? 3000 : false;
    },
  });
  return query;
}

export function useRunSteps(runId?: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['intelligence-run-steps', runId],
    enabled: !!runId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('intelligence_run_steps' as any)
        .select('*')
        .eq('run_id', runId!)
        .order('step_order', { ascending: true });
      if (error) throw error;
      return data as unknown as RunStep[];
    },
  });
}

export function useLatestIntelligenceResult(clientId?: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['fund-intelligence-latest', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data: runs, error: runErr } = await supabase
        .from('fund_intelligence_runs')
        .select('id')
        .eq('client_id', clientId!)
        .eq('run_status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1);
      if (runErr) throw runErr;
      if (!runs || runs.length === 0) return null;

      const runId = runs[0].id;
      const { data: result, error: resErr } = await supabase
        .from('fund_intelligence_results')
        .select('*')
        .eq('run_id', runId)
        .single();
      if (resErr && resErr.code !== 'PGRST116') throw resErr;

      const { data: run } = await supabase.from('fund_intelligence_runs').select('*').eq('id', runId).single();
      const { data: holdings } = await supabase.from('fund_holdings_snapshot').select('*').eq('run_id', runId).order('position_value', { ascending: false }).limit(50);

      const mapped = result ? {
        ...result,
        relevant_datasets_json: (result.relevant_datasets_json || []) as unknown as RelevantDataset[],
        suggested_target_personas_json: (result.suggested_target_personas_json || []) as unknown as TargetPersona[],
        suggested_engagement_plan_json: (result.suggested_engagement_plan_json || []) as unknown as EngagementStep[],
      } as IntelligenceResult : null;

      return {
        result: mapped,
        run: run as unknown as IntelligenceRun | null,
        holdings: (holdings || []) as HoldingSnapshot[],
      };
    },
  });
}

export function useIntelligenceSummary(clientId?: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['intelligence-summary', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_intelligence_summaries' as any)
        .select('*')
        .eq('client_id', clientId!)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return (data as unknown as IntelligenceSummary) || null;
    },
  });
}

export function useProductFitAnalyses(clientId?: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['product-fit-analyses', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_fit_analyses' as any)
        .select('*, datasets(name)')
        .eq('client_id', clientId!)
        .eq('is_latest', true)
        .order('fit_score', { ascending: false });
      if (error) throw error;
      return data as unknown as (ProductFitAnalysis & { datasets: { name: string } })[];
    },
  });
}

export function useAllIntelligenceRuns() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['fund-intelligence-all-runs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fund_intelligence_runs')
        .select('*, clients(name)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as unknown as (IntelligenceRun & { clients: { name: string } })[];
    },
  });
}

export function useAccountsWithoutIntelligence() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['accounts-without-intelligence'],
    queryFn: async () => {
      // Get all clients
      const { data: clients } = await supabase.from('clients').select('id, name, client_type, relationship_status').order('name').limit(500);
      // Get clients with summaries
      const { data: summaries } = await supabase.from('account_intelligence_summaries' as any).select('client_id').limit(500);
      const withIntel = new Set((summaries || []).map((s: any) => s.client_id));
      return (clients || []).filter((c: any) => !withIntel.has(c.id));
    },
  });
}

export function useGenerateIntelligence() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ clientId, clientName, runReason }: { clientId: string; clientName: string; runReason?: string }) => {
      const { data, error } = await supabase.functions.invoke('fund-intelligence', {
        body: { client_id: clientId, client_name: clientName, user_id: user?.id, run_reason: runReason || 'manual' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, variables) => {
      toast({ title: 'Intelligence generated', description: 'Analysis is ready.' });
      qc.invalidateQueries({ queryKey: ['fund-intelligence-runs', variables.clientId] });
      qc.invalidateQueries({ queryKey: ['fund-intelligence-latest', variables.clientId] });
      qc.invalidateQueries({ queryKey: ['fund-intelligence-all-runs'] });
      qc.invalidateQueries({ queryKey: ['intelligence-summary', variables.clientId] });
      qc.invalidateQueries({ queryKey: ['product-fit-analyses', variables.clientId] });
      qc.invalidateQueries({ queryKey: ['accounts-without-intelligence'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Intelligence generation failed', description: err.message, variant: 'destructive' });
    },
  });
}

export function useCheckSECFreshness() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ clientId }: { clientId: string }) => {
      const { data, error } = await supabase.functions.invoke('sec-freshness-check', {
        body: { client_id: clientId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as SECFreshnessResult;
    },
    onSuccess: (data, variables) => {
      if (data.new_filing_available) {
        toast({ title: 'New SEC filing detected', description: `Filing from ${data.latest_filing_available?.date} is available.` });
      }
      qc.invalidateQueries({ queryKey: ['intelligence-summary', variables.clientId] });
    },
    onError: (err: Error) => {
      toast({ title: 'SEC check failed', description: err.message, variant: 'destructive' });
    },
  });
}

// Realtime subscription for run progress (replaces polling)
export function useIntelligenceRunRealtime(runId?: string) {
  const supabase = useSupabase();
  const qc = useQueryClient();

  // Subscribe to realtime changes on intelligence_run_steps
  useRealtimeTable(
    'intelligence_run_steps',
    ['intelligence-run-realtime', runId || ''],
    runId ? { column: 'run_id', value: runId } : undefined,
  );

  const query = useQuery({
    queryKey: ['intelligence-run-realtime', runId],
    enabled: !!runId,
    queryFn: async () => {
      const [runRes, stepsRes] = await Promise.all([
        supabase.from('fund_intelligence_runs').select('*').eq('id', runId!).single(),
        supabase.from('intelligence_run_steps' as any).select('*').eq('run_id', runId!).order('step_order', { ascending: true }),
      ]);
      const run = runRes.data as unknown as IntelligenceRun | null;

      // When run completes, invalidate cached results so they show on tab switch
      if (run && (run.run_status === 'completed' || run.run_status === 'failed')) {
        qc.invalidateQueries({ queryKey: ['fund-intelligence-latest', run.client_id] });
        qc.invalidateQueries({ queryKey: ['fund-intelligence-runs', run.client_id] });
        qc.invalidateQueries({ queryKey: ['intelligence-summary', run.client_id] });
        qc.invalidateQueries({ queryKey: ['product-fit-analyses', run.client_id] });
      }

      return {
        run,
        steps: (stepsRes.data || []) as unknown as RunStep[],
      };
    },
    // Poll every 3s as fallback in case Realtime subscription isn't working
    refetchInterval: (query) => {
      const run = query.state.data?.run;
      return run && run.run_status === 'processing' ? 3000 : false;
    },
  });

  return query;
}
