import { useState, useMemo } from 'react';
import { Zap, Loader2, CheckCircle2, AlertTriangle, Brain, BarChart3, RefreshCw } from 'lucide-react';
import { useClients } from '@/hooks/useCrmData';
import { useUpdateCampaign } from '@/hooks/useCampaigns';
import { useDb } from '@relai/db/react';
import { toast } from 'sonner';

type Priority = 'high' | 'medium' | 'low' | 'off';
const priorityWeights: Record<Priority, number> = { high: 3, medium: 2, low: 1, off: 0 };
const priorityColors: Record<Priority, string> = {
  high: 'bg-success/10 text-success border-success/30',
  medium: 'bg-warning/10 text-warning border-warning/30',
  low: 'bg-muted text-muted-foreground border-border',
  off: 'bg-transparent text-muted-foreground/40 border-border/50',
};

const dimensions = [
  { key: 'product_relevance', label: 'Product Relevance', desc: 'Product-data needs match', defaultPriority: 'high' as Priority },
  { key: 'timing_signal', label: 'Timing Signal', desc: 'Right time indicators', defaultPriority: 'medium' as Priority },
  { key: 'relationship_strength', label: 'Relationship', desc: 'Contacts & engagement quality', defaultPriority: 'medium' as Priority },
  { key: 'strategic_fit', label: 'Strategic Fit', desc: 'Ideal customer alignment', defaultPriority: 'low' as Priority },
  { key: 'conversion_likelihood', label: 'Conversion', desc: 'Win probability', defaultPriority: 'medium' as Priority },
];

function prioritiesToWeights(priorities: Record<string, Priority>): Record<string, number> {
  const raw: Record<string, number> = {};
  let total = 0;
  for (const d of dimensions) {
    const p = priorities[d.key] || 'off';
    raw[d.key] = priorityWeights[p];
    total += priorityWeights[p];
  }
  if (total === 0) return Object.fromEntries(dimensions.map(d => [d.key, 20]));
  const weights: Record<string, number> = {};
  let assigned = 0;
  const entries = dimensions.filter(d => raw[d.key] > 0);
  entries.forEach((d, i) => {
    if (i === entries.length - 1) {
      weights[d.key] = 100 - assigned;
    } else {
      weights[d.key] = Math.round((raw[d.key] / total) * 100);
      assigned += weights[d.key];
    }
  });
  for (const d of dimensions) {
    if (!weights[d.key]) weights[d.key] = 0;
  }
  return weights;
}

export default function CampaignScoringPanel({ campaign, targets, onComplete }: {
  campaign: any;
  targets: any[];
  onComplete?: () => void;
}) {
  const db = useDb();
  const { data: clients = [] } = useClients();
  const updateCampaign = useUpdateCampaign();
  const [scoringNew, setScoringNew] = useState(false);
  const [scoringRescore, setScoringRescore] = useState(false);
  const scoring = scoringNew || scoringRescore;
  const [result, setResult] = useState<{ targets_created: number; eligible_count: number; scored_count: number; rescored_count?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const savedWeights = campaign.scoring_weights || {};
  const [priorities, setPriorities] = useState<Record<string, Priority>>(() => {
    // Reconstruct priorities from saved weights, or use defaults
    const p: Record<string, Priority> = {};
    for (const d of dimensions) {
      const w = savedWeights[d.key];
      if (w === 0 || w === undefined) p[d.key] = w === 0 ? 'off' : d.defaultPriority;
      else if (w >= 25) p[d.key] = 'high';
      else if (w >= 15) p[d.key] = 'medium';
      else p[d.key] = 'low';
    }
    return p;
  });

  const weights = prioritiesToWeights(priorities);
  const activeDimensions = dimensions.filter(d => priorities[d.key] !== 'off');
  const isValid = activeDimensions.length > 0;

  const existingTargetCount = targets.length;

  const types = campaign.target_account_types || [];
  const geos = campaign.target_geographies || [];
  const existingIds = new Set(targets.map((t: any) => t.client_id).filter(Boolean));

  const eligiblePreview = clients.filter((c: any) => {
    if (existingIds.has(c.id)) return false;
    if (types.length > 0 && !types.includes(c.client_type)) return false;
    if (!campaign.include_existing_clients && c.relationship_status === 'Active Client') return false;
    if (!campaign.include_prospects && c.relationship_status === 'Prospect') return false;
    if (geos.length > 0 && c.headquarters_country && !geos.includes(c.headquarters_country)) return false;
    return true;
  });

  // Intelligence coverage analysis
  const intelCoverage = useMemo(() => {
    const withIntel = targets.filter((t: any) => {
      const pf = t.product_fit_analysis || {};
      return pf.coverage_overlap_score > 0 || pf.supporting_companies?.length > 0;
    }).length;
    const firmographicOnly = targets.length - withIntel;
    return { withIntel, firmographicOnly, total: targets.length };
  }, [targets]);

  const runScoring = async (rescore = false) => {
    if (rescore) setScoringRescore(true); else setScoringNew(true);
    setError(null);
    try {
      if (JSON.stringify(weights) !== JSON.stringify(savedWeights)) {
        await updateCampaign.mutateAsync({ id: campaign.id, scoring_weights: weights });
      }

      const { data, error: fnErr } = await db.invoke('campaign-scoring', { campaign_id: campaign.id, rescore });

      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);

      setResult(data);
      if (rescore) {
        toast.success(`Re-scored ${data.rescored_count || data.targets_created} targets with updated weights`);
      } else {
        toast.success(`AI scored ${data.targets_created} accounts`);
      }
      onComplete?.();
    } catch (e: any) {
      const msg = e.message || 'Scoring failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setScoringNew(false);
      setScoringRescore(false);
    }
  };

  const cyclePriority = (key: string) => {
    const order: Priority[] = ['high', 'medium', 'low', 'off'];
    const current = priorities[key] || 'medium';
    const next = order[(order.indexOf(current) + 1) % order.length];
    setPriorities(prev => ({ ...prev, [key]: next }));
  };

  return (
    <div className="space-y-5">
      {/* Intelligence Coverage — show when targets exist */}
      {intelCoverage.total > 0 && (
        <div className="data-card border-l-2 border-l-primary">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Intelligence Coverage</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <Brain size={12} className="text-primary" />
                <p className="text-lg font-bold font-mono text-primary">{intelCoverage.withIntel}</p>
              </div>
              <p className="text-[10px] text-muted-foreground">Intel-Backed</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold font-mono text-muted-foreground">{intelCoverage.firmographicOnly}</p>
              <p className="text-[10px] text-muted-foreground">Firmographic Only</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold font-mono">
                {intelCoverage.total > 0 ? Math.round((intelCoverage.withIntel / intelCoverage.total) * 100) : 0}%
              </p>
              <p className="text-[10px] text-muted-foreground">Coverage Rate</p>
            </div>
          </div>
      {intelCoverage.firmographicOnly > 0 && (
            <div className="mt-2 text-center">
              <p className="text-[10px] text-warning">
                {intelCoverage.firmographicOnly} targets scored without company intelligence
              </p>
              <button
                onClick={async () => {
                  const firmTargets = targets.filter((t: any) => {
                    const pf = t.product_fit_analysis || {};
                    return !(pf.coverage_overlap_score > 0 || pf.supporting_companies?.length > 0);
                  });
                  const clientIds = firmTargets.map((t: any) => t.client_id).filter(Boolean);
                  if (clientIds.length === 0) return;
                  toast.info(`Triggering intelligence for ${clientIds.length} accounts...`);
                  let ok = 0;
                  for (const cid of clientIds.slice(0, 10)) {
                    try {
                      await db.invoke('fund-intelligence', { client_id: cid });
                      ok++;
                    } catch { /* continue */ }
                  }
                  toast.success(`Intelligence triggered for ${ok} accounts. Re-score after runs complete.`);
                }}
                className="mt-1 text-[10px] text-primary hover:underline inline-flex items-center gap-1"
              >
                <Brain size={10} /> Auto-trigger intelligence for these accounts
              </button>
            </div>
          )}
        </div>
      )}

      {/* Scoring Framework — priority-based */}
      <div className="data-card">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Scoring Priorities</p>
          <span className="text-[10px] text-muted-foreground">{activeDimensions.length} of {dimensions.length} active · Click to cycle</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {dimensions.map(d => {
            const p = priorities[d.key] || 'off';
            return (
              <button
                key={d.key}
                onClick={() => cyclePriority(d.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-all ${priorityColors[p]} ${p === 'off' ? 'opacity-50 line-through' : ''}`}
                title={`${d.desc} — ${p === 'off' ? 'Disabled' : p} priority (${weights[d.key]}%)`}
              >
                <span className="font-medium">{d.label}</span>
                {p !== 'off' && (
                  <span className="text-[9px] font-mono uppercase">{p}</span>
                )}
              </button>
            );
          })}
        </div>
        {!isValid && (
          <p className="text-[10px] text-destructive mt-2">Enable at least one dimension</p>
        )}
      </div>

      {/* Eligibility Preview */}
      <div className="data-card">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Eligibility Preview</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-lg font-bold font-mono">{clients.length}</p>
            <p className="text-[10px] text-muted-foreground">Total Accounts</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold font-mono text-primary">{eligiblePreview.length}</p>
            <p className="text-[10px] text-muted-foreground">Eligible</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold font-mono">{campaign.max_targets || 25}</p>
            <p className="text-[10px] text-muted-foreground">Max Targets</p>
          </div>
        </div>
        {existingTargetCount > 0 && (
          <p className="text-[11px] text-warning mt-2 text-center">
            {existingTargetCount} targets already added — AI will score remaining eligible accounts
          </p>
        )}
      </div>

      {/* Intelligence Pipeline — compact */}
      <div className="data-card py-2.5 px-4">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="font-medium text-foreground/70">Pipeline:</span>
          <span>Company Intel</span><span className="text-muted-foreground/40">→</span>
          <span>Product Fit</span><span className="text-muted-foreground/40">→</span>
          <span>Evidence</span><span className="text-muted-foreground/40">→</span>
          <span>Persona</span><span className="text-muted-foreground/40">→</span>
          <span>Messaging</span>
        </div>
      </div>

      {/* Action / Result */}
      <div className="data-card text-center py-6">
        {result ? (
          <>
            <CheckCircle2 size={32} className="mx-auto text-success mb-3" />
            <p className="text-sm font-semibold">Scoring Complete</p>
            <p className="text-xs text-muted-foreground mt-1">
              {result.rescored_count
                ? `${result.rescored_count} existing targets re-scored with updated weights`
                : `${result.targets_created} accounts scored and ranked from ${result.eligible_count} eligible`
              }
            </p>
            <p className="text-[11px] text-muted-foreground mt-2">
              Switch to the <span className="text-primary font-medium">Targets</span> tab to review evidence and rankings
            </p>
          </>
        ) : error ? (
          <>
            <AlertTriangle size={32} className="mx-auto text-warning mb-3" />
            <p className="text-sm font-medium">Scoring Failed</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">{error}</p>
            <button
              onClick={() => runScoring(false)}
              disabled={scoring}
              className="mt-4 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
            >
              Retry
            </button>
          </>
        ) : (
          <>
            <Zap size={32} className="mx-auto text-primary mb-3" />
            <p className="text-sm font-semibold mb-1">
              {existingTargetCount > 0 ? 'Score New Accounts or Re-Score Existing' : 'Run AI Account Scoring'}
            </p>
            <p className="text-xs text-muted-foreground mb-5 max-w-md mx-auto">
              {existingTargetCount > 0
                ? `${eligiblePreview.length} new accounts available to score. ${existingTargetCount} existing targets can be re-scored with updated weights.`
                : `The AI will evaluate ${eligiblePreview.length} eligible accounts against your campaign parameters, score them on ${defaultWeights.length} dimensions, and produce structured evidence for each target.`
              }
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => runScoring(false)}
                disabled={scoring || eligiblePreview.length === 0 || !isValid}
                className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {scoringNew ? (
                  <><Loader2 size={14} className="animate-spin" /> Scoring...</>
                ) : (
                  <><Zap size={14} /> Score New Accounts</>
                )}
              </button>
              {existingTargetCount > 0 && (
                <button
                  onClick={() => runScoring(true)}
                  disabled={scoring || !isValid}
                  className="px-5 py-2.5 rounded-lg bg-muted text-foreground text-sm font-medium hover:bg-muted/80 disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {scoringRescore ? (
                    <><Loader2 size={14} className="animate-spin" /> Re-scoring...</>
                  ) : (
                    <><RefreshCw size={14} /> Re-Score {existingTargetCount} Targets</>
                  )}
                </button>
              )}
            </div>
            {eligiblePreview.length === 0 && existingTargetCount === 0 && (
              <p className="text-[11px] text-destructive mt-2">No eligible accounts match your campaign criteria</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
