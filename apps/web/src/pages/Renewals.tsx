import AppLayout from '@/components/AppLayout';
import { formatCurrency } from '@/data/mockData';
import { useCurrencyRerender } from '@/hooks/useCurrencyRerender';
import { RefreshCw, AlertTriangle, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import { useToast } from '@/hooks/use-toast';
import { useRenewals, useCreateRenewal, useUpdateRenewal } from '@/hooks/useRenewals';
import { useClients, useDatasets, useContracts } from '@/hooks/useCrmData';
import { useProfiles } from '@/hooks/useProfiles';
import { useAuth } from '@/contexts/AuthContext';

const statusOptions = ['Upcoming', 'Negotiation', 'Renewed', 'Lost'];
const currentYear = new Date().getFullYear();

export default function Renewals() {
  useCurrencyRerender();
  const navigate = useNavigate();
  const { data: renewals = [], isLoading } = useRenewals();
  const { data: clients = [] } = useClients();
  const { data: datasets = [] } = useDatasets();
  const { data: contracts = [] } = useContracts();
  const { data: profiles = [] } = useProfiles();
  const { user } = useAuth();
  const createRenewal = useCreateRenewal();
  const updateRenewal = useUpdateRenewal();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [clientId, setClientId] = useState('');
  const [datasetId, setDatasetId] = useState('');
  const [contractId, setContractId] = useState('');
  const [renewalDate, setRenewalDate] = useState('');
  const [value, setValue] = useState('');
  const [probability, setProbability] = useState('50');
  const [ownerId, setOwnerId] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !renewalDate) { toast({ title: 'Client and date required', variant: 'destructive' }); return; }
    try {
      await createRenewal.mutateAsync({
        client_id: clientId,
        dataset_id: datasetId || undefined,
        contract_id: contractId || undefined,
        renewal_date: renewalDate,
        value: Number(value) || 0,
        probability: Number(probability) || 50,
        owner_id: ownerId || user?.id || undefined,
      });
      toast({ title: '✓ Renewal created' });
      setShowCreate(false);
      setClientId(''); setDatasetId(''); setContractId(''); setRenewalDate(''); setValue(''); setOwnerId('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleUpdate = async (id: string, field: string, val: any) => {
    try {
      await updateRenewal.mutateAsync({ id, [field]: val });
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    }
  };

  if (isLoading) return <AppLayout><LoadingState /></AppLayout>;

  const filtered = renewals.filter((r: any) => new Date(r.renewal_date).getFullYear() === selectedYear);
  const sorted = [...filtered].sort((a: any, b: any) => new Date(a.renewal_date).getTime() - new Date(b.renewal_date).getTime());
  const daysUntil = (date: string) => Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const totalValue = filtered.reduce((s: number, r: any) => s + Number(r.value), 0);
  const activeContracts = contracts.filter((c: any) => c.status === 'Active');

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Renewals & Contracts</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} renewals · {formatCurrency(totalValue)} total · {activeContracts.length} active contracts
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-md border border-border bg-muted p-0.5 text-sm">
            <button
              onClick={() => setSelectedYear(currentYear)}
              className={`px-3 py-1.5 rounded font-medium transition-colors ${selectedYear === currentYear ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {currentYear}
            </button>
            <button
              onClick={() => setSelectedYear(currentYear + 1)}
              className={`px-3 py-1.5 rounded font-medium transition-colors ${selectedYear === currentYear + 1 ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {currentYear + 1}
            </button>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90">
            <Plus size={14} /> New Renewal
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <form onSubmit={handleCreate} className="data-card w-full max-w-md space-y-4">
            <h2 className="text-sm font-semibold">New Renewal</h2>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Client *</label>
              <select value={clientId} onChange={e => setClientId(e.target.value)} required
                className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm">
                <option value="">Select client</option>
                {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Owner *</label>
              <select value={ownerId} onChange={e => setOwnerId(e.target.value)}
                className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm">
                <option value="">Me (default)</option>
                {profiles.map((p: any) => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Dataset</label>
                <select value={datasetId} onChange={e => setDatasetId(e.target.value)}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm">
                  <option value="">Select dataset</option>
                  {datasets.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Contract</label>
                <select value={contractId} onChange={e => setContractId(e.target.value)}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm">
                  <option value="">No contract</option>
                  {contracts.filter((c: any) => !clientId || c.client_id === clientId).map((c: any) => (
                    <option key={c.id} value={c.id}>{c.clients?.name} — {formatCurrency(c.contract_value)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Renewal Date *</label>
                <input type="date" value={renewalDate} onChange={e => setRenewalDate(e.target.value)} required
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Value ($)</label>
                <input type="number" value={value} onChange={e => setValue(e.target.value)} min="0"
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Probability (%)</label>
                <input type="number" value={probability} onChange={e => setProbability(e.target.value)} min="0" max="100"
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-2 text-sm text-muted-foreground">Cancel</button>
              <button type="submit" disabled={createRenewal.isPending}
                className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50">
                {createRenewal.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeContracts.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="data-card py-3 px-4">
            <span className="metric-label">Active Contracts</span>
            <p className="text-lg font-semibold font-mono mt-1">{activeContracts.length}</p>
          </div>
          <div className="data-card py-3 px-4">
            <span className="metric-label">Contract Value</span>
            <p className="text-lg font-semibold font-mono mt-1">{formatCurrency(activeContracts.reduce((s: number, c: any) => s + Number(c.contract_value), 0))}</p>
          </div>
          <div className="data-card py-3 px-4">
            <span className="metric-label">Renewals Due 30d</span>
            <p className="text-lg font-semibold font-mono mt-1 text-warning">{sorted.filter((r: any) => daysUntil(r.renewal_date) <= 30 && daysUntil(r.renewal_date) > 0 && !['Renewed', 'Lost'].includes(r.status)).length}</p>
          </div>
          <div className="data-card py-3 px-4">
            <span className="metric-label">Renewal Value</span>
            <p className="text-lg font-semibold font-mono mt-1">{formatCurrency(totalValue)}</p>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={RefreshCw} title={`No renewals for ${selectedYear}`} description="Create a renewal or switch years." actionLabel="New Renewal" onAction={() => setShowCreate(true)} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left py-2 px-3 font-medium">Client</th>
                <th className="text-left py-2 px-3 font-medium">Dataset</th>
                <th className="text-left py-2 px-3 font-medium">Owner</th>
                <th className="text-left py-2 px-3 font-medium">Renewal Date</th>
                <th className="text-left py-2 px-3 font-medium">Days</th>
                <th className="text-left py-2 px-3 font-medium">Status</th>
                <th className="text-right py-2 px-3 font-medium">Value</th>
                <th className="text-right py-2 px-3 font-medium">Prob %</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r: any) => {
                const days = daysUntil(r.renewal_date);
                const urgent = days <= 30 && days > 0 && !['Renewed', 'Lost'].includes(r.status);
                return (
                  <tr key={r.id} className={`border-b border-border/50 hover:bg-muted/30 ${urgent ? 'bg-warning/5' : ''}`}>
                    <td className="py-2 px-3">
                      <a
                        href={`/clients/${r.client_id}`}
                        onClick={e => { e.preventDefault(); navigate(`/clients/${r.client_id}`); }}
                        className="text-sm font-medium hover:text-primary hover:underline cursor-pointer transition-colors"
                      >
                        {r.clients?.name || '—'}
                      </a>
                    </td>
                    <td className="py-2 px-3">
                      <select
                        value={r.dataset_id || ''}
                        onChange={e => handleUpdate(r.id, 'dataset_id', e.target.value || null)}
                        className="bg-transparent border-none text-sm p-0 cursor-pointer hover:text-primary max-w-[180px] truncate"
                      >
                        <option value="">—</option>
                        {datasets.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </td>
                    <td className="py-2 px-3">
                      <select
                        value={r.owner_id || ''}
                        onChange={e => handleUpdate(r.id, 'owner_id', e.target.value || null)}
                        className="bg-transparent border-none text-sm p-0 cursor-pointer hover:text-primary max-w-[130px] truncate"
                      >
                        <option value="">Unassigned</option>
                        {profiles.map((p: any) => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
                      </select>
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="date"
                        defaultValue={r.renewal_date}
                        onBlur={e => { if (e.target.value !== r.renewal_date) handleUpdate(r.id, 'renewal_date', e.target.value); }}
                        className="bg-transparent border-none text-sm p-0 cursor-pointer hover:text-primary w-[130px]"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <span className={`text-xs font-mono ${['Renewed', 'Lost'].includes(r.status) ? 'text-muted-foreground' : urgent ? 'text-warning font-semibold' : days <= 0 ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                        {['Renewed', 'Lost'].includes(r.status) ? (days > 0 ? `${days}d` : '—') : days > 0 ? `${days}d` : days === 0 ? 'Today' : 'Overdue'}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <select
                        value={r.status}
                        onChange={e => handleUpdate(r.id, 'status', e.target.value)}
                        className={`bg-transparent border-none text-xs font-medium p-0 cursor-pointer ${
                          r.status === 'Renewed' ? 'text-success' : r.status === 'Lost' ? 'text-destructive' : r.status === 'Negotiation' ? 'text-warning' : 'text-info'
                        }`}
                      >
                        {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <EditableNumber value={Number(r.value)} onSave={v => handleUpdate(r.id, 'value', v)} />
                    </td>
                    <td className="py-2 px-3 text-right">
                      <EditableNumber value={r.probability} onSave={v => handleUpdate(r.id, 'probability', v)} suffix="%" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}

function EditableNumber({ value, onSave, suffix = '' }: { value: number; onSave: (v: number) => void; suffix?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  if (editing) {
    return (
      <input
        type="number"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { const n = Number(draft); if (!isNaN(n) && n !== value) onSave(n); setEditing(false); }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(String(value)); setEditing(false); } }}
        autoFocus
        className="w-20 text-right bg-muted border border-border rounded px-1.5 py-0.5 text-sm font-mono"
      />
    );
  }

  return (
    <span
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      className="font-mono cursor-pointer hover:text-primary transition-colors"
    >
      {suffix === '%' ? `${value}%` : formatCurrency(value)}
    </span>
  );
}
