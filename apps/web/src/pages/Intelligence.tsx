import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { useClients } from '@/hooks/useCrmData';
import {
  useAllIntelligenceRuns,
  useGenerateIntelligence,
  useLatestIntelligenceResult,
  type IntelligenceRun,
} from '@/hooks/useFundIntelligence';
import { useNavigate } from 'react-router-dom';
import {
  Brain, Loader2, Sparkles, Building2, ChevronRight,
  CheckCircle2, XCircle, Clock, Search, Filter,
} from 'lucide-react';
import LoadingState from '@/components/LoadingState';

type ClientRow = { id: string; name: string; client_type: string; relationship_status: string };

export default function Intelligence() {
  const navigate = useNavigate();
  const { data: clients = [], isLoading: loadingClients } = useClients();
  const { data: runs = [], isLoading: loadingRuns } = useAllIntelligenceRuns();
  const generateMutation = useGenerateIntelligence();

  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'analyzed' | 'not-analyzed'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);

  const isLoading = loadingClients || loadingRuns;

  // Build a map of client_id → latest run
  const latestRunByClient = new Map<string, IntelligenceRun & { clients: { name: string } }>();
  for (const r of runs) {
    if (!latestRunByClient.has(r.client_id)) {
      latestRunByClient.set(r.client_id, r);
    }
  }

  // Fund-type clients (hedge funds, asset managers, etc.)
  const fundTypes = ['Hedge Fund', 'Asset Manager', 'Investment Manager', 'Fund', 'Mutual Fund', 'ETF Provider'];
  const fundClients = (clients as ClientRow[]).filter(
    (c) => fundTypes.some((ft) => c.client_type?.toLowerCase().includes(ft.toLowerCase())) || latestRunByClient.has(c.id)
  );

  // Apply filters
  let filtered = fundClients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );
  if (filterMode === 'analyzed') {
    filtered = filtered.filter((c) => latestRunByClient.has(c.id));
  } else if (filterMode === 'not-analyzed') {
    filtered = filtered.filter((c) => !latestRunByClient.has(c.id));
  }

  // Also show ALL clients with runs even if not fund type
  const analyzedNonFund = (clients as ClientRow[]).filter(
    (c) => latestRunByClient.has(c.id) && !fundClients.some((f) => f.id === c.id) && c.name.toLowerCase().includes(search.toLowerCase())
  );
  const displayClients = [...filtered, ...analyzedNonFund];

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === displayClients.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayClients.map((c) => c.id)));
    }
  };

  const handleBulkGenerate = async () => {
    setBulkRunning(true);
    const targets = displayClients.filter((c) => selectedIds.has(c.id));
    for (const client of targets) {
      try {
        await generateMutation.mutateAsync({ clientId: client.id, clientName: client.name });
      } catch {
        // individual errors handled by mutation toast
      }
    }
    setBulkRunning(false);
    setSelectedIds(new Set());
  };

  if (isLoading) return <AppLayout><LoadingState /></AppLayout>;

  const analyzedCount = fundClients.filter((c) => latestRunByClient.has(c.id)).length;

  return (
    <AppLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Brain size={20} className="text-primary" />
            Fund Strategy Intelligence
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Analyze SEC filings to identify investment themes and match your products
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle2 size={12} className="text-success" />
              {analyzedCount} analyzed
            </span>
            <span>·</span>
            <span>{fundClients.length - analyzedCount} pending</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search funds…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-input bg-background"
          />
        </div>
        <div className="flex items-center gap-1 border border-input rounded-md overflow-hidden">
          {(['all', 'analyzed', 'not-analyzed'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                filterMode === mode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {mode === 'all' ? 'All' : mode === 'analyzed' ? 'Analyzed' : 'Not Analyzed'}
            </button>
          ))}
        </div>
        {selectedIds.size > 0 && (
          <button
            onClick={handleBulkGenerate}
            disabled={bulkRunning}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {bulkRunning ? (
              <><Loader2 size={13} className="animate-spin" /> Running {selectedIds.size}…</>
            ) : (
              <><Sparkles size={13} /> Analyze {selectedIds.size} Fund{selectedIds.size > 1 ? 's' : ''}</>
            )}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="data-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="text-left py-2.5 px-3 w-8">
                <input
                  type="checkbox"
                  checked={selectedIds.size === displayClients.length && displayClients.length > 0}
                  onChange={toggleAll}
                  className="rounded border-input"
                />
              </th>
              <th className="text-left py-2.5 px-3">Fund Name</th>
              <th className="text-left py-2.5 px-3">Type</th>
              <th className="text-left py-2.5 px-3">Status</th>
              <th className="text-left py-2.5 px-3">Intelligence</th>
              <th className="text-left py-2.5 px-3">Filing</th>
              <th className="text-right py-2.5 px-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayClients.map((client) => {
              const run = latestRunByClient.get(client.id);
              return (
                <FundRow
                  key={client.id}
                  client={client}
                  run={run || null}
                  selected={selectedIds.has(client.id)}
                  onToggle={() => toggleSelect(client.id)}
                  onNavigate={() => navigate(`/clients/${client.id}`)}
                  onGenerate={() => generateMutation.mutate({ clientId: client.id, clientName: client.name })}
                  generating={generateMutation.isPending}
                />
              );
            })}
          </tbody>
        </table>
        {displayClients.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">
            {search ? 'No funds match your search' : 'No fund-type clients found. Add clients with type "Hedge Fund" or "Asset Manager" first.'}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// ─── Row Component ──────────────────────────────────────────────────

function FundRow({
  client,
  run,
  selected,
  onToggle,
  onNavigate,
  onGenerate,
  generating,
}: {
  client: ClientRow;
  run: (IntelligenceRun & { clients: { name: string } }) | null;
  selected: boolean;
  onToggle: () => void;
  onNavigate: () => void;
  onGenerate: () => void;
  generating: boolean;
}) {
  const statusCls: Record<string, string> = {
    'Active Client': 'bg-success/10 text-success',
    'Prospect': 'bg-info/10 text-info',
    'Strategic': 'bg-primary/10 text-primary',
    'Dormant': 'bg-muted text-muted-foreground',
  };

  return (
    <tr className="border-b border-border/50 hover:bg-muted/30 transition-colors">
      <td className="py-2.5 px-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="rounded border-input"
        />
      </td>
      <td className="py-2.5 px-3">
        <button onClick={onNavigate} className="font-medium text-foreground hover:text-primary transition-colors text-left">
          {client.name}
        </button>
      </td>
      <td className="py-2.5 px-3 text-xs text-muted-foreground">{client.client_type}</td>
      <td className="py-2.5 px-3">
        <span className={`status-badge text-[10px] ${statusCls[client.relationship_status] || ''}`}>
          {client.relationship_status}
        </span>
      </td>
      <td className="py-2.5 px-3">
        {run ? (
          <div className="flex items-center gap-1.5">
            {run.run_status === 'completed' ? (
              <CheckCircle2 size={13} className="text-success" />
            ) : run.run_status === 'failed' ? (
              <XCircle size={13} className="text-destructive" />
            ) : (
              <Clock size={13} className="text-warning animate-pulse" />
            )}
            <span className="text-xs capitalize">{run.run_status}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-2.5 px-3">
        {run ? (
          <span className="text-xs text-muted-foreground">
            {run.filing_type} · {run.filing_date || '—'}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-2.5 px-3 text-right">
        <div className="flex items-center gap-1 justify-end">
          {!run && (
            <button
              onClick={onGenerate}
              disabled={generating}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 rounded transition-colors disabled:opacity-50"
            >
              <Sparkles size={11} /> Analyze
            </button>
          )}
          {run?.run_status === 'completed' && (
            <button
              onClick={onNavigate}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 rounded transition-colors"
            >
              View <ChevronRight size={11} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
