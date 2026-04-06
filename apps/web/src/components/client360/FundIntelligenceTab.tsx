import { useState } from 'react';
import {
  useLatestIntelligenceResult,
  useIntelligenceRuns,
  useGenerateIntelligence,
  useProductFitAnalyses,
  type RelevantDataset,
  type TargetPersona,
  type EngagementStep,
  type HoldingSnapshot,
} from '@/hooks/useFundIntelligence';
import { UnifiedProductFitSection } from './AccountIntelligenceTab';
import { useFundExposure, type FundExposureRow } from '@/hooks/useFundExposure';
import { useQuickCreate } from '@/contexts/QuickCreateContext';
import CoverageOverlapSection from './CoverageOverlapSection';
import {
  Brain, Loader2, ExternalLink, RefreshCw, Target,
  MessageSquare, Users, ListChecks, BarChart3, Shield,
  TrendingUp, ChevronDown, ChevronRight, Sparkles, FileText, PlusCircle,
  Layers, Eye,
} from 'lucide-react';

interface Props {
  clientId: string;
  clientName: string;
}

function formatHoldingValue(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

export default function FundIntelligenceTab({ clientId, clientName }: Props) {
  const { data: intelligence, isLoading } = useLatestIntelligenceResult(clientId);
  const { data: runs = [] } = useIntelligenceRuns(clientId);
  const { data: exposure = [] } = useFundExposure(clientId);
  const { data: productFits = [] } = useProductFitAnalyses(clientId);
  const generateMutation = useGenerateIntelligence();
  const { open: openOpportunity } = useQuickCreate();
  const [holdingsExpanded, setHoldingsExpanded] = useState(false);
  const [exposureExpanded, setExposureExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [productFitExpanded, setProductFitExpanded] = useState(true);

  const handleGenerate = () => {
    generateMutation.mutate({ clientId, clientName });
  };

  const isProcessing = generateMutation.isPending || runs.some((r) => r.run_status === 'processing');

  // No intelligence yet — show prompt
  if (!isLoading && !intelligence?.result) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Brain size={28} className="text-primary" />
        </div>
        <div className="text-center max-w-md">
          <h3 className="text-base font-semibold mb-1">Fund Strategy Intelligence</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Analyze SEC filings to identify investment themes, match your products, and generate a recommended sales approach.
          </p>
          <button
            onClick={handleGenerate}
            disabled={isProcessing}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 mx-auto"
          >
            {isProcessing ? (
              <><Loader2 size={14} className="animate-spin" /> Analyzing…</>
            ) : (
              <><Sparkles size={14} /> Generate Intelligence</>
            )}
          </button>
        </div>
        {runs.some((r) => r.run_status === 'failed') && (
          <p className="text-xs text-destructive mt-2">
            Last run failed: {runs.find((r) => r.run_status === 'failed')?.error_message}
          </p>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { result, run, holdings } = intelligence!;
  if (!result || !run) return null;

  const relevantDatasets = result.relevant_datasets_json || [];
  const personas = result.suggested_target_personas_json || [];
  const engagementPlan = result.suggested_engagement_plan_json || [];

  return (
    <div className="space-y-5">
      {/* Filing Source Bar */}
      <div className="flex items-center justify-between bg-muted/50 rounded-lg px-4 py-2.5">
        <div className="flex items-center gap-3">
          <FileText size={14} className="text-muted-foreground" />
          <div>
            <span className="text-xs font-medium">
              {run.filing_type} Filing · {run.filing_date || 'Date unknown'}
            </span>
            <span className="text-xs text-muted-foreground ml-2">
              via {run.filing_source}
            </span>
          </div>
          {run.filing_url && (
            <a
              href={run.filing_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              View Filing <ExternalLink size={10} />
            </a>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            Generated {new Date(run.generated_at || run.created_at).toLocaleDateString()}
          </span>
          <button
            onClick={handleGenerate}
            disabled={isProcessing}
            className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
          >
            {isProcessing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            Regenerate
          </button>
        </div>
      </div>

      {/* Confidence Badge */}
      <div className="flex items-center gap-2">
        <ConfidenceBadge score={result.confidence_score} />
        <span className="text-[10px] text-muted-foreground">
          Based on {holdings.length} holdings
        </span>
      </div>

      {/* Strategy Summary */}
      <section className="data-card">
        <div className="flex items-center gap-2 mb-2">
          <Brain size={14} className="text-primary" />
          <h3 className="text-sm font-semibold">Strategy Summary</h3>
        </div>
        <p className="text-sm text-foreground leading-relaxed">{result.strategy_summary}</p>
      </section>

      {/* Sector & Theme Exposure */}
      <div className="grid grid-cols-2 gap-4">
        <section className="data-card">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 size={14} className="text-info" />
            <h3 className="text-sm font-semibold">Sector Exposure</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{result.sector_exposure_summary}</p>
        </section>
        <section className="data-card">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={14} className="text-warning" />
            <h3 className="text-sm font-semibold">Portfolio Themes</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{result.portfolio_theme_summary}</p>
        </section>
      </div>

      {/* Product Fit Analysis (unified: structured scores + AI reasoning) */}
      <UnifiedProductFitSection productFits={productFits} relevantDatasets={relevantDatasets} expanded={productFitExpanded} onToggle={() => setProductFitExpanded(!productFitExpanded)} />

      {/* Recommended Approach */}
      <section className="data-card">
        <div className="flex items-center gap-2 mb-2">
          <Shield size={14} className="text-primary" />
          <h3 className="text-sm font-semibold">Recommended Approach</h3>
        </div>
        <p className="text-sm text-foreground leading-relaxed">{result.recommended_approach}</p>
      </section>

      {/* Suggested Messaging */}
      <section className="data-card">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare size={14} className="text-accent-foreground" />
          <h3 className="text-sm font-semibold">Suggested Messaging</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{result.suggested_messaging}</p>
      </section>

      {/* Target Personas + Engagement Plan */}
      <div className="grid grid-cols-2 gap-4">
        <section className="data-card">
          <div className="flex items-center gap-2 mb-3">
            <Users size={14} className="text-info" />
            <h3 className="text-sm font-semibold">Target Personas</h3>
          </div>
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
          <div className="flex items-center gap-2 mb-3">
            <ListChecks size={14} className="text-success" />
            <h3 className="text-sm font-semibold">Engagement Plan</h3>
          </div>
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
        <button
          onClick={() => openOpportunity({ client_id: clientId })}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
        >
          <PlusCircle size={13} /> Create Opportunity
        </button>
      </div>

      {/* Coverage Overlap */}
      <CoverageOverlapSection exposure={exposure} relevantDatasets={relevantDatasets} />

      {/* Effective Exposure (collapsible) */}
      {exposure.length > 0 && (
        <section className="data-card">
          <button
            onClick={() => setExposureExpanded(!exposureExpanded)}
            className="flex items-center gap-2 w-full text-left"
          >
            {exposureExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Layers size={14} className="text-primary" />
            <h3 className="text-sm font-semibold">Effective Exposure</h3>
            <span className="text-[10px] text-muted-foreground ml-auto">{exposure.length} securities · direct + ETF look-through</span>
          </button>
          {exposureExpanded && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-1.5 pr-3">Security</th>
                    <th className="text-left py-1.5 pr-3">Ticker</th>
                    <th className="text-right py-1.5 pr-3">Direct %</th>
                    <th className="text-right py-1.5 pr-3">ETF Implied %</th>
                    <th className="text-right py-1.5 pr-3">Total %</th>
                    <th className="text-left py-1.5">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {exposure.slice(0, 50).map((e: FundExposureRow) => {
                    const hasEtf = e.implied_etf_weight_pct > 0;
                    const hasDirect = e.direct_weight_pct > 0;
                    return (
                      <tr key={e.id} className="border-b border-border/50">
                        <td className="py-1.5 pr-3 font-medium">{e.security?.issuer_name || '—'}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{e.security?.ticker || '—'}</td>
                        <td className="py-1.5 pr-3 text-right font-mono">{hasDirect ? `${Number(e.direct_weight_pct).toFixed(2)}%` : '—'}</td>
                        <td className="py-1.5 pr-3 text-right font-mono text-info">{hasEtf ? `${Number(e.implied_etf_weight_pct).toFixed(2)}%` : '—'}</td>
                        <td className="py-1.5 pr-3 text-right font-mono font-semibold">{Number(e.total_weight_pct).toFixed(2)}%</td>
                        <td className="py-1.5">
                          <div className="flex gap-1">
                            {hasDirect && <span className="text-[9px] px-1 rounded bg-success/10 text-success">direct</span>}
                            {hasEtf && <span className="text-[9px] px-1 rounded bg-info/10 text-info">ETF</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {exposure.length > 50 && (
                <p className="text-[10px] text-muted-foreground text-center mt-2">Showing top 50 of {exposure.length}</p>
              )}
            </div>
          )}
        </section>
      )}

      {/* Holdings Snapshot (collapsible) */}
      {holdings.length > 0 && (
        <section className="data-card">
          <button
            onClick={() => setHoldingsExpanded(!holdingsExpanded)}
            className="flex items-center gap-2 w-full text-left"
          >
            {holdingsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Eye size={14} className="text-muted-foreground" />
            <h3 className="text-sm font-semibold">Raw Holdings Snapshot</h3>
            <span className="text-[10px] text-muted-foreground ml-auto">{holdings.length} positions</span>
          </button>
          {holdingsExpanded && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-1.5 pr-3">Issuer</th>
                    <th className="text-left py-1.5 pr-3">Ticker</th>
                    <th className="text-right py-1.5 pr-3">Value</th>
                    <th className="text-right py-1.5">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => (
                    <tr key={h.id} className="border-b border-border/50">
                      <td className="py-1.5 pr-3 font-medium">{h.issuer_name}</td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{h.ticker || '—'}</td>
                      <td className="py-1.5 pr-3 text-right font-mono">
                        {formatHoldingValue(Number(h.position_value))}
                      </td>
                      <td className="py-1.5 text-right font-mono">
                        {Number(h.portfolio_weight).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Run History (collapsible) */}
      {runs.length > 1 && (
        <section>
          <button
            onClick={() => setHistoryExpanded(!historyExpanded)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {historyExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {runs.length} previous runs
          </button>
          {historyExpanded && (
            <div className="mt-2 space-y-1">
              {runs.map((r) => (
                <div key={r.id} className="flex items-center gap-3 text-xs py-1">
                  <span className={`w-2 h-2 rounded-full ${
                    r.run_status === 'completed' ? 'bg-success' :
                    r.run_status === 'failed' ? 'bg-destructive' :
                    'bg-warning animate-pulse'
                  }`} />
                  <span>{r.filing_type} · {r.filing_date || '—'}</span>
                  <span className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                  <span className="text-muted-foreground">{r.run_status}</span>
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

function ConfidenceBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-success/10 text-success' : score >= 40 ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground';
  const label = score >= 70 ? 'High Confidence' : score >= 40 ? 'Medium Confidence' : 'Low Confidence';
  return (
    <span className={`status-badge ${color} text-[10px]`}>
      {label} · {score}%
    </span>
  );
}

