import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

function formatHoldingValue(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}
import {
  useLatestIntelligenceResult,
  useIntelligenceRuns,
  useGenerateIntelligence,
  useIntelligenceSummary,
  useCheckSECFreshness,
  useRunSteps,
  useProductFitAnalyses,
  useIntelligenceRunRealtime,
  type RelevantDataset,
  type SECFreshnessResult,
} from '@/hooks/useFundIntelligence';
import { useFundExposure } from '@/hooks/useFundExposure';
import { useQuickCreate } from '@/contexts/QuickCreateContext';
import EntityResolutionCard from './EntityResolutionCard';
import CoverageOverlapSection from './CoverageOverlapSection';
import WebEnrichmentSection from './WebEnrichmentSection';
import { useEntityResolution } from '@/hooks/useEntityResolution';
import {
  Brain, Loader2, ExternalLink, RefreshCw, Target,
  MessageSquare, Users, ListChecks, BarChart3, Shield,
  TrendingUp, ChevronDown, ChevronRight, Sparkles, FileText, PlusCircle,
  Building2, Handshake, Landmark, AlertTriangle, CheckCircle2,
  Clock, Search, ArrowRight, Zap, Eye,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface Props {
  clientId: string;
  clientName: string;
  clientType: string;
}

const PLAYBOOK_CONFIG: Record<string, { label: string; icon: React.ElementType; description: string; color: string }> = {
  fund_strategy: { label: 'Fund Strategy', icon: TrendingUp, description: 'SEC 13F filing analysis, holdings mapping, and investment theme extraction', color: 'text-primary' },
  corporate: { label: 'Corporate Intel', icon: Building2, description: 'Business model analysis, supply chain relevance, and product use-case mapping', color: 'text-info' },
  financial_institution: { label: 'Financial Institution', icon: Landmark, description: 'Business segment inference, analytical needs mapping, and product fit by division', color: 'text-warning' },
  partnership: { label: 'Partnership Intel', icon: Handshake, description: 'Product adjacency analysis, coverage overlap, and partnership opportunity assessment', color: 'text-success' },
};

const STEP_LABELS: Record<string, string> = {
  account_classification: 'Account Classification',
  source_discovery: 'Source Discovery',
  source_retrieval: 'Source Retrieval',
  holdings_extraction: 'Holdings Extraction',
  signal_generation: 'Signal Generation',
  product_fit_analysis: 'Product Fit Analysis',
  intelligence_summary: 'Intelligence Summary',
};

function IntelligenceProgressView({ liveProgress, config, PlaybookIcon }: { liveProgress: any; config: any; PlaybookIcon: React.ElementType }) {
  const hasLiveData = liveProgress?.run;
  const completedSteps = hasLiveData ? (liveProgress.run as any).completed_steps || 0 : 0;
  const totalSteps = hasLiveData ? Math.max((liveProgress.run as any).total_steps, 1) : 1;
  const progress = Math.round((completedSteps / totalSteps) * 100);
  const currentStep = hasLiveData ? (liveProgress.run as any).current_step : null;
  const currentStepLabel = currentStep ? (STEP_LABELS[currentStep] || currentStep) : null;

  // Static message based on progress
  const statusMessage = currentStepLabel
    ? `${currentStepLabel}...`
    : progress >= 80
    ? 'Finalizing...'
    : progress >= 50
    ? 'Analyzing data...'
    : 'Starting pipeline...';

  return (
    <div className="space-y-6 py-8">
      <div className="flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <PlaybookIcon size={28} className={config.color} />
        </div>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted ${config.color} mb-2`}>
          {config.label} Playbook
        </span>
        <h3 className="text-base font-semibold mb-1">Running Intelligence Pipeline</h3>
        <p className="text-sm text-muted-foreground">
          {statusMessage}
        </p>
      </div>
      <div className="max-w-md mx-auto">
        <Progress value={hasLiveData ? progress : undefined} className="h-2 mb-4" />
        {hasLiveData && liveProgress.steps?.length > 0 && (
          <StepProgressBar steps={liveProgress.steps} />
        )}
      </div>
    </div>
  );
}

function getPlaybookType(clientType: string): string {
  const ct = (clientType || '').toLowerCase();
  if (ct.includes('hedge fund') || ct.includes('asset manager') || ct.includes('investment') || ct.includes('fund') || ct.includes('mutual') || ct.includes('etf')) return 'fund_strategy';
  if (ct.includes('bank') || ct.includes('financial')) return 'financial_institution';
  if (ct.includes('vendor') || ct.includes('partner') || ct.includes('data provider')) return 'partnership';
  return 'corporate';
}

function FreshnessIndicator({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    fresh: { label: 'Fresh', color: 'bg-success/10 text-success', icon: CheckCircle2 },
    aging: { label: 'Aging', color: 'bg-warning/10 text-warning', icon: Clock },
    stale: { label: 'Stale', color: 'bg-destructive/10 text-destructive', icon: AlertTriangle },
    new_source_available: { label: 'New Source Available', color: 'bg-info/10 text-info', icon: Zap },
    no_data: { label: 'No Data', color: 'bg-muted text-muted-foreground', icon: Search },
  };
  const c = config[status] || config.no_data;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${c.color}`}>
      <Icon size={10} /> {c.label}
    </span>
  );
}

function StepProgressBar({ steps }: { steps: any[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {steps.map((s) => (
        <div key={s.id} className="flex items-center gap-2 text-xs">
          <span className={`w-2 h-2 rounded-full shrink-0 ${
            s.step_status === 'completed' ? 'bg-success' :
            s.step_status === 'running' ? 'bg-primary animate-pulse' :
            s.step_status === 'failed' ? 'bg-destructive' :
            'bg-muted-foreground/30'
          }`} />
          <span className={`flex-1 ${s.step_status === 'running' ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
            {STEP_LABELS[s.step_name] || s.step_name}
          </span>
          {s.output_summary && s.step_status === 'completed' && (
            <span className="text-[10px] text-muted-foreground truncate max-w-48">{s.output_summary}</span>
          )}
          {s.step_status === 'running' && <Loader2 size={10} className="animate-spin text-primary" />}
          {s.step_status === 'failed' && <span className="text-[10px] text-destructive">Failed</span>}
        </div>
      ))}
    </div>
  );
}

function SECUpdateCard({ clientId, clientName, summary, onUpdate }: {
  clientId: string;
  clientName: string;
  summary: any;
  onUpdate: () => void;
}) {
  const checkFreshness = useCheckSECFreshness();
  const [freshnessResult, setFreshnessResult] = useState<SECFreshnessResult | null>(null);

  const handleCheck = async () => {
    const result = await checkFreshness.mutateAsync({ clientId });
    setFreshnessResult(result);
  };

  const showNewFiling = summary?.new_source_available || freshnessResult?.new_filing_available;
  const newMeta = summary?.new_source_metadata || {};
  const filingDate = freshnessResult?.latest_filing_available?.date || newMeta.filing_date;
  const filingUrl = freshnessResult?.latest_filing_available?.url || newMeta.filing_url;

  if (showNewFiling) {
    return (
      <div className="border border-info/30 bg-info/5 rounded-lg px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <Zap size={14} className="text-info" />
          <span className="text-sm font-medium text-foreground">New SEC Filing Available</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
          <span>Filing date: <span className="text-foreground font-medium">{filingDate}</span></span>
          {filingUrl && (
            <a href={filingUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
              View Filing <ExternalLink size={10} />
            </a>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onUpdate} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90">
            <RefreshCw size={11} /> Update Intelligence Now
          </button>
          <button className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md">
            Ignore for Now
          </button>
          {filingUrl && (
            <a href={filingUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md">
              <Eye size={11} /> Review First
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleCheck}
      disabled={checkFreshness.isPending}
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
    >
      {checkFreshness.isPending ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
      Check for new SEC filings
    </button>
  );
}

export default function AccountIntelligenceTab({ clientId, clientName, clientType }: Props) {
  const qc = useQueryClient();
  const [forceProcessing, setForceProcessing] = useState(false);
  const [sawProcessingRun, setSawProcessingRun] = useState(false);
  const { data: intelligence, isLoading } = useLatestIntelligenceResult(clientId);
  const { data: runs = [], dataUpdatedAt: runsUpdatedAt } = useIntelligenceRuns(clientId, forceProcessing);
  const { data: summary } = useIntelligenceSummary(clientId);
  const { data: productFits = [] } = useProductFitAnalyses(clientId);
  const { data: exposure = [] } = useFundExposure(clientId);
  const { data: entityResolution } = useEntityResolution(clientId);
  const generateMutation = useGenerateIntelligence();
  const { open: openOpportunity } = useQuickCreate();
  const [holdingsExpanded, setHoldingsExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [stepsExpanded, setStepsExpanded] = useState(false);
  const [productFitExpanded, setProductFitExpanded] = useState(true);

  const playbookType = getPlaybookType(clientType);
  const config = PLAYBOOK_CONFIG[playbookType] || PLAYBOOK_CONFIG.corporate;
  const PlaybookIcon = config.icon;
  const isSECRelevant = playbookType === 'fund_strategy';

  // Track active processing run for live progress
  const processingRun = runs.find((r) => r.run_status === 'processing');
  const { data: liveProgress } = useIntelligenceRunRealtime(processingRun?.id);

  // Soft warning if SEC entity not resolved (no longer blocks generation)
  const entityUnresolved = isSECRelevant && (!entityResolution ||
    (entityResolution.resolution_status !== 'auto_matched' &&
     entityResolution.resolution_status !== 'manually_confirmed' &&
     entityResolution.resolution_status !== 'rejected'));

  const handleGenerate = (reason?: string) => {
    setForceProcessing(true);
    setSawProcessingRun(false);
    generateMutation.mutate({ clientId, clientName, runReason: reason || 'manual' });
    // Immediately start polling by invalidating runs
    setTimeout(() => qc.invalidateQueries({ queryKey: ['fund-intelligence-runs', clientId] }), 1000);
    setTimeout(() => qc.invalidateQueries({ queryKey: ['fund-intelligence-runs', clientId] }), 3000);
  };

  const isProcessing = generateMutation.isPending || !!processingRun || forceProcessing;

  // Track when we first see a processing run
  useEffect(() => {
    if (forceProcessing && processingRun) {
      setSawProcessingRun(true);
    }
  }, [forceProcessing, processingRun]);

  // Only clear forceProcessing once we've seen a processing run AND it's gone
  useEffect(() => {
    if (forceProcessing && sawProcessingRun && !processingRun && !generateMutation.isPending) {
      // Run finished — refresh all data
      const timer = setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['fund-intelligence-latest', clientId] });
        qc.invalidateQueries({ queryKey: ['intelligence-summary', clientId] });
        qc.invalidateQueries({ queryKey: ['product-fit-analyses', clientId] });
        setForceProcessing(false);
        setSawProcessingRun(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [processingRun, generateMutation.isPending, forceProcessing, sawProcessingRun]);

  // Show live progress during processing
  if (isProcessing) {
    return <IntelligenceProgressView liveProgress={liveProgress} config={config} PlaybookIcon={PlaybookIcon} />;
  }

  // No intelligence yet
  if (!isLoading && !intelligence?.result) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        {/* Entity Resolution Card — shown for all account types */}
        <div className="w-full max-w-lg">
          <EntityResolutionCard clientId={clientId} clientName={clientName} clientType={clientType} />
        </div>

        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <PlaybookIcon size={28} className={config.color} />
        </div>
        <div className="text-center max-w-md">
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted ${config.color}`}>
              {config.label} Playbook
            </span>
          </div>
          <h3 className="text-base font-semibold mb-1">Account Intelligence</h3>
          <p className="text-sm text-muted-foreground mb-4">{config.description}</p>
          {entityUnresolved && (
            <p className="text-xs text-muted-foreground mb-2">SEC entity not resolved — intelligence will run without holdings data.</p>
          )}
          <button onClick={() => handleGenerate()} disabled={isProcessing}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 mx-auto">
            {isProcessing ? <><Loader2 size={14} className="animate-spin" /> Analyzing…</> : <><Sparkles size={14} /> Generate Intelligence</>}
          </button>
        </div>
        {runs.some((r) => r.run_status === 'failed') && (
          <p className="text-xs text-destructive mt-2">Last run failed: {runs.find((r) => r.run_status === 'failed')?.error_message}</p>
        )}
      </div>
    );
  }

  if (isLoading) return <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>;

  const { result, run, holdings } = intelligence!;
  if (!result || !run) return null;

  const relevantDatasets = result.relevant_datasets_json || [];
  const personas = result.suggested_target_personas_json || [];
  const engagementPlan = result.suggested_engagement_plan_json || [];
  const runPlaybook = (run as any).playbook_type || playbookType;
  const runConfig = PLAYBOOK_CONFIG[runPlaybook] || PLAYBOOK_CONFIG.corporate;
  const RunIcon = runConfig.icon;

  return (
    <div className="space-y-5">
      {/* Entity Resolution (compact for resolved) */}
      <EntityResolutionCard clientId={clientId} clientName={clientName} clientType={clientType} />

      {/* Web Enrichment */}
      <WebEnrichmentSection clientId={clientId} />

      {/* Intelligence Status Bar */}
      <div className="flex items-center justify-between bg-muted/50 rounded-lg px-4 py-2.5">
        <div className="flex items-center gap-3">
          <RunIcon size={14} className={runConfig.color} />
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted ${runConfig.color}`}>{runConfig.label}</span>
          {run.filing_type === '13F' && (
            <span className="text-xs font-medium">{run.filing_type} · {run.filing_date || '—'}</span>
          )}
          <span className="text-xs text-muted-foreground">via {run.filing_source}</span>
          {run.filing_url && (
            <a href={run.filing_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
              View Filing <ExternalLink size={10} />
            </a>
          )}
        </div>
        <div className="flex items-center gap-3">
          {summary && <FreshnessIndicator status={summary.freshness_status} />}
          <span className="text-[10px] text-muted-foreground">
            Generated {new Date(run.generated_at || run.created_at).toLocaleDateString()}
          </span>
          <button onClick={() => handleGenerate()} disabled={isProcessing}
            className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50">
            {isProcessing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Regenerate
          </button>
        </div>
      </div>

      {/* SEC Update Decision Card */}
      {playbookType === 'fund_strategy' && (
        <SECUpdateCard
          clientId={clientId}
          clientName={clientName}
          summary={summary}
          onUpdate={() => handleGenerate('sec_update')}
        />
      )}

      {/* Confidence + Version */}
      <div className="flex items-center gap-2">
        <ConfidenceBadge score={result.confidence_score} />
        {holdings.length > 0 && <span className="text-[10px] text-muted-foreground">Based on {holdings.length} holdings</span>}
        {(run as any).run_reason && (
          <span className="text-[10px] text-muted-foreground">· Run reason: {(run as any).run_reason}</span>
        )}
      </div>

      {/* Strategy Summary */}
      <section className="data-card">
        <div className="flex items-center gap-2 mb-2"><Brain size={14} className="text-primary" /><h3 className="text-sm font-semibold">Strategy Summary</h3></div>
        <p className="text-sm text-foreground leading-relaxed">{result.strategy_summary}</p>
      </section>

      {/* Sector & Theme */}
      <div className="grid grid-cols-2 gap-4">
        <section className="data-card">
          <div className="flex items-center gap-2 mb-2"><BarChart3 size={14} className="text-info" /><h3 className="text-sm font-semibold">Sector Exposure</h3></div>
          <p className="text-sm text-muted-foreground leading-relaxed">{result.sector_exposure_summary}</p>
        </section>
        <section className="data-card">
          <div className="flex items-center gap-2 mb-2"><TrendingUp size={14} className="text-warning" /><h3 className="text-sm font-semibold">{runPlaybook === 'partnership' ? 'Partnership Themes' : 'Portfolio Themes'}</h3></div>
          <p className="text-sm text-muted-foreground leading-relaxed">{result.portfolio_theme_summary}</p>
        </section>
      </div>

      {/* Product Fit Analysis (unified: structured scores + AI reasoning) */}
      <UnifiedProductFitSection productFits={productFits} relevantDatasets={relevantDatasets} expanded={productFitExpanded} onToggle={() => setProductFitExpanded(!productFitExpanded)} />

      {/* Recommended Approach + Messaging */}
      <section className="data-card">
        <div className="flex items-center gap-2 mb-2"><Shield size={14} className="text-primary" /><h3 className="text-sm font-semibold">Recommended Approach</h3></div>
        <p className="text-sm text-foreground leading-relaxed">{result.recommended_approach}</p>
      </section>
      <section className="data-card">
        <div className="flex items-center gap-2 mb-2"><MessageSquare size={14} className="text-accent-foreground" /><h3 className="text-sm font-semibold">Suggested Messaging</h3></div>
        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{result.suggested_messaging}</p>
      </section>

      {/* Personas + Engagement */}
      <div className="grid grid-cols-2 gap-4">
        <section className="data-card">
          <div className="flex items-center gap-2 mb-3"><Users size={14} className="text-info" /><h3 className="text-sm font-semibold">Target Personas</h3></div>
          <div className="space-y-2">
            {personas.map((p, i) => (
              <div key={i} className="bg-muted/50 rounded-lg px-3 py-2">
                <p className="text-sm font-medium">{p.title}</p>
                <p className="text-xs text-muted-foreground">{p.reason}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="data-card">
          <div className="flex items-center gap-2 mb-3"><ListChecks size={14} className="text-success" /><h3 className="text-sm font-semibold">Engagement Plan</h3></div>
          <div className="space-y-2">
            {engagementPlan.map((step, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-bold text-primary">{step.step}</span>
                </div>
                <div>
                  <p className="text-sm font-medium">{step.action}</p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                  <p className="text-[10px] text-muted-foreground">{step.timing}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={() => openOpportunity({ client_id: clientId })}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90">
          <PlusCircle size={13} /> Create Opportunity
        </button>
      </div>

      {/* Coverage Overlap */}
      <CoverageOverlapSection exposure={exposure} relevantDatasets={relevantDatasets} />

      {run && (
        <PipelineStepsSection runId={run.id} expanded={stepsExpanded} onToggle={() => setStepsExpanded(!stepsExpanded)} />
      )}

      {/* Holdings */}
      {holdings.length > 0 && (
        <section className="data-card">
          <button onClick={() => setHoldingsExpanded(!holdingsExpanded)} className="flex items-center gap-2 w-full text-left">
            {holdingsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <h3 className="text-sm font-semibold">Holdings Snapshot</h3>
            <span className="text-[10px] text-muted-foreground ml-auto">{holdings.length} positions</span>
          </button>
          {holdingsExpanded && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-1.5 pr-3">Issuer</th><th className="text-left py-1.5 pr-3">Ticker</th>
                  <th className="text-right py-1.5 pr-3">Value</th><th className="text-right py-1.5">Weight</th>
                </tr></thead>
                <tbody>
                  {holdings.map((h) => (
                    <tr key={h.id} className="border-b border-border/50">
                      <td className="py-1.5 pr-3 font-medium">{h.issuer_name}</td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{h.ticker || '—'}</td>
                      <td className="py-1.5 pr-3 text-right font-mono">{formatHoldingValue(Number(h.position_value))}</td>
                      <td className="py-1.5 text-right font-mono">{Number(h.portfolio_weight).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Run History */}
      {runs.length > 1 && (
        <section>
          <button onClick={() => setHistoryExpanded(!historyExpanded)} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
            {historyExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {runs.length} intelligence versions
          </button>
          {historyExpanded && (
            <div className="mt-2 space-y-1">
              {runs.map((r) => (
                <div key={r.id} className="flex items-center gap-3 text-xs py-1">
                  <span className={`w-2 h-2 rounded-full ${r.run_status === 'completed' ? 'bg-success' : r.run_status === 'failed' ? 'bg-destructive' : 'bg-warning animate-pulse'}`} />
                  <span>{r.filing_type} · {r.filing_date || '—'}</span>
                  <span className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                  <span className="text-muted-foreground">{r.run_status}</span>
                  {(r as any).run_reason && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{(r as any).run_reason}</span>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function PipelineStepsSection({ runId, expanded, onToggle }: { runId: string; expanded: boolean; onToggle: () => void }) {
  const { data: steps = [] } = useRunSteps(runId);
  if (steps.length === 0) return null;

  return (
    <section className="data-card">
      <button onClick={onToggle} className="flex items-center gap-2 w-full text-left">
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <h3 className="text-sm font-semibold">Pipeline Steps</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">
          {steps.filter(s => s.step_status === 'completed').length}/{steps.length} completed
        </span>
      </button>
      {expanded && <div className="mt-3"><StepProgressBar steps={steps} /></div>}
    </section>
  );
}

function ConfidenceBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-success/10 text-success' : score >= 40 ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground';
  const label = score >= 70 ? 'High Confidence' : score >= 40 ? 'Medium Confidence' : 'Low Confidence';
  return <span className={`status-badge ${color} text-[10px]`}>{label} · {score}%</span>;
}

export function UnifiedProductFitSection({ productFits, relevantDatasets, expanded, onToggle }: {
  productFits: any[];
  relevantDatasets: RelevantDataset[];
  expanded: boolean;
  onToggle: () => void;
}) {
  // Merge product fits and AI relevance by matching on dataset name/ID
  const merged = (() => {
    const items: { name: string; fit?: any; relevance?: RelevantDataset }[] = [];
    const seen = new Set<string>();

    for (const pf of productFits) {
      const name = pf.datasets?.name || 'Unknown Product';
      const key = name.toLowerCase();
      const matchedRelevance = relevantDatasets.find((rd) =>
        rd.dataset_name?.toLowerCase() === key || rd.dataset_id === pf.product_id
      );
      items.push({ name, fit: pf, relevance: matchedRelevance });
      seen.add(key);
      if (matchedRelevance) seen.add(matchedRelevance.dataset_name?.toLowerCase());
    }

    for (const rd of relevantDatasets) {
      if (!seen.has(rd.dataset_name?.toLowerCase())) {
        items.push({ name: rd.dataset_name, relevance: rd });
      }
    }

    return items.sort((a, b) => {
      const scoreA = a.fit?.fit_score ?? a.relevance?.relevance_score ?? 0;
      const scoreB = b.fit?.fit_score ?? b.relevance?.relevance_score ?? 0;
      return scoreB - scoreA;
    });
  })();

  if (merged.length === 0) return null;

  return (
    <section className="data-card">
      <button onClick={onToggle} className="flex items-center gap-2 w-full text-left">
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Target size={14} className="text-success" />
        <h3 className="text-sm font-semibold">Product Fit Analysis</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">{merged.length} products analyzed</span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-2">
          {merged.map((item, idx) => {
            const fitScore = item.fit?.fit_score;
            const relevanceScore = item.relevance?.relevance_score || 0;
            const displayScore = fitScore ?? relevanceScore;
            const badgeColor = displayScore >= 60 ? 'bg-success/10 text-success' : displayScore >= 30 ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground';
            const barColor = relevanceScore >= 70 ? 'bg-success' : relevanceScore >= 40 ? 'bg-warning' : 'bg-muted-foreground';

            // Merge supporting entities from both sources
            const entities: string[] = [];
            if (item.fit?.supporting_entities_json) {
              for (const e of item.fit.supporting_entities_json.slice(0, 5)) entities.push(e.company || e);
            }
            if (item.relevance?.supporting_holdings) {
              for (const h of item.relevance.supporting_holdings) {
                if (!entities.includes(h)) entities.push(h);
              }
            }

            return (
              <div key={item.fit?.id || idx} className="bg-muted/30 rounded-lg px-4 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold">{item.name}</span>
                  <span className={`status-badge text-[10px] ${badgeColor}`}>
                    {displayScore}% {fitScore != null ? 'fit' : 'relevance'}
                  </span>
                </div>
                {item.fit && (
                  <div className="flex gap-4 text-[10px] text-muted-foreground mb-1.5">
                    <span>Coverage: {item.fit.coverage_overlap_score}%</span>
                    <span>Sector: {item.fit.sector_relevance_score}%</span>
                    <span>Timing: {item.fit.timing_score}%</span>
                  </div>
                )}
                {relevanceScore > 0 && (
                  <div className="w-full h-1 bg-muted rounded-full mb-2">
                    <div className={`h-1 rounded-full ${barColor}`} style={{ width: `${Math.min(relevanceScore, 100)}%` }} />
                  </div>
                )}
                {item.relevance?.reason && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.relevance.reason}</p>
                )}
                {!item.relevance?.reason && item.fit?.evidence_summary && (
                  <p className="text-xs text-muted-foreground">{item.fit.evidence_summary}</p>
                )}
                {entities.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {entities.slice(0, 6).map((e, i) => (
                      <span key={i} className="text-[10px] bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">{e}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DatasetRelevanceCard({ dataset }: { dataset: RelevantDataset }) {
  const score = dataset.relevance_score || 0;
  const barColor = score >= 70 ? 'bg-success' : score >= 40 ? 'bg-warning' : 'bg-muted-foreground';
  const badgeColor = score >= 70 ? 'bg-success/10 text-success' : score >= 40 ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground';

  return (
    <div className="bg-muted/30 rounded-lg px-4 py-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-semibold">{dataset.dataset_name}</span>
        <span className={`status-badge ${badgeColor} text-[10px]`}>{score}%</span>
      </div>
      <div className="w-full h-1 bg-muted rounded-full mb-2">
        <div className={`h-1 rounded-full ${barColor}`} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{dataset.reason}</p>
      {dataset.supporting_holdings && dataset.supporting_holdings.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {dataset.supporting_holdings.slice(0, 5).map((h, i) => (
            <span key={i} className="text-[10px] bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">{h}</span>
          ))}
        </div>
      )}
    </div>
  );
}
