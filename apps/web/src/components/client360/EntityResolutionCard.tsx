import { useState } from 'react';
import {
  useEntityResolution,
  useExternalSourceMappings,
  useResolveEntity,
  useConfirmEntity,
  useRejectEntity,
  type SECCandidate,
  type ExternalSourceMapping,
} from '@/hooks/useEntityResolution';
import {
  Loader2, CheckCircle2, AlertTriangle, Search, XCircle,
  ExternalLink, RefreshCw, Building2, Fingerprint, Info, Globe, Tag,
} from 'lucide-react';

interface Props {
  clientId: string;
  clientName: string;
  clientType: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  auto_matched: { label: 'Auto-Matched', color: 'bg-success/10 text-success', icon: CheckCircle2 },
  manually_confirmed: { label: 'Confirmed', color: 'bg-success/10 text-success', icon: CheckCircle2 },
  needs_review: { label: 'Needs Review', color: 'bg-warning/10 text-warning', icon: AlertTriangle },
  unresolved: { label: 'Unresolved', color: 'bg-destructive/10 text-destructive', icon: Search },
  rejected: { label: 'Not Applicable', color: 'bg-muted text-muted-foreground', icon: XCircle },
};

const METHOD_LABELS: Record<string, string> = {
  exact: 'Exact match',
  exact_sans_legal: 'Exact (suffix-stripped)',
  core_match: 'Core name match',
  token_containment: 'Token containment',
  token_overlap: 'Token overlap',
  fuzzy_sans_legal: 'Fuzzy (suffix-stripped)',
  fuzzy_core: 'Fuzzy (core name)',
  alias_match: 'Alias match',
  alias_fuzzy: 'Fuzzy alias',
  manual: 'Manual',
};

const SOURCE_TYPE_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  sec_adviser: { label: 'SEC Adviser', icon: Building2 },
  sec_issuer: { label: 'SEC Issuer', icon: Building2 },
  ticker: { label: 'Ticker', icon: Tag },
  company_filings: { label: 'Company Filings', icon: Building2 },
  website_domain: { label: 'Website', icon: Globe },
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  hedge_fund: 'Hedge Fund',
  asset_manager: 'Asset Manager',
  corporate: 'Corporate',
  bank: 'Bank / Financial',
  data_vendor: 'Data Vendor',
  public_company: 'Public Company',
  private_company: 'Private Company',
  other: 'Other',
};

export default function EntityResolutionCard({ clientId, clientName, clientType }: Props) {
  const { data: resolution, isLoading } = useEntityResolution(clientId);
  const { data: mappings = [] } = useExternalSourceMappings(clientId);
  const resolveMutation = useResolveEntity();
  const confirmMutation = useConfirmEntity();
  const rejectMutation = useRejectEntity();
  const [manualCik, setManualCik] = useState('');
  const [manualName, setManualName] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [showMappings, setShowMappings] = useState(false);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<number>>(new Set());

  const isPending = resolveMutation.isPending || confirmMutation.isPending || rejectMutation.isPending;

  // No resolution yet — offer to resolve
  if (!isLoading && !resolution) {
    return (
      <div className="border border-warning/30 bg-warning/5 rounded-lg px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <Fingerprint size={14} className="text-muted-foreground" />
          <span className="text-sm font-medium">Entity Resolution</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Optionally resolve "<span className="font-medium text-foreground">{clientName}</span>" to enrich intelligence with SEC filings and holdings data.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => resolveMutation.mutate({ clientId })}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
            Resolve Entity
          </button>
          <button
            onClick={() => rejectMutation.mutate({ clientId, entityType: 'other' })}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <XCircle size={11} />
            Skip
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) return null;
  if (!resolution) return null;

  // Rejected — hide entirely
  if (resolution.resolution_status === 'rejected') return null;

  const statusConfig = STATUS_CONFIG[resolution.resolution_status] || STATUS_CONFIG.unresolved;
  const StatusIcon = statusConfig.icon;
  const candidates = (resolution.match_candidates || []) as SECCandidate[];
  const entityTypeLabel = ENTITY_TYPE_LABELS[resolution.entity_type] || resolution.entity_type;

  // Confirmed or auto-matched — show compact status with external mappings
  if (resolution.resolution_status === 'manually_confirmed' || resolution.resolution_status === 'auto_matched') {
    return (
      <div className="border border-border/50 bg-muted/30 rounded-lg px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Fingerprint size={14} className="text-muted-foreground" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{resolution.canonical_name || resolution.sec_filer_name}</span>
                <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${statusConfig.color}`}>
                  <StatusIcon size={9} /> {statusConfig.label}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{entityTypeLabel}</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                {resolution.sec_cik && <span>CIK: {resolution.sec_cik}</span>}
                <span>Confidence: {resolution.confidence_score}%</span>
                <span>{METHOD_LABELS[resolution.matched_by || ''] || resolution.matched_by}</span>
                {resolution.manually_confirmed && <span className="text-success">✓ Confirmed</span>}
                {resolution.sec_cik && (
                  <a href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${resolution.sec_cik}&type=&dateb=&owner=include&count=10`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-0.5">
                    SEC Filings <ExternalLink size={8} />
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {mappings.length > 0 && (
              <button onClick={() => setShowMappings(!showMappings)} className="text-[10px] text-muted-foreground hover:text-primary">
                {mappings.length} mapping{mappings.length !== 1 ? 's' : ''}
              </button>
            )}
            <button
              onClick={() => resolveMutation.mutate({ clientId })}
              disabled={isPending}
              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
            >
              <RefreshCw size={10} /> Re-resolve
            </button>
          </div>
        </div>

        {/* External Source Mappings */}
        {showMappings && mappings.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-border/30">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">External Source Mappings</p>
            {mappings.map((m) => {
              const srcConfig = SOURCE_TYPE_LABELS[m.external_source_type] || { label: m.external_source_type, icon: Building2 };
              const SrcIcon = srcConfig.icon;
              return (
                <div key={m.id} className="flex items-center gap-2 text-[10px] text-muted-foreground bg-background rounded px-2 py-1">
                  <SrcIcon size={10} />
                  <span className="font-medium text-foreground">{srcConfig.label}</span>
                  <span>→ {m.external_entity_name}</span>
                  {m.external_identifier && <span className="text-muted-foreground">({m.external_identifier})</span>}
                  <span className={m.confidence_score >= 80 ? 'text-success' : 'text-warning'}>{m.confidence_score}%</span>
                  {m.manually_confirmed && <CheckCircle2 size={8} className="text-success" />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Needs review or unresolved — show review flow
  return (
    <div className="border border-warning/30 bg-warning/5 rounded-lg px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Fingerprint size={14} className="text-warning" />
          <span className="text-sm font-medium">Entity Review Required</span>
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${statusConfig.color}`}>
            <StatusIcon size={9} /> {statusConfig.label}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{entityTypeLabel}</span>
        </div>
        <button
          onClick={() => resolveMutation.mutate({ clientId })}
          disabled={isPending}
          className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
        >
          <RefreshCw size={10} /> Re-search
        </button>
      </div>

      <div className="text-xs text-muted-foreground space-y-0.5">
        <p>CRM Name: "<span className="font-medium text-foreground">{resolution.source_name}</span>"</p>
        <p>Normalized: "<span className="font-medium text-foreground">{resolution.normalized_name}</span>"</p>
        {/* confidence score hidden */}
      </div>

      {candidates.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Suggested Matches</p>
            {selectedCandidates.size > 0 && (
              <button
                onClick={() => {
                  const selected = Array.from(selectedCandidates).map(i => candidates[i]);
                  const primary = selected[0];
                  const additional = selected.map(c => ({ cik: c.cik, name: c.name }));
                  confirmMutation.mutate({ clientId, secCik: primary.cik, secFilerName: primary.name, additionalMatches: additional });
                  setSelectedCandidates(new Set());
                }}
                disabled={isPending}
                className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground rounded text-[10px] font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {confirmMutation.isPending ? <Loader2 size={9} className="animate-spin" /> : <CheckCircle2 size={9} />}
                Confirm {selectedCandidates.size} Selected
              </button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">Select all CIKs that belong to this account, then confirm together.</p>
          {candidates.map((c, i) => {
            const isSelected = selectedCandidates.has(i);
            return (
              <div key={i} className={`bg-background rounded-lg px-3 py-2 border cursor-pointer transition-colors ${isSelected ? 'border-primary bg-primary/5' : 'border-border/50 hover:border-border'}`}
                onClick={() => {
                  const next = new Set(selectedCandidates);
                  if (next.has(i)) next.delete(i); else next.add(i);
                  setSelectedCandidates(next);
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/40'}`}>
                      {isSelected && <CheckCircle2 size={10} className="text-primary-foreground" />}
                    </div>
                    <Building2 size={12} className="text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{(c as any).source === 'web_search' ? 'Domain' : (c as any).source === 'security_master' || (c as any).source === 'insight_hub' ? 'Ticker' : 'CIK'}: {c.cik}</span>
                        {c.filing_date && <span>Filed: {c.filing_date}</span>}
                        {c.filing_type && <span>{c.filing_type}</span>}
                        <span className="text-primary/70">{METHOD_LABELS[c.match_method] || c.match_method}</span>
                        {(c as any).source && (c as any).source !== 'sec_edgar' && (
                          <span className={`px-1 py-0.5 rounded text-[9px] font-medium ${
                            (c as any).source === 'security_master' || (c as any).source === 'insight_hub' ? 'bg-info/10 text-info' : 'bg-warning/10 text-warning'
                          }`}>
                            {(c as any).source === 'security_master' ? 'Ticker DB' : (c as any).source === 'insight_hub' ? 'Insight Hub' : (c as any).source === 'web_search' ? 'Web' : (c as any).source}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); confirmMutation.mutate({ clientId, secCik: c.cik, secFilerName: c.name }); }}
                    disabled={isPending}
                    className="flex items-center gap-1 px-2.5 py-1 bg-muted text-foreground rounded text-[10px] font-medium hover:bg-muted/80 disabled:opacity-50"
                  >
                    Accept Only
                  </button>
                </div>
                {c.match_reasons && c.match_reasons.length > 0 && (
                  <div className="mt-1.5 ml-7 flex items-start gap-1.5 text-[10px] text-muted-foreground">
                    <Info size={9} className="mt-0.5 shrink-0" />
                    <span>{c.match_reasons.join(' · ')}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {candidates.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No candidates found. Enter details manually or mark as not applicable.</p>
      )}

      <div className="flex items-center gap-2">
        <button onClick={() => setShowManual(!showManual)} className="text-[10px] text-primary hover:underline">
          Enter manually
        </button>
        <span className="text-[10px] text-muted-foreground">·</span>
        <button
          onClick={() => rejectMutation.mutate({ clientId })}
          disabled={isPending}
          className="text-[10px] text-muted-foreground hover:text-destructive"
        >
          Not applicable
        </button>
      </div>

      {showManual && (
        <div className="flex items-center gap-2 bg-background rounded-lg px-3 py-2 border border-border/50">
          <input type="text" placeholder="Entity Name" value={manualName} onChange={e => setManualName(e.target.value)}
            className="flex-1 text-xs bg-transparent border-none outline-none placeholder:text-muted-foreground" />
          <input type="text" placeholder="CIK / ID" value={manualCik} onChange={e => setManualCik(e.target.value)}
            className="w-28 text-xs bg-transparent border-none outline-none placeholder:text-muted-foreground" />
          <button
            onClick={() => { if (manualCik && manualName) { confirmMutation.mutate({ clientId, secCik: manualCik, secFilerName: manualName }); setShowManual(false); } }}
            disabled={!manualCik || !manualName || isPending}
            className="px-2.5 py-1 bg-primary text-primary-foreground rounded text-[10px] font-medium disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}
