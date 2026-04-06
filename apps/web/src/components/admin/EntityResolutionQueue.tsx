import { useState } from 'react';
import {
  useAllEntityResolutions,
  useResolveEntity,
  useConfirmEntity,
  useRejectEntity,
  useBatchResolveEntities,
  type EntityResolution,
  type SECCandidate,
} from '@/hooks/useEntityResolution';
import {
  Fingerprint, Loader2, CheckCircle2, AlertTriangle, Search,
  XCircle, Building2, RefreshCw, Zap, ChevronDown, ChevronRight, Info,
} from 'lucide-react';

const METHOD_LABELS: Record<string, string> = {
  exact: 'Exact', exact_sans_legal: 'Suffix-stripped', core_match: 'Core match',
  token_containment: 'Token containment', token_overlap: 'Token overlap',
  fuzzy_sans_legal: 'Fuzzy', fuzzy_core: 'Fuzzy (core)', alias_match: 'Alias',
  alias_fuzzy: 'Fuzzy alias', manual: 'Manual', none: 'None',
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  hedge_fund: 'Hedge Fund', asset_manager: 'Asset Manager', corporate: 'Corporate',
  bank: 'Bank', data_vendor: 'Data Vendor', public_company: 'Public Co', other: 'Other',
};

export default function EntityResolutionQueue() {
  const { data: resolutions = [], isLoading } = useAllEntityResolutions();
  const [filter, setFilter] = useState<string>('pending');
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const batchResolve = useBatchResolveEntities();
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);

  const runFullBatch = async () => {
    setBatchRunning(true);
    setBatchProgress({ done: 0, total: 0 });
    let totalDone = 0;
    try {
      while (true) {
        const result = await batchResolve.mutateAsync({
          batchSize: 10,
          offset: 0,
          entityTypeFilter: entityTypeFilter !== 'all' ? entityTypeFilter : undefined,
        });
        totalDone += result.processed;
        setBatchProgress({ done: totalDone, total: totalDone + result.remaining });
        if (result.remaining <= 0 || result.processed === 0) break;
      }
    } finally {
      setBatchRunning(false);
      setBatchProgress(null);
    }
  };

  const filtered = resolutions.filter(r => {
    if (filter === 'pending' && !['needs_review', 'unresolved'].includes(r.resolution_status)) return false;
    else if (filter !== 'all' && filter !== 'pending' && r.resolution_status !== filter) return false;
    if (entityTypeFilter !== 'all' && r.entity_type !== entityTypeFilter) return false;
    return true;
  });

  const needsReview = resolutions.filter(r => r.resolution_status === 'needs_review');
  const unresolved = resolutions.filter(r => r.resolution_status === 'unresolved');
  const confirmed = resolutions.filter(r => r.resolution_status === 'manually_confirmed' || r.resolution_status === 'auto_matched');
  const rejected = resolutions.filter(r => r.resolution_status === 'rejected');

  // Get unique entity types
  const entityTypes = [...new Set(resolutions.map(r => r.entity_type))].sort();

  return (
    <div className="space-y-4">
      {/* Batch Resolve */}
      <div className="data-card flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Universal Entity Resolution</h3>
          <p className="text-xs text-muted-foreground">
            Resolve all account types: funds, corporates, banks, and more
          </p>
        </div>
        <div className="flex items-center gap-3">
          {batchProgress && (
            <span className="text-xs text-muted-foreground">
              {batchProgress.done}/{batchProgress.total} processed
            </span>
          )}
          <button
            onClick={runFullBatch}
            disabled={batchRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {batchRunning ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
            {batchRunning ? 'Resolving...' : 'Resolve All Entities'}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <KPI icon={AlertTriangle} label="Needs Review" value={needsReview.length} color="text-warning" />
        <KPI icon={Search} label="Unresolved" value={unresolved.length} color="text-destructive" />
        <KPI icon={CheckCircle2} label="Confirmed" value={confirmed.length} color="text-success" />
        <KPI icon={XCircle} label="Not Applicable" value={rejected.length} color="text-muted-foreground" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-semibold flex-1">Entity Resolutions</h3>
        {/* Entity type filter */}
        <div className="flex gap-1 mr-2">
          <button onClick={() => setEntityTypeFilter('all')}
            className={`text-[10px] px-2 py-0.5 rounded ${entityTypeFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
            all types
          </button>
          {entityTypes.map(t => (
            <button key={t} onClick={() => setEntityTypeFilter(t)}
              className={`text-[10px] px-2 py-0.5 rounded ${entityTypeFilter === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
              {ENTITY_TYPE_LABELS[t] || t}
            </button>
          ))}
        </div>
        {/* Status filter */}
        <div className="flex gap-1">
          {(['pending', 'all', 'needs_review', 'unresolved', 'auto_matched', 'rejected'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-[10px] px-2 py-0.5 rounded ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
              {f === 'pending' ? `pending (${needsReview.length + unresolved.length})` : f === 'needs_review' ? 'review' : f === 'auto_matched' ? 'matched' : f}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-4"><Loader2 size={16} className="animate-spin text-muted-foreground mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No entity resolutions found</p>
      ) : (
        <div className="space-y-1">
          {filtered.map(r => (
            <ResolutionRow key={r.id} resolution={r} expanded={expandedId === r.id} onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function KPI({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number; color: string }) {
  return (
    <div className="data-card text-center py-3">
      <Icon size={16} className={`${color} mx-auto mb-1`} />
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function ResolutionRow({ resolution, expanded, onToggle }: {
  resolution: EntityResolution & { clients: { name: string; client_type: string } };
  expanded: boolean;
  onToggle: () => void;
}) {
  const resolveMutation = useResolveEntity();
  const confirmMutation = useConfirmEntity();
  const rejectMutation = useRejectEntity();
  const isPending = resolveMutation.isPending || confirmMutation.isPending || rejectMutation.isPending;
  const candidates = (resolution.match_candidates || []) as SECCandidate[];
  const [selectedCiks, setSelectedCiks] = useState<Set<number>>(new Set());

  const toggleCandidate = (idx: number) => {
    setSelectedCiks(prev => { const next = new Set(prev); if (next.has(idx)) next.delete(idx); else next.add(idx); return next; });
  };

  const confirmSelected = () => {
    const selected = [...selectedCiks].map(i => candidates[i]).filter(Boolean);
    if (selected.length === 0) return;
    const primary = selected.sort((a, b) => b.confidence - a.confidence)[0];
    confirmMutation.mutate({
      clientId: resolution.client_id,
      secCik: primary.cik,
      secFilerName: primary.name,
      additionalMatches: selected.length > 1 ? selected.map(c => ({ cik: c.cik, name: c.name })) : undefined,
    });
  };

  const statusColors: Record<string, string> = {
    auto_matched: 'bg-success', manually_confirmed: 'bg-success',
    needs_review: 'bg-warning', unresolved: 'bg-destructive', rejected: 'bg-muted-foreground/30',
  };

  const entityLabel = ENTITY_TYPE_LABELS[resolution.entity_type] || resolution.entity_type;

  return (
    <div className="border border-border/50 rounded-lg">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/30 transition-colors">
        <span className={`w-2 h-2 rounded-full shrink-0 ${statusColors[resolution.resolution_status] || 'bg-muted'}`} />
        <span className="text-sm font-medium flex-1">{resolution.clients?.name}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">{entityLabel}</span>
        {resolution.sec_cik && <span className="text-[10px] text-muted-foreground">CIK: {resolution.sec_cik}</span>}
        <span className="text-[10px] text-muted-foreground/70">{METHOD_LABELS[resolution.matched_by || ''] || resolution.matched_by}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
          resolution.resolution_status === 'needs_review' ? 'bg-warning/10 text-warning' :
          resolution.resolution_status === 'unresolved' ? 'bg-destructive/10 text-destructive' :
          resolution.resolution_status === 'rejected' ? 'bg-muted text-muted-foreground' :
          'bg-success/10 text-success'
        }`}>{resolution.resolution_status}</span>
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p>Source: <span className="text-foreground">{resolution.source_name}</span></p>
            <p>Normalized: <span className="text-foreground">{resolution.normalized_name}</span></p>
            <p>Resolved to: <span className="text-foreground">{resolution.canonical_name || resolution.sec_filer_name || 'unresolved'}</span></p>
          </div>

          {candidates.length > 0 && (
            <div className="space-y-1">
              {candidates.map((c, i) => (
                <div key={i} className="bg-muted/30 rounded px-2 py-1.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {resolution.resolution_status !== 'manually_confirmed' && (
                        <input type="checkbox" checked={selectedCiks.has(i)} onChange={() => toggleCandidate(i)}
                          className="h-3 w-3 rounded border-border accent-primary cursor-pointer" />
                      )}
                      <Building2 size={10} className="text-muted-foreground" />
                      <span className="text-xs font-medium">{c.name}</span>
                      <span className="text-[10px] text-muted-foreground">CIK: {c.cik}</span>
                      {c.filing_type && <span className="text-[10px] text-muted-foreground">{c.filing_type}</span>}
                      {c.filing_date && <span className="text-[10px] text-muted-foreground">Filed: {c.filing_date}</span>}
                      <span className="text-[10px] text-primary/70">{METHOD_LABELS[c.match_method] || c.match_method}</span>
                    </div>
                  </div>
                  {c.match_reasons && c.match_reasons.length > 0 && (
                    <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground ml-5">
                      <Info size={8} className="mt-0.5 shrink-0" />
                      <span>{c.match_reasons.join(' · ')}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 items-center">
            {resolution.resolution_status !== 'manually_confirmed' && selectedCiks.size > 0 && (
              <button onClick={confirmSelected} disabled={isPending}
                className="text-[10px] px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1">
                {confirmMutation.isPending ? <Loader2 size={9} className="animate-spin" /> : <CheckCircle2 size={9} />}
                Confirm {selectedCiks.size} match{selectedCiks.size > 1 ? 'es' : ''}
              </button>
            )}
            <button onClick={() => resolveMutation.mutate({ clientId: resolution.client_id })} disabled={isPending}
              className="text-[10px] text-primary hover:underline flex items-center gap-1 disabled:opacity-50">
              {resolveMutation.isPending ? <Loader2 size={9} className="animate-spin" /> : <RefreshCw size={9} />} Re-resolve
            </button>
            {resolution.resolution_status !== 'rejected' && (
              <button onClick={() => rejectMutation.mutate({ clientId: resolution.client_id })} disabled={isPending}
                className="text-[10px] text-muted-foreground hover:text-destructive disabled:opacity-50">
                Not applicable
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
