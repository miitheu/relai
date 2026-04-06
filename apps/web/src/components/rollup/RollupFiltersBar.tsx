import { RollupFilters } from '@/hooks/useSalesRollup';
import { stageOrder } from '@/data/mockData';
import { Filter, X } from 'lucide-react';

interface Props {
  filters: RollupFilters;
  setFilters: (f: RollupFilters | ((prev: RollupFilters) => RollupFilters)) => void;
  profiles: any[];
  datasets: any[];
  clients: any[];
}

const quickFilters = [
  { key: undefined, label: 'All' },
  { key: 'closing-this-month', label: 'Closing This Month' },
  { key: 'high-probability', label: 'High Probability' },
  { key: 'stale-deals', label: 'Stale Deals' },
  { key: 'large-opps', label: 'Large Opps ($100K+)' },
  { key: 'closed-won-quarter', label: 'Closed Won (Q)' },
] as const;

export default function RollupFiltersBar({ filters, setFilters, profiles, datasets, clients }: Props) {
  const activeCount = [filters.owner, filters.stage, filters.dataset, filters.clientType, filters.quickFilter].filter(Boolean).length;

  const clearAll = () => setFilters({ openOnly: true });

  const selectClass = "px-2 py-1.5 bg-muted border border-border rounded text-xs min-w-0 max-w-[140px]";

  return (
    <div className="space-y-3 mb-6">
      {/* Quick filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={13} className="text-muted-foreground shrink-0" />
        {quickFilters.map(qf => (
          <button
            key={qf.key ?? 'all'}
            onClick={() => setFilters(f => ({
              ...f,
              quickFilter: f.quickFilter === qf.key ? undefined : qf.key,
              openOnly: qf.key === 'closed-won-quarter' ? false : !qf.key ? true : f.openOnly,
              closedOnly: qf.key === 'closed-won-quarter' ? true : false,
            }))}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
              filters.quickFilter === qf.key || (!filters.quickFilter && !qf.key)
                ? 'bg-primary/20 text-primary'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {qf.label}
          </button>
        ))}
      </div>

      {/* Dropdown filters — single row */}
      <div className="flex items-center gap-2 flex-nowrap overflow-x-auto">
        <select
          value={filters.owner || ''}
          onChange={e => setFilters(f => ({ ...f, owner: e.target.value || undefined }))}
          className={selectClass}
        >
          <option value="">All Owners</option>
          {profiles.map((p: any) => <option key={p.id} value={p.user_id}>{p.full_name || p.email}</option>)}
        </select>

        <select
          value={filters.stage || ''}
          onChange={e => setFilters(f => ({ ...f, stage: e.target.value || undefined }))}
          className={selectClass}
        >
          <option value="">All Stages</option>
          {stageOrder.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={filters.dataset || ''}
          onChange={e => setFilters(f => ({ ...f, dataset: e.target.value || undefined }))}
          className={selectClass}
        >
          <option value="">All Datasets</option>
          {datasets.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>

        <select
          value={filters.clientType || ''}
          onChange={e => setFilters(f => ({ ...f, clientType: e.target.value || undefined }))}
          className={selectClass}
        >
          <option value="">All Types</option>
          {[...new Set(clients.map((c: any) => c.client_type))].map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap shrink-0">
          <input type="checkbox" checked={!!filters.openOnly} onChange={e => setFilters(f => ({ ...f, openOnly: e.target.checked, closedOnly: false }))} className="rounded" />
          Open only
        </label>

        {activeCount > 0 && (
          <button onClick={clearAll} className="flex items-center gap-1 px-2 py-1 text-xs text-destructive hover:text-destructive/80 whitespace-nowrap shrink-0">
            <X size={12} /> Clear
          </button>
        )}
      </div>
    </div>
  );
}
