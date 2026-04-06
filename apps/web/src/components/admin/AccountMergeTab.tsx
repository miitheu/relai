import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  useDetectDuplicates, useMergeAccounts, useMergeHistory, useAccountLinkedCounts,
  type DuplicateCluster, type ClusterMember, type MergeEvent,
} from '@/hooks/useAccountMerge';
import {
  Loader2, GitMerge, Search, CheckCircle2, AlertTriangle, ArrowRight,
  Building2, Users, Briefcase, FileText, ChevronDown, ChevronRight, History,
  Filter, Info, X, Shield,
} from 'lucide-react';
import { format } from 'date-fns';

const MATCH_TYPE_LABELS: Record<string, string> = {
  exact: 'Exact Match', exact_sans_legal: 'Legal Suffix Variant',
  abbreviation: 'Abbreviation / Acronym', punctuation_variant: 'Punctuation / Spacing',
  strong_fuzzy: 'Strong Fuzzy', fuzzy: 'Fuzzy Similarity', alias: 'Alias Match',
  shared_mapping: 'Shared External Mapping',
};

const CONFIDENCE_TIERS = [
  { label: 'All', min: 0 }, { label: '≥ 50%', min: 50 },
  { label: '≥ 70%', min: 70 }, { label: '≥ 85%', min: 85 },
];

type View = 'detect' | 'review' | 'history';

export default function AccountMergeTab() {
  const { user } = useAuth();
  const [view, setView] = useState<View>('detect');
  const [clusters, setClusters] = useState<DuplicateCluster[]>([]);
  const [totalAccounts, setTotalAccounts] = useState(0);
  const [selectedCluster, setSelectedCluster] = useState<DuplicateCluster | null>(null);
  const [filterConfidence, setFilterConfidence] = useState(50);

  const detectMutation = useDetectDuplicates();
  const { data: mergeHistory = [] } = useMergeHistory();

  const handleDetect = async () => {
    const result = await detectMutation.mutateAsync({ minConfidence: 50 });
    setClusters(result.clusters);
    setTotalAccounts(result.total_accounts);
  };

  const handleClusterResolved = (clusterId: string) => {
    setClusters(prev => prev.filter(c => c.cluster_id !== clusterId));
    setSelectedCluster(null);
    setView('detect');
  };

  const filtered = useMemo(() => {
    return clusters.filter(c => c.max_confidence >= filterConfidence);
  }, [clusters, filterConfidence]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GitMerge size={18} className="text-primary" />
          <div>
            <h2 className="text-sm font-semibold">Account Merge</h2>
            <p className="text-xs text-muted-foreground">Cluster-based duplicate detection with review controls</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setView('detect'); setSelectedCluster(null); }}
            className={`px-3 py-1.5 rounded text-xs font-medium ${view !== 'history' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
            Clusters
          </button>
          <button onClick={() => setView('history')}
            className={`px-3 py-1.5 rounded text-xs font-medium ${view === 'history' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
            <History size={11} className="inline mr-1" />History ({mergeHistory.length})
          </button>
        </div>
      </div>

      {/* Detection View */}
      {view === 'detect' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <button onClick={handleDetect} disabled={detectMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {detectMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
              Scan for Duplicates
            </button>
            {clusters.length > 0 && (
              <span className="text-xs text-muted-foreground">
                Found {clusters.length} clusters across {totalAccounts} accounts · Showing {filtered.length}
              </span>
            )}
          </div>

          {/* Filters */}
          {clusters.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Filter size={11} className="text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground font-medium">Confidence:</span>
                {CONFIDENCE_TIERS.map(tier => (
                  <button key={tier.min} onClick={() => setFilterConfidence(tier.min)}
                    className={`text-[10px] px-2 py-0.5 rounded-full ${filterConfidence === tier.min ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                    {tier.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Cluster List */}
          {filtered.length > 0 && (
            <div className="space-y-2">
              {filtered.map(cluster => (
                <ClusterCard key={cluster.cluster_id} cluster={cluster}
                  onReview={() => { setSelectedCluster(cluster); setView('review'); }} />
              ))}
            </div>
          )}

          {detectMutation.isSuccess && clusters.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 size={24} className="mx-auto mb-2 text-success" />
              <p className="text-sm">No duplicate accounts detected</p>
            </div>
          )}

          {detectMutation.isSuccess && filtered.length === 0 && clusters.length > 0 && (
            <div className="text-center py-6 text-muted-foreground">
              <p className="text-sm">No clusters match current filter. Try lowering confidence.</p>
            </div>
          )}
        </div>
      )}

      {/* Cluster Review View */}
      {view === 'review' && selectedCluster && (
        <ClusterReviewWorkspace
          cluster={selectedCluster}
          userId={user?.id}
          onBack={() => { setView('detect'); setSelectedCluster(null); }}
          onResolved={() => handleClusterResolved(selectedCluster.cluster_id)}
        />
      )}

      {/* History View */}
      {view === 'history' && (
        <div className="space-y-2">
          {mergeHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No merge history yet</p>
          ) : mergeHistory.map(evt => (
            <div key={evt.id} className="bg-card border border-border rounded-lg px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <GitMerge size={13} className="text-success" />
                  <div>
                    <p className="text-sm">
                      <span className="font-medium">{evt.merge_summary_json.secondary_name}</span>
                      <span className="text-muted-foreground mx-2">→</span>
                      <span className="font-medium">{evt.merge_summary_json.primary_name}</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {evt.merge_summary_json.total_records_moved} records moved · {format(new Date(evt.merged_at), 'MMM d, yyyy HH:mm')}
                    </p>
                  </div>
                </div>
                <MergeDetailExpander summary={evt.merge_summary_json} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Cluster Card ───────────────────────────────────────────────────

function ClusterCard({ cluster, onReview }: { cluster: DuplicateCluster; onReview: () => void }) {
  return (
    <div className="bg-card border border-border rounded-lg px-4 py-3 hover:border-primary/30 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Building2 size={14} className="text-primary shrink-0" />
          <span className="text-sm font-semibold">Potential Duplicate Cluster</span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            {cluster.member_count} accounts
          </span>
          <ConfidenceBadge confidence={cluster.max_confidence} />
        </div>
        <button onClick={onReview}
          className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90">
          Review Cluster
        </button>
      </div>

      {/* Member names */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {cluster.members.map(m => (
          <span key={m.id} className="inline-flex items-center gap-1 text-xs bg-muted/60 px-2 py-0.5 rounded">
            <Building2 size={10} className="text-muted-foreground shrink-0" />
            {m.name}
          </span>
        ))}
      </div>

      {/* Match type badges & reasons */}
      <div className="flex flex-wrap gap-1.5">
        {cluster.match_types.map(t => (
          <span key={t} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/50 text-accent-foreground">
            {MATCH_TYPE_LABELS[t] || t}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Cluster Review Workspace ───────────────────────────────────────

function ClusterReviewWorkspace({ cluster, userId, onBack, onResolved }: {
  cluster: DuplicateCluster; userId?: string; onBack: () => void; onResolved: () => void;
}) {
  const mergeMutation = useMergeAccounts();
  const [primaryId, setPrimaryId] = useState(cluster.members[0]?.id || '');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [mergedIds, setMergedIds] = useState<Set<string>>(new Set());

  const includedMembers = cluster.members.filter(m => !excluded.has(m.id) && !mergedIds.has(m.id));
  const secondaries = includedMembers.filter(m => m.id !== primaryId);
  const canMerge = secondaries.length > 0;

  const toggleExclude = (id: string) => {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    if (id === primaryId && !excluded.has(id)) {
      const first = includedMembers.find(m => m.id !== id);
      if (first) setPrimaryId(first.id);
    }
  };

  const handleMergeAll = async () => {
    for (const sec of secondaries) {
      await mergeMutation.mutateAsync({
        primaryAccountId: primaryId,
        secondaryAccountId: sec.id,
        userId,
      });
      setMergedIds(prev => new Set(prev).add(sec.id));
    }
    onResolved();
  };

  const allDone = includedMembers.length <= 1;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Cluster Review</h3>
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground">← Back to list</button>
      </div>

      {/* Warning banner */}
      <div className="bg-warning/5 border border-warning/30 rounded-lg px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle size={13} className="text-warning" />
          <span className="text-xs font-medium">
            {cluster.member_count} accounts in this cluster · Merge is irreversible
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {cluster.all_reasons.slice(0, 6).map((r, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-background/50 px-1.5 py-0.5 rounded">
              <Info size={8} />{r}
            </span>
          ))}
          {cluster.all_reasons.length > 6 && (
            <span className="text-[10px] text-muted-foreground">+{cluster.all_reasons.length - 6} more</span>
          )}
        </div>
      </div>

      {/* Member cards */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          Select the canonical (surviving) account, then exclude any accounts that should remain separate.
        </p>
        <div className="grid grid-cols-1 gap-2">
          {cluster.members.map(member => {
            const isExcluded = excluded.has(member.id);
            const isMerged = mergedIds.has(member.id);
            const isPrimary = member.id === primaryId && !isExcluded;

            return (
              <ClusterMemberCard
                key={member.id}
                member={member}
                isPrimary={isPrimary}
                isExcluded={isExcluded}
                isMerged={isMerged}
                onSetPrimary={() => { if (!isExcluded && !isMerged) setPrimaryId(member.id); }}
                onToggleExclude={() => { if (!isMerged) toggleExclude(member.id); }}
              />
            );
          })}
        </div>
      </div>

      {/* Edge evidence */}
      <div className="bg-card border border-border rounded-lg px-4 py-3">
        <p className="text-xs font-medium mb-2">Cluster Evidence ({cluster.edges.length} connections)</p>
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {cluster.edges.map((edge, i) => {
            const nameA = cluster.members.find(m => m.id === edge.id_a)?.name || edge.id_a.slice(0, 8);
            const nameB = cluster.members.find(m => m.id === edge.id_b)?.name || edge.id_b.slice(0, 8);
            return (
              <div key={i} className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground truncate max-w-[120px]">{nameA}</span>
                <ArrowRight size={8} className="shrink-0" />
                <span className="font-medium text-foreground truncate max-w-[120px]">{nameB}</span>
                <ConfidenceBadge confidence={edge.confidence} />
                <span className="text-muted-foreground truncate">{edge.reasons[0]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Merge Actions */}
      {!allDone && !showConfirm && canMerge && (
        <div className="flex items-center gap-2">
          <button onClick={() => setShowConfirm(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-medium hover:bg-destructive/90">
            <GitMerge size={13} /> Merge {secondaries.length} account{secondaries.length > 1 ? 's' : ''} into "{cluster.members.find(m => m.id === primaryId)?.name}"
          </button>
          <button onClick={onBack} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Skip</button>
        </div>
      )}

      {showConfirm && canMerge && (
        <div className="bg-destructive/5 border border-destructive/30 rounded-lg px-4 py-3">
          <p className="text-xs font-medium mb-2">Are you sure? This action cannot be undone.</p>
          <p className="text-[10px] text-muted-foreground mb-2">
            {secondaries.map(s => `"${s.name}"`).join(', ')} will be merged into "{cluster.members.find(m => m.id === primaryId)?.name}".
            All linked records will be reassigned.
          </p>
          <div className="flex items-center gap-2">
            <button onClick={handleMergeAll} disabled={mergeMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-medium hover:bg-destructive/90 disabled:opacity-50">
              {mergeMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              {mergeMutation.isPending ? 'Merging...' : 'Confirm Merge'}
            </button>
            <button onClick={() => setShowConfirm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        </div>
      )}

      {allDone && (
        <div className="text-center py-4 text-muted-foreground">
          <CheckCircle2 size={20} className="mx-auto mb-1 text-success" />
          <p className="text-sm">Cluster resolved</p>
        </div>
      )}
    </div>
  );
}

// ─── Cluster Member Card ────────────────────────────────────────────

function ClusterMemberCard({ member, isPrimary, isExcluded, isMerged, onSetPrimary, onToggleExclude }: {
  member: ClusterMember; isPrimary: boolean; isExcluded: boolean; isMerged: boolean;
  onSetPrimary: () => void; onToggleExclude: () => void;
}) {
  const { data: counts } = useAccountLinkedCounts(member.id);
  const totalRecords = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className={`rounded-lg border px-4 py-3 transition-colors ${
      isMerged ? 'border-border bg-muted/30 opacity-60' :
      isExcluded ? 'border-dashed border-muted-foreground/30 opacity-60' :
      isPrimary ? 'border-success bg-success/5' : 'border-border hover:border-muted-foreground/50'
    }`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Building2 size={13} className="text-muted-foreground shrink-0" />
          <span className="text-sm font-medium">{member.name}</span>
          <ConfidenceBadge confidence={member.member_confidence} />
        </div>
        <div className="flex items-center gap-1.5">
          {isMerged ? (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Merged</span>
          ) : isExcluded ? (
            <button onClick={onToggleExclude}
              className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground hover:bg-accent">
              Excluded · Undo
            </button>
          ) : (
            <>
              {isPrimary ? (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-success/10 text-success">
                  <Shield size={8} className="inline mr-0.5" />Primary (Keep)
                </span>
              ) : (
                <button onClick={onSetPrimary}
                  className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary">
                  Set as Primary
                </button>
              )}
              {!isPrimary && (
                <button onClick={onToggleExclude}
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                  <X size={10} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {counts && !isMerged && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          {counts.contacts > 0 && <span><Users size={9} className="inline mr-0.5" />{counts.contacts} contacts</span>}
          {counts.opportunities > 0 && <span><Briefcase size={9} className="inline mr-0.5" />{counts.opportunities} opps</span>}
          {counts.notes > 0 && <span><FileText size={9} className="inline mr-0.5" />{counts.notes} notes</span>}
          <span>{totalRecords} total records</span>
        </div>
      )}
      {!isMerged && !isExcluded && member.match_reasons.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {member.match_reasons.slice(0, 3).map((r, i) => (
            <span key={i} className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
              <Info size={7} />{r}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Small UI pieces ────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const cls = confidence >= 90 ? 'bg-success/10 text-success'
    : confidence >= 70 ? 'bg-warning/10 text-warning'
    : 'bg-muted text-muted-foreground';
  return <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${cls}`}>{confidence}%</span>;
}

function MergeDetailExpander({ summary }: { summary: MergeEvent['merge_summary_json'] }) {
  const [open, setOpen] = useState(false);
  const movedEntries = Object.entries(summary.records_moved || {}).filter(([, v]) => (v as number) > 0);
  if (movedEntries.length === 0) return null;
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-0.5">
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        Details
      </button>
      {open && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
          {movedEntries.map(([table, count]) => (
            <span key={table}>{String(count)} {table}</span>
          ))}
        </div>
      )}
    </div>
  );
}
