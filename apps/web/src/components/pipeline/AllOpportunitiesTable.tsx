import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency, stageOrder, getStageColor } from '@/data/mockData';
import { useCurrencyRerender } from '@/hooks/useCurrencyRerender';
import { ArrowUpDown, Search, ChevronDown, Check } from 'lucide-react';
import { useUpdateOpportunity } from '@/hooks/useOpportunities';
import { useAddOpportunityProduct, useRemoveOpportunityProduct } from '@/hooks/useOpportunityProducts';
import { useToast } from '@/hooks/use-toast';
import { useStageConfig } from '@/hooks/useCrmSettings';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

const ballStatusOptions = [
  { value: 'our_court', label: '🟢 Our Move' },
  { value: 'their_court', label: '🔵 Their Move' },
  { value: 'neutral', label: '⚪ Open Loop' },
  { value: 'unknown', label: '⚫ Unknown' },
];

const dealTypeOptions = ['New Business', 'Upsell', 'Renewal', 'Trial'];

type SortKey = 'name' | 'client' | 'dataset' | 'owner' | 'stage' | 'ball_status' | 'deal_type' | 'value_min' | 'value_max' | 'value' | 'probability' | 'expected_close' | 'next_action' | 'created_at';

interface Props {
  opportunities: any[];
  profiles: any[];
  clients: any[];
  datasets: any[];
  scope?: string;
  userId?: string;
}

/** Inline dropdown for table cells — renders in a portal so it inherits the dark theme */
function CellDropdown({ value, options, onChange, placeholder }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const selected = options.find(o => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
        <button className="flex items-center gap-1 text-xs hover:bg-muted/50 rounded px-1.5 py-0.5 -mx-1 transition-colors w-full text-left">
          <span className="truncate flex-1">{selected?.label || placeholder || '—'}</span>
          <ChevronDown size={10} className="shrink-0 opacity-40" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[140px] max-h-[280px] overflow-y-auto">
        {placeholder && (
          <>
            <DropdownMenuItem onClick={() => onChange('')} className="text-xs text-muted-foreground">
              {placeholder}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {options.map(opt => (
          <DropdownMenuItem key={opt.value} onClick={() => onChange(opt.value)} className="text-xs flex items-center gap-2">
            {opt.value === value && <Check size={10} className="text-primary" />}
            <span className={opt.value === value ? 'font-medium' : ''}>{opt.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function AllOpportunitiesTable({ opportunities, profiles, clients, datasets, scope, userId }: Props) {
  useCurrencyRerender();
  const navigate = useNavigate();
  const { toast } = useToast();
  const updateOpp = useUpdateOpportunity();
  const addProduct = useAddOpportunityProduct();
  const removeProduct = useRemoveOpportunityProduct();
  const configuredStages = useStageConfig();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterCourt, setFilterCourt] = useState('');
  const [filterOwner, setFilterOwner] = useState(scope === 'mine' && userId ? userId : '');
  const pageSize = 30;

  const stageOptions = useMemo(() => [
    ...configuredStages.map(s => ({ value: s, label: s })),
    { value: 'Inactive', label: 'Inactive' },
  ], [configuredStages]);

  const ownerOptions = useMemo(() =>
    profiles.filter((p: any) => p.is_active).map((p: any) => ({ value: p.user_id, label: p.full_name || p.email })),
  [profiles]);

  const clientOptions = useMemo(() =>
    clients.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')).map((c: any) => ({ value: c.id, label: c.name })),
  [clients]);

  const datasetOptions = useMemo(() =>
    datasets.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')).map((d: any) => ({ value: d.id, label: d.name })),
  [datasets]);

  const dealTypeOpts = useMemo(() => dealTypeOptions.map(dt => ({ value: dt, label: dt })), []);
  const ballStatusOpts = useMemo(() => ballStatusOptions.map(o => ({ value: o.value, label: o.label })), []);

  const save = useCallback(async (id: string, field: string, value: any) => {
    try {
      await updateOpp.mutateAsync({ id, [field]: value });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  }, [updateOpp, toast]);

  const startEdit = (id: string, field: string, currentValue: string) => {
    setEditingCell({ id, field });
    setEditValue(currentValue || '');
  };

  const commitEdit = () => {
    if (editingCell) {
      const numericFields = ['value', 'value_min', 'value_max', 'probability'];
      const val = numericFields.includes(editingCell.field)
        ? Number(editValue) || 0
        : editValue || null;
      save(editingCell.id, editingCell.field, val);
      // Auto-update midpoint when min or max changes
      if (editingCell.field === 'value_min' || editingCell.field === 'value_max') {
        const opp = opportunities.find((o: any) => o.id === editingCell.id);
        if (opp) {
          const minVal = editingCell.field === 'value_min' ? (Number(editValue) || 0) : (Number(opp.value_min) || 0);
          const maxVal = editingCell.field === 'value_max' ? (Number(editValue) || 0) : (Number(opp.value_max) || 0);
          save(editingCell.id, 'value', Math.round((minVal + maxVal) / 2));
        }
      }
      setEditingCell(null);
    }
  };

  const cancelEdit = () => setEditingCell(null);

  const enriched = useMemo(() => opportunities.map((o: any) => {
    const owner = profiles.find((p: any) => p.user_id === o.owner_id);
    return { ...o, ownerName: owner?.full_name || 'Unassigned' };
  }), [opportunities, profiles]);

  const filtered = useMemo(() => {
    let result = enriched;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((o: any) =>
        o.name?.toLowerCase().includes(q) ||
        o.clients?.name?.toLowerCase().includes(q) ||
        o.datasets?.name?.toLowerCase().includes(q) ||
        o.ownerName?.toLowerCase().includes(q) ||
        o.stage?.toLowerCase().includes(q)
      );
    }
    if (filterType) result = result.filter((o: any) => o.deal_type === filterType);
    if (filterCourt) result = result.filter((o: any) => (o.ball_status || 'unknown') === filterCourt);
    if (filterOwner) result = result.filter((o: any) => o.owner_id === filterOwner);
    return result;
  }, [enriched, search, filterType, filterCourt, filterOwner]);

  const activeInlineFilterCount = [filterType, filterCourt, filterOwner].filter(Boolean).length;

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a: any, b: any) => {
      let va: any, vb: any;
      switch (sortKey) {
        case 'name': va = a.name || ''; vb = b.name || ''; break;
        case 'client': va = a.clients?.name || ''; vb = b.clients?.name || ''; break;
        case 'dataset': va = a.datasets?.name || ''; vb = b.datasets?.name || ''; break;
        case 'owner': va = a.ownerName; vb = b.ownerName; break;
        case 'stage': va = stageIndexMap.get(a.stage) ?? 99; vb = stageIndexMap.get(b.stage) ?? 99; break;
        case 'ball_status': va = a.ball_status || ''; vb = b.ball_status || ''; break;
        case 'deal_type': va = a.deal_type || ''; vb = b.deal_type || ''; break;
        case 'value_min': va = Number(a.value_min); vb = Number(b.value_min); break;
        case 'value_max': va = Number(a.value_max); vb = Number(b.value_max); break;
        case 'value': va = Number(a.value); vb = Number(b.value); break;
        case 'probability': va = a.probability; vb = b.probability; break;
        case 'expected_close': va = a.expected_close || ''; vb = b.expected_close || ''; break;
        case 'next_action': va = a.next_action_due_date || ''; vb = b.next_action_due_date || ''; break;
        case 'created_at': va = a.created_at; vb = b.created_at; break;
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

  // Sort by configured stages order when sorting by stage
  const stageIndexMap = useMemo(() => {
    const m = new Map<string, number>();
    configuredStages.forEach((s, i) => m.set(s, i));
    m.set('Inactive', configuredStages.length);
    return m;
  }, [configuredStages]);

  const Th = ({ label, k, align }: { label: string; k: SortKey; align?: string }) => (
    <th
      onClick={() => toggleSort(k)}
      className={`${align === 'right' ? 'text-right' : 'text-left'} px-2.5 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium cursor-pointer hover:text-foreground select-none whitespace-nowrap`}
    >
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {label}
        <ArrowUpDown size={10} className={sortKey === k ? 'text-primary' : 'opacity-30'} />
      </div>
    </th>
  );

  const isEditing = (id: string, field: string) => editingCell?.id === id && editingCell?.field === field;

  const EditableText = ({
    id,
    field,
    value,
    startValue,
    displayValue,
    mono,
  }: {
    id: string;
    field: string;
    value: string;
    startValue?: string;
    displayValue?: string;
    mono?: boolean;
  }) => {
    if (isEditing(id, field)) {
      return (
        <input
          autoFocus
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
          className={`bg-muted border border-border rounded px-1.5 py-0.5 text-xs w-full focus:outline-none focus:ring-1 focus:ring-primary ${mono ? 'font-mono' : ''}`}
        />
      );
    }
    return (
      <span
        onClick={e => { e.stopPropagation(); startEdit(id, field, startValue ?? value); }}
        className={`cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 -mx-1 transition-colors ${mono ? 'font-mono' : ''} ${!(displayValue ?? value) ? 'text-muted-foreground/50 italic' : ''}`}
      >
        {(displayValue ?? value) || '—'}
      </span>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search all opportunities..."
            className="w-full pl-9 pr-3 py-2 bg-muted border border-border rounded-md text-sm"
          />
        </div>
        <select value={filterOwner} onChange={e => { setFilterOwner(e.target.value); setPage(0); }} className="bg-muted border border-border rounded-md px-2.5 py-2 text-xs min-w-[120px]">
          <option value="">All Owners</option>
          {ownerOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(0); }} className="bg-muted border border-border rounded-md px-2.5 py-2 text-xs min-w-[100px]">
          <option value="">All Types</option>
          {dealTypeOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={filterCourt} onChange={e => { setFilterCourt(e.target.value); setPage(0); }} className="bg-muted border border-border rounded-md px-2.5 py-2 text-xs min-w-[110px]">
          <option value="">All Courts</option>
          {ballStatusOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {activeInlineFilterCount > 0 && (
          <button onClick={() => { setFilterType(''); setFilterCourt(''); setFilterOwner(''); setPage(0); }} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
        )}
        <span className="text-xs text-muted-foreground">{sorted.length} opportunities</span>
      </div>

      <div className="data-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs table-fixed">
            <colgroup>
              <col className="w-[180px]" /> {/* Opportunity */}
              <col className="w-[150px]" /> {/* Client */}
              <col className="w-[130px]" /> {/* Dataset */}
              <col className="w-[130px]" /> {/* Owner */}
              <col className="w-[160px]" /> {/* Stage */}
              <col className="w-[130px]" /> {/* Court */}
              <col className="w-[110px]" /> {/* Type */}
              <col className="w-[90px]" />  {/* Min Value */}
              <col className="w-[90px]" />  {/* Max Value */}
              <col className="w-[90px]" />  {/* Midpoint */}
              <col className="w-[60px]" />  {/* Prob */}
              <col className="w-[90px]" />  {/* Weighted */}
              <col className="w-[110px]" /> {/* Close Date */}
              <col className="w-[110px]" /> {/* Next Action */}
              <col className="w-[180px]" /> {/* Next Action Desc */}
              <col className="w-[180px]" /> {/* Notes */}
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <Th label="Opportunity" k="name" />
                <Th label="Client" k="client" />
                <Th label="Dataset" k="dataset" />
                <Th label="Owner" k="owner" />
                <Th label="Stage" k="stage" />
                <Th label="Court" k="ball_status" />
                <Th label="Type" k="deal_type" />
                <Th label="Min" k="value_min" align="right" />
                <Th label="Max" k="value_max" align="right" />
                <Th label="Midpoint" k="value" align="right" />
                <Th label="Prob" k="probability" align="right" />
                <th className="text-right px-2.5 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium whitespace-nowrap">Weighted</th>
                <Th label="Close Date" k="expected_close" />
                <Th label="Next Action" k="next_action" />
                <th className="text-left px-2.5 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium whitespace-nowrap">Next Action Desc</th>
                <th className="text-left px-2.5 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium whitespace-nowrap">Notes</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr><td colSpan={16} className="text-center py-8 text-muted-foreground">No opportunities found.</td></tr>
              ) : paged.map((o: any) => (
                <tr key={o.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors group">
                  {/* Name - click navigates */}
                  <td className="px-2.5 py-2 max-w-[180px]">
                    <span
                      className="font-medium cursor-pointer hover:text-primary hover:underline truncate block"
                      onClick={() => navigate(`/pipeline/${o.id}`)}
                    >
                      {o.name}
                    </span>
                  </td>

                  {/* Client */}
                  <td className="px-2.5 py-2 max-w-[140px]">
                    <CellDropdown value={o.client_id || ''} options={clientOptions} onChange={v => save(o.id, 'client_id', v || null)} placeholder="—" />
                  </td>

                  {/* Products (tags) */}
                  <td className="px-2.5 py-2 max-w-[180px]">
                    <div className="flex flex-wrap gap-1 items-center">
                      {(o.opportunity_products || []).map((p: any) => (
                        <span key={p.id} className="inline-flex items-center gap-0.5 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full group/tag">
                          {p.datasets?.name || '?'}
                          <button
                            onClick={(e) => { e.stopPropagation(); removeProduct.mutate({ id: p.id, opportunityId: o.id }); }}
                            className="opacity-0 group-hover/tag:opacity-100 hover:text-destructive transition-opacity"
                          >×</button>
                        </span>
                      ))}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <button className="text-[10px] text-muted-foreground hover:text-primary px-1 py-0.5 rounded hover:bg-muted">+</button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="max-h-48 overflow-y-auto">
                          <DropdownMenuLabel className="text-[10px]">Add Product</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {datasetOptions
                            .filter((d: any) => !(o.opportunity_products || []).some((p: any) => p.dataset_id === d.value))
                            .map((d: any) => (
                              <DropdownMenuItem key={d.value} className="text-xs" onClick={(e) => { e.stopPropagation(); addProduct.mutate({ opportunityId: o.id, datasetId: d.value, revenue: 0 }); }}>
                                {d.label}
                              </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>

                  {/* Owner */}
                  <td className="px-2.5 py-2 max-w-[120px]">
                    <CellDropdown value={o.owner_id || ''} options={ownerOptions} onChange={v => save(o.id, 'owner_id', v || null)} placeholder="Unassigned" />
                  </td>

                  {/* Stage */}
                  <td className="px-2.5 py-2">
                    <CellDropdown value={o.stage} options={stageOptions} onChange={v => {
                      if (v === 'Closed Won') {
                        const input = window.prompt('Enter actual deal value ($):', String(Number(o.value) || 0));
                        if (input === null) return; // cancelled
                        const actualVal = Number(input) || 0;
                        save(o.id, 'stage', v);
                        save(o.id, 'actual_value', actualVal);
                      } else {
                        save(o.id, 'stage', v);
                      }
                    }} />
                  </td>

                  {/* Court */}
                  <td className="px-2.5 py-2">
                    <CellDropdown value={o.ball_status || 'unknown'} options={ballStatusOpts} onChange={v => save(o.id, 'ball_status', v)} />
                  </td>

                  {/* Type */}
                  <td className="px-2.5 py-2">
                    <CellDropdown value={o.deal_type || ''} options={dealTypeOpts} onChange={v => save(o.id, 'deal_type', v || null)} placeholder="—" />
                  </td>

                  {/* Min Value - editable in USD, displayed in active currency */}
                  <td className="px-2.5 py-2 text-right">
                    <EditableText
                      id={o.id}
                      field="value_min"
                      value={isEditing(o.id, 'value_min') ? editValue : String(Number(o.value_min) || 0)}
                      startValue={String(Number(o.value_min) || 0)}
                      displayValue={formatCurrency(Number(o.value_min) || 0)}
                      mono
                    />
                  </td>

                  {/* Max Value - editable in USD, displayed in active currency */}
                  <td className="px-2.5 py-2 text-right">
                    <EditableText
                      id={o.id}
                      field="value_max"
                      value={isEditing(o.id, 'value_max') ? editValue : String(Number(o.value_max) || 0)}
                      startValue={String(Number(o.value_max) || 0)}
                      displayValue={formatCurrency(Number(o.value_max) || 0)}
                      mono
                    />
                  </td>

                  {/* Midpoint - computed */}
                  <td className="px-2.5 py-2 text-right font-mono text-muted-foreground">
                    {formatCurrency(Math.round((Number(o.value_min || 0) + Number(o.value_max || 0)) / 2))}
                  </td>

                  {/* Probability - editable text */}
                  <td className="px-2.5 py-2 text-right">
                    <EditableText id={o.id} field="probability" value={isEditing(o.id, 'probability') ? editValue : String(o.probability)} startValue={String(o.probability)} displayValue={`${o.probability}%`} mono />
                  </td>

                  {/* Weighted - computed, read-only */}
                  <td className="px-2.5 py-2 text-right font-mono text-primary">
                    {formatCurrency(Number(o.value) * (o.probability / 100))}
                  </td>

                  {/* Expected Close - date input */}
                  <td className="px-2.5 py-2">
                    <input
                      type="date"
                      value={o.expected_close || ''}
                      onChange={e => { e.stopPropagation(); save(o.id, 'expected_close', e.target.value || null); }}
                      className="bg-transparent border-0 p-0 text-xs font-mono text-muted-foreground cursor-pointer focus:ring-0 focus:outline-none"
                    />
                  </td>

                  {/* Next Action Due Date */}
                  <td className="px-2.5 py-2">
                    <input
                      type="date"
                      value={o.next_action_due_date || ''}
                      onChange={e => { e.stopPropagation(); save(o.id, 'next_action_due_date', e.target.value || null); }}
                      className={`bg-transparent border-0 p-0 text-xs font-mono cursor-pointer focus:ring-0 focus:outline-none ${
                        o.next_action_due_date && o.next_action_due_date < new Date().toISOString().split('T')[0]
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                      }`}
                    />
                  </td>

                  {/* Next Action Description - editable */}
                  <td className="px-2.5 py-2 max-w-[180px]">
                    <EditableText id={o.id} field="next_action_description" value={o.next_action_description || ''} />
                  </td>

                  {/* Notes - editable */}
                  <td className="px-2.5 py-2 max-w-[180px]">
                    <EditableText id={o.id} field="notes" value={o.notes || ''} />
                  </td>
                </tr>
              ))}
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
