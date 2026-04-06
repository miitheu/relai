import { useNavigate } from 'react-router-dom';
import { useUpdateCampaignTarget, useCampaignOverlaps } from '@/hooks/useCampaigns';
import { useCreateOpportunity } from '@/hooks/useOpportunities';
import { Building2, ExternalLink, Plus, Zap, ChevronDown, ChevronRight, Users, Target, MessageSquare, BarChart3, Layers, Copy, Check, Brain, Mail, Loader2, List, LayoutGrid, ArrowUpDown, AlertTriangle } from 'lucide-react';
import { useState, useMemo } from 'react';
import AddTargetDialog from './AddTargetDialog';
import { toast } from 'sonner';
import CampaignEmailDraft from './CampaignEmailDraft';

const statusOptions = [
  'not_started', 'outreach_ready', 'contacted', 'engaged',
  'meeting_booked', 'opportunity_opened', 'trial_active',
  'commercial_discussion', 'won', 'lost', 'paused',
];

const statusLabel: Record<string, string> = {
  not_started: 'Not Started',
  outreach_ready: 'Outreach Ready',
  contacted: 'Contacted',
  engaged: 'Engaged',
  meeting_booked: 'Meeting Booked',
  opportunity_opened: 'Opportunity',
  trial_active: 'Trial Active',
  commercial_discussion: 'Commercial',
  won: 'Won',
  lost: 'Lost',
  paused: 'Paused',
};

const statusColor: Record<string, string> = {
  not_started: 'bg-muted text-muted-foreground',
  outreach_ready: 'bg-info/10 text-info',
  contacted: 'bg-info/20 text-info',
  engaged: 'bg-primary/10 text-primary',
  meeting_booked: 'bg-primary/20 text-primary',
  opportunity_opened: 'bg-warning/10 text-warning',
  trial_active: 'bg-warning/20 text-warning',
  commercial_discussion: 'bg-success/10 text-success',
  won: 'bg-success/20 text-success',
  lost: 'bg-destructive/10 text-destructive',
  paused: 'bg-muted text-muted-foreground',
};

function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 80 ? 'bg-success/15 text-success border-success/30' :
    score >= 60 ? 'bg-warning/15 text-warning border-warning/30' :
    score >= 40 ? 'bg-info/15 text-info border-info/30' :
    'bg-muted text-muted-foreground border-border';
  return (
    <span className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded border ${cls}`}>
      {score}
    </span>
  );
}

function CopyableCard({ icon: Icon, iconColor, label, labelColor, borderColor, bgColor, content }: {
  icon: any; iconColor: string; label: string; labelColor: string; borderColor: string; bgColor: string; content: string;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className={`rounded-md border ${borderColor} ${bgColor} p-2.5`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <Icon size={11} className={iconColor} />
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${labelColor}`}>{label}</span>
        </div>
        <button onClick={handleCopy} className="p-0.5 text-muted-foreground hover:text-foreground transition-colors" title="Copy">
          {copied ? <Check size={10} className="text-success" /> : <Copy size={10} />}
        </button>
      </div>
      <p className="text-xs leading-relaxed">{content}</p>
    </div>
  );
}

function DimensionBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] font-mono w-6 text-right">{value}</span>
    </div>
  );
}

function ProductFitPanel({ analysis }: { analysis: any }) {
  if (!analysis || (!analysis.coverage_overlap_score && !analysis.sector_relevance?.length && !analysis.supporting_companies?.length)) {
    return null;
  }

  const overlapScore = analysis.coverage_overlap_score || 0;
  const overlapCls = overlapScore >= 60 ? 'text-success' : overlapScore >= 30 ? 'text-warning' : 'text-muted-foreground';

  return (
    <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Layers size={12} className="text-primary" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/70">Product Fit Analysis</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-center">
          <p className={`text-lg font-bold font-mono ${overlapCls}`}>{overlapScore}%</p>
          <p className="text-[9px] text-muted-foreground">Coverage Overlap</p>
        </div>
        {analysis.product_relevance_score > 0 && (
          <div className="text-center">
            <p className="text-lg font-bold font-mono text-primary">{analysis.product_relevance_score}</p>
            <p className="text-[9px] text-muted-foreground">Product Relevance</p>
          </div>
        )}
      </div>

      {analysis.evidence_summary && (
        <p className="text-xs leading-relaxed text-foreground">{analysis.evidence_summary}</p>
      )}

      {analysis.sector_relevance?.length > 0 && (
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Relevant Sectors</p>
          <div className="flex flex-wrap gap-1">
            {analysis.sector_relevance.map((s: string, i: number) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{s}</span>
            ))}
          </div>
        </div>
      )}

      {analysis.supporting_companies?.length > 0 && (
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Supporting Companies in Portfolio</p>
          <div className="flex flex-wrap gap-1">
            {analysis.supporting_companies.map((c: any, i: number) => {
              const name = typeof c === 'string' ? c : c.name;
              const ticker = typeof c === 'object' ? c.ticker : null;
              return (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground">
                  {name}{ticker ? ` (${ticker})` : ''}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============ TABLE VIEW ============ */
type SortKey = 'fit_score' | 'status' | 'name' | 'overlap';
type SortDir = 'asc' | 'desc';

function TableView({ targets, campaign, onStatusChange, onNavigate }: {
  targets: any[];
  campaign: any;
  onStatusChange: (id: string, status: string) => void;
  onNavigate: (path: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('fit_score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const updateTarget = useUpdateCampaignTarget();

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = useMemo(() => {
    return [...targets].sort((a, b) => {
      const dir = sortDir === 'desc' ? -1 : 1;
      switch (sortKey) {
        case 'fit_score': return ((a.fit_score || 0) - (b.fit_score || 0)) * dir;
        case 'overlap': return ((a.product_fit_analysis?.coverage_overlap_score || 0) - (b.product_fit_analysis?.coverage_overlap_score || 0)) * dir;
        case 'name': {
          const na = a.clients?.name || a.prospect_name || '';
          const nb = b.clients?.name || b.prospect_name || '';
          return na.localeCompare(nb) * dir;
        }
        case 'status': return (statusOptions.indexOf(a.status) - statusOptions.indexOf(b.status)) * dir;
        default: return 0;
      }
    });
  }, [targets, sortKey, sortDir]);

  const toggleAll = () => {
    if (selectedIds.size === targets.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(targets.map(t => t.id)));
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const bulkUpdateStatus = async (status: string) => {
    for (const id of selectedIds) {
      try {
        const now = new Date().toISOString();
        const extras: any = {};
        if (status === 'contacted') extras.contacted_at = now;
        if (status === 'engaged') extras.responded_at = now;
        if (status === 'meeting_booked') extras.meeting_booked_at = now;
        await updateTarget.mutateAsync({ id, campaign_id: campaign.id, status, ...extras });
      } catch { /* continue */ }
    }
    setSelectedIds(new Set());
    toast.success(`Updated ${selectedIds.size} targets`);
  };

  const SortHeader = ({ label, field, className = '' }: { label: string; field: SortKey; className?: string }) => (
    <button onClick={() => toggleSort(field)} className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground ${className}`}>
      {label} <ArrowUpDown size={9} className={sortKey === field ? 'text-primary' : ''} />
    </button>
  );

  return (
    <div>
      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-3 py-2 bg-primary/5 rounded-lg border border-primary/20">
          <span className="text-xs font-medium">{selectedIds.size} selected</span>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
        </div>
      )}

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="w-8 px-2 py-2">
                <input type="checkbox" checked={selectedIds.size === targets.length && targets.length > 0} onChange={toggleAll} className="rounded" />
              </th>
              <th className="text-left px-2 py-2"><SortHeader label="Account" field="name" /></th>
              <th className="text-center px-2 py-2 w-16"><SortHeader label="Score" field="fit_score" /></th>
              <th className="text-center px-2 py-2 w-20"><SortHeader label="Overlap" field="overlap" /></th>
              <th className="text-center px-2 py-2 w-16">Intel</th>
              <th className="text-center px-2 py-2 w-20">Source</th>
              <th className="text-center px-2 py-2 w-28"><SortHeader label="Status" field="status" /></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(t => {
              const client = t.clients;
              const pf = t.product_fit_analysis || {};
              const rationale = t.fit_rationale || {};
              return (
                <tr key={t.id} onClick={() => client && onNavigate(`/clients/${client.id}`)} className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer">
                  <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleOne(t.id)} className="rounded" />
                  </td>
                  <td className="px-2 py-2">
                    <p className="font-medium truncate max-w-[180px]">{client?.name || t.prospect_name || '—'}</p>
                    <p className="text-[10px] text-muted-foreground">{client?.client_type}{client?.headquarters_country ? ` · ${client.headquarters_country}` : ''}</p>
                  </td>
                  <td className="text-center px-2 py-2">{t.fit_score > 0 && <ScoreBadge score={t.fit_score} />}</td>
                  <td className="text-center px-2 py-2 font-mono">
                    {pf.coverage_overlap_score > 0 ? (
                      <span className={pf.coverage_overlap_score >= 60 ? 'text-success' : pf.coverage_overlap_score >= 30 ? 'text-warning' : 'text-muted-foreground'}>
                        {pf.coverage_overlap_score}%
                      </span>
                    ) : '—'}
                  </td>
                  <td className="text-center px-2 py-2">
                    {pf.coverage_overlap_score > 0 ? (
                      <span className="text-[10px] px-1 py-0.5 rounded bg-primary/10 text-primary"><Brain size={8} className="inline" /></span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="text-center px-2 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${t.is_existing_client ? 'bg-muted text-muted-foreground' : 'bg-info/10 text-info'}`}>
                      {t.is_existing_client ? 'Account' : 'Discovery'}
                    </span>
                  </td>
                  <td className="text-center px-2 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusColor[t.status] || 'bg-muted text-muted-foreground'}`}>
                      {statusLabel[t.status] || t.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============ MAIN COMPONENT ============ */
export default function CampaignTargetList({ campaign, targets, loading }: {
  campaign: any;
  targets: any[];
  loading: boolean;
}) {
  const navigate = useNavigate();
  const updateTarget = useUpdateCampaignTarget();
  const createOpportunity = useCreateOpportunity();
  const { data: overlaps = [] } = useCampaignOverlaps(campaign.id, campaign.target_product_ids);
  const overlapByClient = useMemo(() => {
    const m = new Map<string, typeof overlaps>();
    for (const o of overlaps) {
      const existing = m.get(o.client_id) || [];
      existing.push(o);
      m.set(o.client_id, existing);
    }
    return m;
  }, [overlaps]);
  const [showAdd, setShowAdd] = useState(false);
  // Default-open all targets so Product Fit is visible immediately
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(targets.map((t: any) => t.id)));
  const [filterType, setFilterType] = useState<'all' | 'existing' | 'new'>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [emailTarget, setEmailTarget] = useState<any>(null);

  const toggleExpand = (id: string) =>
    setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const handleStatusChange = async (targetId: string, status: string) => {
    try {
      const now = new Date().toISOString();
      const extras: any = {};
      if (status === 'contacted') extras.contacted_at = now;
      if (status === 'engaged') extras.responded_at = now;
      if (status === 'meeting_booked') extras.meeting_booked_at = now;
      await updateTarget.mutateAsync({ id: targetId, campaign_id: campaign.id, status, ...extras });

      // Auto-create opportunity when target moves to opportunity_opened
      if (status === 'opportunity_opened') {
        const target = targets.find(t => t.id === targetId);
        if (target?.client_id && !target.opportunity_id) {
          try {
            const opp = await createOpportunity.mutateAsync({
              name: `${campaign.name} — ${target.clients?.name || target.prospect_name || 'Target'}`,
              client_id: target.client_id,
              stage: 'Lead',
              value: 0,
              notes: `Created from campaign: ${campaign.name}`,
              source: 'campaign',
              campaign_id: campaign.id,
              campaign_target_id: targetId,
            });
            // Link opportunity back to the campaign target
            await updateTarget.mutateAsync({
              id: targetId,
              campaign_id: campaign.id,
              opportunity_id: opp.id,
            });
            toast.success('Opportunity created and linked');
          } catch {
            toast.error('Target updated but failed to create opportunity');
          }
        }
      }
    } catch {
      toast.error('Failed to update status');
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading targets...</p>;

  const existingTargets = targets.filter((t: any) => t.is_existing_client);
  const newTargets = targets.filter((t: any) => !t.is_existing_client);
  const filtered = filterType === 'existing' ? existingTargets :
    filterType === 'new' ? newTargets : targets;

  return (
    <div>
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
            {[
              { key: 'all', label: `All (${targets.length})` },
              { key: 'existing', label: `Existing (${existingTargets.length})` },
              { key: 'new', label: `New (${newTargets.length})` },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilterType(f.key as any)}
                className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                  filterType === f.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5 ml-2">
            <button onClick={() => setViewMode('table')} className={`p-1 rounded ${viewMode === 'table' ? 'bg-card shadow-sm' : ''}`} title="Table view">
              <List size={13} className={viewMode === 'table' ? 'text-foreground' : 'text-muted-foreground'} />
            </button>
            <button onClick={() => setViewMode('cards')} className={`p-1 rounded ${viewMode === 'cards' ? 'bg-card shadow-sm' : ''}`} title="Card view">
              <LayoutGrid size={13} className={viewMode === 'cards' ? 'text-foreground' : 'text-muted-foreground'} />
            </button>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Plus size={12} /> Add Manual Target
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Zap size={28} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-1">No targets yet</p>
          <p className="text-xs text-muted-foreground mb-4">Run AI Scoring to automatically identify and rank best-fit accounts</p>
        </div>
      ) : viewMode === 'table' ? (
        <TableView targets={filtered} campaign={campaign} onStatusChange={handleStatusChange} onNavigate={navigate} />
      ) : (
        <div className="space-y-2">
          {filtered.map((t: any) => {
            const client = t.clients;
            const rationale = t.fit_rationale || {};
            const scores = rationale.scores || {};
            const productFit = t.product_fit_analysis || {};
            const isOpen = expanded.has(t.id);
            const contacts = t.recommended_contacts || [];

            return (
              <div key={t.id} className="data-card">
                {/* Summary row */}
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => toggleExpand(t.id)}>
                  <button className="p-0.5 text-muted-foreground">
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center shrink-0">
                    <Building2 size={14} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {client?.name || t.prospect_name || 'Unknown'}
                      </p>
                      {t.fit_score > 0 && <ScoreBadge score={t.fit_score} />}
                      {overlapByClient.has(t.client_id) && (
                        <span className="flex items-center gap-0.5 text-[10px] bg-warning/10 text-warning px-1.5 py-0.5 rounded border border-warning/30" title={`Also in: ${overlapByClient.get(t.client_id)!.map(o => `${o.campaign_name} (${o.campaign_owner})`).join(', ')}`}>
                          <AlertTriangle size={9} /> Overlap
                        </span>
                      )}
                      {productFit.coverage_overlap_score > 0 && (
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                          productFit.coverage_overlap_score >= 60 ? 'bg-success/10 text-success border-success/30' :
                          productFit.coverage_overlap_score >= 30 ? 'bg-warning/10 text-warning border-warning/30' :
                          'bg-muted text-muted-foreground border-border'
                        }`}>
                          {productFit.coverage_overlap_score}% overlap
                        </span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        t.is_existing_client ? 'bg-success/10 text-success' : 'bg-info/10 text-info'
                      }`}>
                        {t.is_existing_client ? 'EXISTING' : 'NEW'}
                      </span>
                      {/* Intelligence quality indicator */}
                      {Object.keys(productFit).length > 0 && productFit.coverage_overlap_score > 0 ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary flex items-center gap-0.5" title="Scored with intelligence data">
                          <Brain size={9} /> Intel
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground" title="Scored on firmographics only">
                          Firmographic
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {client?.client_type || t.prospect_type || '—'}
                      {client?.headquarters_country ? ` · ${client.headquarters_country}` : ''}
                    </p>
                  </div>

                  <select
                    value={t.status}
                    onChange={e => { e.stopPropagation(); handleStatusChange(t.id, e.target.value); }}
                    onClick={e => e.stopPropagation()}
                    className={`text-[11px] px-2 py-1 rounded border-0 cursor-pointer ${statusColor[t.status] || ''}`}
                  >
                    {statusOptions.map(s => (
                      <option key={s} value={s}>{statusLabel[s] || s}</option>
                    ))}
                  </select>

                  {client && (
                    <button
                      onClick={e => { e.stopPropagation(); navigate(`/clients/${client.id}`); }}
                      className="p-1 text-muted-foreground hover:text-foreground"
                      title="Open account"
                    >
                      <ExternalLink size={12} />
                    </button>
                  )}
                </div>

                {/* Expanded evidence panel */}
                {isOpen && (
                  <div className="mt-3 pt-3 border-t border-border space-y-3">
                    {/* Product Fit Analysis — PRIMARY evidence */}
                    <ProductFitPanel analysis={productFit} />

                    {/* Dimension scores */}
                    {Object.keys(scores).length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Scoring Dimensions</p>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                          <DimensionBar label="Product Fit" value={scores.product_relevance || 0} color="bg-primary" />
                          <DimensionBar label="Timing" value={scores.timing_signal || 0} color="bg-warning" />
                          <DimensionBar label="Relationship" value={scores.relationship_strength || 0} color="bg-info" />
                          <DimensionBar label="Strategic Fit" value={scores.strategic_fit || 0} color="bg-success" />
                          <DimensionBar label="Conversion" value={scores.conversion_likelihood || 0} color="bg-primary" />
                        </div>
                      </div>
                    )}

                    {/* Evidence grid */}
                    <div className="grid grid-cols-2 gap-3">
                      {rationale.evidence_of_fit && (
                        <div className="rounded-md bg-muted/40 p-2.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Target size={11} className="text-primary" />
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Evidence of Fit</span>
                          </div>
                          <p className="text-xs leading-relaxed">{rationale.evidence_of_fit}</p>
                        </div>
                      )}

                      {rationale.product_relevance_rationale && (
                        <div className="rounded-md bg-muted/40 p-2.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Zap size={11} className="text-warning" />
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Product Relevance</span>
                          </div>
                          <p className="text-xs leading-relaxed">{rationale.product_relevance_rationale}</p>
                        </div>
                      )}

                      {rationale.why_now && (
                        <div className="rounded-md bg-muted/40 p-2.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Target size={11} className="text-success" />
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Why Now</span>
                          </div>
                          <p className="text-xs leading-relaxed">{rationale.why_now}</p>
                        </div>
                      )}

                      {rationale.best_persona && (
                        <div className="rounded-md bg-muted/40 p-2.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Users size={11} className="text-info" />
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Target Persona</span>
                          </div>
                          <p className="text-xs font-medium">{rationale.best_persona}</p>
                        </div>
                      )}
                    </div>

                    {/* Messaging + Next Step */}
                    <div className="grid grid-cols-2 gap-3">
                      {t.recommended_messaging && (
                        <CopyableCard
                          icon={MessageSquare}
                          iconColor="text-primary"
                          label="Message Angle"
                          labelColor="text-primary/70"
                          borderColor="border-primary/20"
                          bgColor="bg-primary/5"
                          content={t.recommended_messaging}
                        />
                      )}

                      {t.recommended_approach && (
                        <CopyableCard
                          icon={Target}
                          iconColor="text-success"
                          label="Next Step"
                          labelColor="text-success/70"
                          borderColor="border-success/20"
                          bgColor="bg-success/5"
                          content={t.recommended_approach}
                        />
                      )}
                    </div>

                    {/* Generate Email Draft button */}
                    {t.recommended_messaging && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setEmailTarget(t); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                      >
                        <Mail size={12} /> Generate Email Draft
                      </button>
                    )}

                    {/* Known Contacts — clearly marked as delivery channels */}
                    {contacts.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Delivery Channels (Contacts)</p>
                        <div className="flex flex-wrap gap-2">
                          {contacts.map((ct: any, i: number) => (
                            <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded bg-secondary text-xs">
                              <Users size={10} className="text-muted-foreground" />
                              <span>{ct.name}</span>
                              {ct.title && <span className="text-muted-foreground">· {ct.title}</span>}
                              {ct.influence && <span className={`text-[9px] px-1 rounded ${ct.influence === 'Decision Maker' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>{ct.influence}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AddTargetDialog open={showAdd} onOpenChange={setShowAdd} campaignId={campaign.id} productIds={campaign.target_product_ids || []} />

      {/* Email Draft Dialog */}
      {emailTarget && (
        <CampaignEmailDraft
          target={emailTarget}
          campaign={campaign}
          onClose={() => setEmailTarget(null)}
        />
      )}
    </div>
  );
}
