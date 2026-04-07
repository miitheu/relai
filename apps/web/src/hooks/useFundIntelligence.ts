import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeTable } from '@/hooks/useRealtimeSubscription';

export interface RelevantDataset { dataset_name: string; dataset_id: string | null; relevance_score: number; reason: string; supporting_holdings?: string[]; }
export interface TargetPersona { title: string; reason: string; }
export interface EngagementStep { step: number; action: string; description: string; timing: string; }
export interface IntelligenceResult { id: string; run_id: string; client_id: string; strategy_summary: string | null; sector_exposure_summary: string | null; portfolio_theme_summary: string | null; relevant_datasets_json: RelevantDataset[]; recommended_approach: string | null; suggested_target_personas_json: TargetPersona[]; suggested_messaging: string | null; suggested_engagement_plan_json: EngagementStep[]; confidence_score: number; created_at: string; }
export interface IntelligenceRun { id: string; client_id: string; filing_source: string; filing_type: string; filing_date: string | null; filing_url: string | null; filing_cik: string | null; run_status: string; run_reason: string; error_message: string | null; generated_at: string | null; generated_by: string | null; created_at: string; completed_at: string | null; total_steps: number; completed_steps: number; current_step: string | null; playbook_type: string; }
export interface RunStep { id: string; run_id: string; step_name: string; step_order: number; step_status: string; started_at: string | null; completed_at: string | null; error_message: string | null; output_summary: string | null; output_json: any; }
export interface HoldingSnapshot { id: string; run_id: string; issuer_name: string; ticker: string | null; cusip: string | null; position_value: number; shares: number; portfolio_weight: number; sector: string | null; }
export interface IntelligenceSummary { id: string; client_id: string; run_id: string | null; strategy_summary: string | null; sector_summary: string | null; theme_summary: string | null; recommended_approach: string | null; suggested_messaging: string | null; freshness_status: string; freshness_checked_at: string | null; new_source_available: boolean; new_source_metadata: any; generated_at: string; }
export interface SECFreshnessResult { has_sec_data: boolean; cik: string | null; last_processed_filing: { date: string; run_id: string; run_date: string } | null; latest_filing_available: { date: string; type: string; url: string } | null; new_filing_available: boolean; freshness_status: string; days_since_last_run: number | null; }
export interface ProductFitAnalysis { id: string; client_id: string; product_id: string | null; fit_score: number; coverage_overlap_score: number; sector_relevance_score: number; timing_score: number; sector_relevance: string[]; supporting_entities_json: any[]; evidence_summary: string | null; is_latest: boolean; created_at: string; }

export function useIntelligenceRuns(clientId?: string, forcePolling?: boolean) {
  const db = useDb();
  return useQuery({
    queryKey: ['fund-intelligence-runs', clientId], enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await db.query('fund_intelligence_runs', { filters: [{ column: 'client_id', operator: 'eq', value: clientId! }], order: [{ column: 'created_at', ascending: false }] });
      if (error) throw new Error(error.message);
      return data as unknown as IntelligenceRun[];
    },
    refetchInterval: (query) => {
      if (forcePolling) return 3000;
      const runs = query.state.data;
      return runs?.some((r: any) => r.run_status === 'processing') ? 3000 : false;
    },
  });
}

export function useRunSteps(runId?: string) {
  const db = useDb();
  return useQuery({
    queryKey: ['intelligence-run-steps', runId], enabled: !!runId,
    queryFn: async () => {
      const { data, error } = await db.query('intelligence_run_steps', { filters: [{ column: 'run_id', operator: 'eq', value: runId! }], order: [{ column: 'step_order', ascending: true }] });
      if (error) throw new Error(error.message);
      return data as unknown as RunStep[];
    },
  });
}

export function useLatestIntelligenceResult(clientId?: string) {
  const db = useDb();
  return useQuery({
    queryKey: ['fund-intelligence-latest', clientId], enabled: !!clientId,
    queryFn: async () => {
      const { data: runs } = await db.query('fund_intelligence_runs', { select: 'id', filters: [{ column: 'client_id', operator: 'eq', value: clientId! }, { column: 'run_status', operator: 'eq', value: 'completed' }], order: [{ column: 'created_at', ascending: false }], limit: 1 });
      if (!runs || runs.length === 0) return null;
      const runId = runs[0].id;
      const { data: result, error: resErr } = await db.queryOne('fund_intelligence_results', { filters: [{ column: 'run_id', operator: 'eq', value: runId }] });
      if (resErr && (resErr as any).code !== 'PGRST116') throw new Error(resErr.message);
      const { data: runArr } = await db.query('fund_intelligence_runs', { filters: [{ column: 'id', operator: 'eq', value: runId }], limit: 1 });
      const run = runArr?.[0] || null;
      const { data: holdings } = await db.query('fund_holdings_snapshot', { filters: [{ column: 'run_id', operator: 'eq', value: runId }], order: [{ column: 'position_value', ascending: false }], limit: 50 });
      const mapped = result ? { ...result, relevant_datasets_json: (result.relevant_datasets_json || []) as unknown as RelevantDataset[], suggested_target_personas_json: (result.suggested_target_personas_json || []) as unknown as TargetPersona[], suggested_engagement_plan_json: (result.suggested_engagement_plan_json || []) as unknown as EngagementStep[] } as IntelligenceResult : null;
      return { result: mapped, run: run as unknown as IntelligenceRun | null, holdings: (holdings || []) as HoldingSnapshot[] };
    },
  });
}

export function useIntelligenceSummary(clientId?: string) {
  const db = useDb();
  return useQuery({
    queryKey: ['intelligence-summary', clientId], enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await db.queryOne('account_intelligence_summaries', { filters: [{ column: 'client_id', operator: 'eq', value: clientId! }] });
      if (error && (error as any).code !== 'PGRST116') throw new Error(error.message);
      return (data as unknown as IntelligenceSummary) || null;
    },
  });
}

export function useProductFitAnalyses(clientId?: string) {
  const db = useDb();
  return useQuery({
    queryKey: ['product-fit-analyses', clientId], enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await db.query('product_fit_analyses', { select: '*, datasets(name)', filters: [{ column: 'client_id', operator: 'eq', value: clientId! }, { column: 'is_latest', operator: 'eq', value: true }], order: [{ column: 'fit_score', ascending: false }] });
      if (error) throw new Error(error.message);
      return data as unknown as (ProductFitAnalysis & { datasets: { name: string } })[];
    },
  });
}

export function useAllIntelligenceRuns() {
  const db = useDb();
  return useQuery({
    queryKey: ['fund-intelligence-all-runs'],
    queryFn: async () => {
      const { data, error } = await db.query('fund_intelligence_runs', { select: '*, clients(name)', order: [{ column: 'created_at', ascending: false }], limit: 100 });
      if (error) throw new Error(error.message);
      return data as unknown as (IntelligenceRun & { clients: { name: string } })[];
    },
  });
}

export function useAccountsWithoutIntelligence() {
  const db = useDb();
  return useQuery({
    queryKey: ['accounts-without-intelligence'],
    queryFn: async () => {
      const { data: clients } = await db.query('clients', { select: 'id, name, client_type, relationship_status', order: [{ column: 'name' }], limit: 500 });
      const { data: summaries } = await db.query('account_intelligence_summaries', { select: 'client_id', limit: 500 });
      const withIntel = new Set((summaries || []).map((s: any) => s.client_id));
      return (clients || []).filter((c: any) => !withIntel.has(c.id));
    },
  });
}

export function useGenerateIntelligence() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ clientId, clientName, runReason }: { clientId: string; clientName: string; runReason?: string }) => {
      const { data, error } = await db.invoke('fund-intelligence', { client_id: clientId, client_name: clientName, user_id: user?.id, run_reason: runReason || 'manual' });
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
    onError: (err: Error) => { toast({ title: 'Intelligence generation failed', description: err.message, variant: 'destructive' }); },
  });
}

export function useCheckSECFreshness() {
  const db = useDb();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ clientId }: { clientId: string }) => {
      const { data, error } = await db.invoke('sec-freshness-check', { client_id: clientId });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as SECFreshnessResult;
    },
    onSuccess: (data, variables) => {
      if (data.new_filing_available) toast({ title: 'New SEC filing detected', description: `Filing from ${data.latest_filing_available?.date} is available.` });
      qc.invalidateQueries({ queryKey: ['intelligence-summary', variables.clientId] });
    },
    onError: (err: Error) => { toast({ title: 'SEC check failed', description: err.message, variant: 'destructive' }); },
  });
}

export function useIntelligenceRunRealtime(runId?: string) {
  const db = useDb();
  const qc = useQueryClient();
  useRealtimeTable('intelligence_run_steps', ['intelligence-run-realtime', runId || ''], runId ? { column: 'run_id', value: runId } : undefined);
  return useQuery({
    queryKey: ['intelligence-run-realtime', runId], enabled: !!runId,
    queryFn: async () => {
      const [runRes, stepsRes] = await Promise.all([
        db.queryOne('fund_intelligence_runs', { filters: [{ column: 'id', operator: 'eq', value: runId! }] }),
        db.query('intelligence_run_steps', { filters: [{ column: 'run_id', operator: 'eq', value: runId! }], order: [{ column: 'step_order', ascending: true }] }),
      ]);
      const run = runRes.data as unknown as IntelligenceRun | null;
      if (run && (run.run_status === 'completed' || run.run_status === 'failed')) {
        qc.invalidateQueries({ queryKey: ['fund-intelligence-latest', run.client_id] });
        qc.invalidateQueries({ queryKey: ['fund-intelligence-runs', run.client_id] });
        qc.invalidateQueries({ queryKey: ['intelligence-summary', run.client_id] });
        qc.invalidateQueries({ queryKey: ['product-fit-analyses', run.client_id] });
      }
      return { run, steps: (stepsRes.data || []) as unknown as RunStep[] };
    },
    refetchInterval: (query) => {
      const run = query.state.data?.run;
      return run && run.run_status === 'processing' ? 3000 : false;
    },
  });
}
