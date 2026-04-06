import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency, stageOrder } from '@/data/mockData';
import { useCurrencyRerender } from '@/hooks/useCurrencyRerender';
import { ArrowUpDown, Search } from 'lucide-react';
import BallStatusBadge from '@/components/BallStatusBadge';
import { BallStatus } from '@/hooks/useActionCenter';
import { useUpdateOpportunity } from '@/hooks/useOpportunities';
import { useToast } from '@/hooks/use-toast';

interface Props {
  opps: any[];
  profiles: any[];
  onDrill: (key: string, value: string) => void;
}

type SortKey = 'name' | 'client' | 'stage' | 'value_min' | 'value_max' | 'value' | 'probability' | 'expected_close' | 'daysOpen' | 'created_at' | 'ball_status';

const ballStatusOptions: { value: string; label: string }[] = [
  { value: 'our_court', label: '🟢 Our Move' },
  { value: 'their_court', label: '🔵 Their Move' },
  { value: 'neutral', label: '⚪ Open Loop' },
  { value: 'unknown', label: '⚫ Unknown' },
];

export default function RollupTable({ opps, profiles, onDrill }: Props) {
  useCurrencyRerender();
  const navigate = useNavigate();
  const { toast } = useToast();
  const updateOpp = useUpdateOpportunity();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const now = new Date();

  const handleInlineUpdate = async (id: string, field: string, value: any) => {
    try {
      await updateOpp.mutateAsync({ id, [field]: value });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const enriched = useMemo(() => opps.map((o: any) => {
    const owner = profiles.find((p: any) => p.user_id === o.owner_id);
    const daysOpen = Math.ceil((now.getTime() - new Date(o.created_at).getTime()) / (1000 * 60 * 60 * 24));
    return { ...o, ownerName: owner?.full_name || 'Unassigned', daysOpen, weightedValue: Number(o.value) * (o.probability / 100) };
  }), [opps, profiles]);

  const filtered = useMemo(() => {
    if (!search) return enriched;
    const q = search.toLowerCase();
    return enriched.filter((o: any) =>
      o.name?.toLowerCase().includes(q) ||
      o.clients?.name?.toLowerCase().includes(q) ||
      o.datasets?.name?.toLowerCase().includes(q) ||
      o.ownerName?.toLowerCase().includes(q)
    );
  }, [enriched, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a: any, b: any) => {
      let va: any, vb: any;
      switch (sortKey) {
        case 'name': va = a.name; vb = b.name; break;
        case 'client': va = a.clients?.name || ''; vb = b.clients?.name || ''; break;
        case 'stage': va = a.stage; vb = b.stage; break;
        case 'value_min': va = Number(a.value_min); vb = Number(b.value_min); break;
        case 'value_max': va = Number(a.value_max); vb = Number(b.value_max); break;
        case 'value': va = Number(a.value); vb = Number(b.value); break;
        case 'expected_close': va = a.expected_close || ''; vb = b.expected_close || ''; break;
        case 'daysOpen': va = a.daysOpen; vb = b.daysOpen; break;
        case 'created_at': va = a.created_at; vb = b.created_at; break;
        case 'ball_status': va = a.ball_status || ''; vb = b.ball_status || ''; break;
        default: va = 0; vb = 0;
      }
      if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortAsc ? va - vb : vb - va;
    });
    return arr;
  }, [filtered, sortKey, sortAsc]);

  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(sorted.length / pageSize);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
    setPage(0);
  };

  const Th = ({ label, k, align }: { label: string; k: SortKey; align?: string }) => (
    <th onClick={() => toggleSort(k)} className={`${align === 'right' ? 'text-right' : 'text-left'} px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium cursor-pointer hover:text-foreground select-none`}>
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {label}
        <ArrowUpDown size={10} className={sortKey === k ? 'text-primary' : 'opacity-30'} />
      </div>
    </th>
  );

  const activeProfiles = profiles.filter((p: any) => p.is_active);

  const selectClass = "bg-transparent border-0 p-0 text-xs cursor-pointer focus:ring-0 focus:outline-none appearance-none";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search opportunities..."
            className="w-full pl-9 pr-3 py-2 bg-muted border border-border rounded-md text-sm"
          />
        </div>
        <span className="text-xs text-muted-foreground">{sorted.length} results</span>
      </div>

      <div className="data-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <Th label="Opportunity" k="name" />
                <Th label="Client" k="client" />
                <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Dataset</th>
                <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Owner</th>
                <Th label="Stage" k="stage" />
                <Th label="Court" k="ball_status" />
                <Th label="Min" k="value_min" align="right" />
                <Th label="Max" k="value_max" align="right" />
                <Th label="Midpoint" k="value" align="right" />
                <Th label="Prob" k="probability" align="right" />
                <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Weighted</th>
                <Th label="Close" k="expected_close" />
                <Th label="Days Open" k="daysOpen" align="right" />
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr><td colSpan={13} className="text-center py-8 text-muted-foreground">No opportunities match filters.</td></tr>
              ) : paged.map((o: any) => {
                const bs: BallStatus = o.ball_status || 'unknown';
                return (
                  <tr key={o.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2.5 font-medium max-w-[180px] truncate">
                      <span className="cursor-pointer hover:text-primary hover:underline" onClick={() => navigate(`/pipeline/${o.id}`)}>{o.name}</span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground max-w-[140px] truncate">{o.clients?.name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground max-w-[120px] truncate">{o.datasets?.name || '—'}</td>
                    <td className="px-3 py-2.5">
                      <select
                        value={o.owner_id || ''}
                        onChange={e => { e.stopPropagation(); handleInlineUpdate(o.id, 'owner_id', e.target.value || null); }}
                        className={`${selectClass} text-muted-foreground hover:text-foreground w-full max-w-[120px]`}
                      >
                        <option value="">Unassigned</option>
                        {activeProfiles.map((p: any) => (
                          <option key={p.user_id} value={p.user_id}>{p.full_name || p.email}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={o.stage}
                        onChange={e => { e.stopPropagation(); handleInlineUpdate(o.id, 'stage', e.target.value); }}
                        className={`${selectClass} font-medium text-foreground`}
                      >
                        {stageOrder.map(s => <option key={s} value={s}>{s}</option>)}
                        <optgroup label="Icebox">
                          <option value="Inactive">Inactive</option>
                        </optgroup>
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={bs}
                        onChange={e => { e.stopPropagation(); handleInlineUpdate(o.id, 'ball_status', e.target.value); }}
                        className={`${selectClass} text-foreground`}
                      >
                        {ballStatusOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{formatCurrency(Number(o.value_min) || 0)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{formatCurrency(Number(o.value_max) || 0)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{formatCurrency(Number(o.value))}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{o.probability}%</td>
                    <td className="px-3 py-2.5 text-right font-mono text-primary">{formatCurrency(o.weightedValue)}</td>
                    <td className="px-3 py-2.5">
                      <input
                        type="date"
                        value={o.expected_close || ''}
                        onChange={e => { e.stopPropagation(); handleInlineUpdate(o.id, 'expected_close', e.target.value || null); }}
                        className="bg-transparent border-0 p-0 text-xs font-mono text-muted-foreground cursor-pointer focus:ring-0 focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{o.daysOpen}d</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
          <div className="flex gap-1">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 text-xs bg-muted rounded disabled:opacity-30">Prev</button>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 text-xs bg-muted rounded disabled:opacity-30">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
