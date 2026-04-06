import AppLayout from '@/components/AppLayout';
import { useDeliveries, useCreateDelivery, useUpdateDelivery, useClients, useDatasets } from '@/hooks/useCrmData';
import { Truck, Plus, FlaskConical, Package } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import { useToast } from '@/hooks/use-toast';

type DeliveryTab = 'subscriptions' | 'trials';

const TRIAL_TYPES = ['Trial', 'Sample data'];
const ALL_TYPES = ['Full dataset', 'Trial', 'Sample data', 'API access'];
const ALL_METHODS = ['SFTP', 'API', 'Download'];
const ACCESS_STATUSES = ['not_started', 'active', 'revoked', 'expired'];
const DELIVERY_STATUSES = ['active', 'paused', 'completed', 'cancelled'];

function isTrial(d: any) {
  return TRIAL_TYPES.includes(d.delivery_type);
}

function trialDaysLeft(d: any) {
  if (!d.trial_end_date) return null;
  return Math.ceil((new Date(d.trial_end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function Deliveries() {
  const navigate = useNavigate();
  const { data: deliveries = [], isLoading } = useDeliveries();
  const { data: clients = [] } = useClients();
  const { data: datasets = [] } = useDatasets();
  const createDelivery = useCreateDelivery();
  const updateDelivery = useUpdateDelivery();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState<DeliveryTab>('subscriptions');
  const [clientId, setClientId] = useState('');
  const [datasetId, setDatasetId] = useState('');
  const [type, setType] = useState('Full dataset');
  const [method, setMethod] = useState('SFTP');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [trialStart, setTrialStart] = useState('');
  const [trialEnd, setTrialEnd] = useState('');

  const isTrialType = TRIAL_TYPES.includes(type);

  const handleUpdate = async (id: string, field: string, val: any) => {
    try {
      await updateDelivery.mutateAsync({ id, [field]: val });
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) { toast({ title: 'Select a client', variant: 'destructive' }); return; }
    try {
      await createDelivery.mutateAsync({
        client_id: clientId,
        dataset_id: datasetId || undefined,
        delivery_type: type,
        delivery_method: method,
        delivery_date: date,
        notes: notes || undefined,
        ...(isTrialType && trialStart ? { trial_start_date: trialStart } : {}),
        ...(isTrialType && trialEnd ? { trial_end_date: trialEnd } : {}),
        ...(isTrialType ? { access_status: 'active' } : { access_status: 'not_started' }),
      });
      toast({ title: '✓ Delivery logged' });
      setShowCreate(false);
      setClientId(''); setDatasetId(''); setNotes(''); setTrialStart(''); setTrialEnd('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  if (isLoading) return <AppLayout><LoadingState /></AppLayout>;

  const trials = deliveries.filter(isTrial);
  const subscriptions = deliveries.filter((d: any) => !isTrial(d));

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Deliveries</h1>
          <p className="text-sm text-muted-foreground">
            {subscriptions.length} subscriptions · {trials.length} trials
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90">
          <Plus size={14} /> Log Delivery
        </button>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <form onSubmit={handleCreate} className="data-card w-full max-w-md space-y-4">
            <h2 className="text-sm font-semibold">Log Delivery</h2>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Client *</label>
              <select value={clientId} onChange={e => setClientId(e.target.value)} required
                className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm">
                <option value="">Select client</option>
                {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Dataset</label>
              <select value={datasetId} onChange={e => setDatasetId(e.target.value)}
                className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm">
                <option value="">Select dataset</option>
                {datasets.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Type</label>
                <select value={type} onChange={e => setType(e.target.value)}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm">
                  {ALL_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Method</label>
                <select value={method} onChange={e => setMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm">
                  {ALL_METHODS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm" />
              </div>
            </div>
            {isTrialType && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Trial Start</label>
                  <input type="date" value={trialStart} onChange={e => setTrialStart(e.target.value)}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Trial End</label>
                  <input type="date" value={trialEnd} onChange={e => setTrialEnd(e.target.value)}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm" />
                </div>
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm resize-none" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-2 text-sm text-muted-foreground">Cancel</button>
              <button type="submit" disabled={createDelivery.isPending}
                className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50">
                {createDelivery.isPending ? 'Saving...' : 'Log Delivery'}
              </button>
            </div>
          </form>
        </div>
      )}

      {deliveries.length === 0 ? (
        <EmptyState icon={Truck} title="No deliveries yet" description="Log your first delivery to start tracking data distribution." actionLabel="Log Delivery" onAction={() => setShowCreate(true)} />
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1 mb-6 border-b border-border">
            <button
              onClick={() => setActiveTab('subscriptions')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'subscriptions'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Package size={14} /> Subscriptions
              <span className="ml-1 text-xs bg-muted px-1.5 py-0.5 rounded-full">{subscriptions.length}</span>
            </button>
            <button
              onClick={() => setActiveTab('trials')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'trials'
                  ? 'border-warning text-warning'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <FlaskConical size={14} /> Trials & Samples
              <span className="ml-1 text-xs bg-muted px-1.5 py-0.5 rounded-full">{trials.length}</span>
            </button>
          </div>

          {activeTab === 'subscriptions' && (
            subscriptions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No subscription deliveries</p>
            ) : (
              <div className="data-card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Client</th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Dataset</th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Type</th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Method</th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Date</th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions.map((d: any) => (
                      <SubscriptionRow key={d.id} d={d} datasets={datasets} onUpdate={handleUpdate} navigate={navigate} />
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {activeTab === 'trials' && (
            trials.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No active trials</p>
            ) : (
              <div className="data-card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-warning/5">
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Client</th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Dataset</th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Type</th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Method</th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Trial Start</th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Trial End</th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Remaining</th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Access</th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trials.map((d: any) => (
                      <TrialRow key={d.id} d={d} datasets={datasets} onUpdate={handleUpdate} navigate={navigate} />
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}
    </AppLayout>
  );
}

/* ------------------------------------------------------------------ */
/*  Subscription Row                                                   */
/* ------------------------------------------------------------------ */
function SubscriptionRow({ d, datasets, onUpdate, navigate }: { d: any; datasets: any[]; onUpdate: (id: string, field: string, val: any) => void; navigate: any }) {
  return (
    <tr className="border-b border-border/50 hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3">
        <a href={`/clients/${d.client_id}`}
          onClick={e => { e.preventDefault(); navigate(`/clients/${d.client_id}`); }}
          className="font-medium hover:text-primary hover:underline cursor-pointer transition-colors">
          {d.clients?.name || '—'}
        </a>
      </td>
      <td className="px-4 py-2">
        <select value={d.dataset_id || ''} onChange={e => onUpdate(d.id, 'dataset_id', e.target.value || null)}
          className="bg-transparent border-none text-sm p-0 cursor-pointer hover:text-primary max-w-[180px] truncate">
          <option value="">—</option>
          {datasets.map((ds: any) => <option key={ds.id} value={ds.id}>{ds.name}</option>)}
        </select>
      </td>
      <td className="px-4 py-2">
        <select value={d.delivery_type} onChange={e => onUpdate(d.id, 'delivery_type', e.target.value)}
          className="bg-transparent border-none text-sm p-0 cursor-pointer hover:text-primary">
          {ALL_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </td>
      <td className="px-4 py-2">
        <select value={d.delivery_method} onChange={e => onUpdate(d.id, 'delivery_method', e.target.value)}
          className="bg-transparent border-none text-sm p-0 cursor-pointer hover:text-primary">
          {ALL_METHODS.map(m => <option key={m}>{m}</option>)}
        </select>
      </td>
      <td className="px-4 py-2">
        <input type="date" defaultValue={d.delivery_date}
          onBlur={e => { if (e.target.value !== d.delivery_date) onUpdate(d.id, 'delivery_date', e.target.value); }}
          className="bg-transparent border-none text-sm p-0 cursor-pointer hover:text-primary font-mono text-xs w-[120px]" />
      </td>
      <td className="px-4 py-2">
        <select value={d.status || 'active'} onChange={e => onUpdate(d.id, 'status', e.target.value)}
          className={`bg-transparent border-none text-xs font-medium p-0 cursor-pointer ${
            d.status === 'active' ? 'text-success' : d.status === 'cancelled' ? 'text-destructive' : 'text-muted-foreground'
          }`}>
          {DELIVERY_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
      </td>
      <td className="px-4 py-2">
        <EditableText value={d.notes || ''} onSave={v => onUpdate(d.id, 'notes', v)} />
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/*  Trial Row                                                          */
/* ------------------------------------------------------------------ */
function TrialRow({ d, datasets, onUpdate, navigate }: { d: any; datasets: any[]; onUpdate: (id: string, field: string, val: any) => void; navigate: any }) {
  const days = trialDaysLeft(d);
  const expired = days !== null && days <= 0;
  const urgent = days !== null && days > 0 && days <= 7;

  return (
    <tr className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${expired ? 'bg-destructive/5' : urgent ? 'bg-warning/5' : ''}`}>
      <td className="px-4 py-3">
        <a href={`/clients/${d.client_id}`}
          onClick={e => { e.preventDefault(); navigate(`/clients/${d.client_id}`); }}
          className="font-medium hover:text-primary hover:underline cursor-pointer transition-colors">
          {d.clients?.name || '—'}
        </a>
      </td>
      <td className="px-4 py-2">
        <select value={d.dataset_id || ''} onChange={e => onUpdate(d.id, 'dataset_id', e.target.value || null)}
          className="bg-transparent border-none text-sm p-0 cursor-pointer hover:text-primary max-w-[180px] truncate">
          <option value="">—</option>
          {datasets.map((ds: any) => <option key={ds.id} value={ds.id}>{ds.name}</option>)}
        </select>
      </td>
      <td className="px-4 py-2">
        <select value={d.delivery_type} onChange={e => onUpdate(d.id, 'delivery_type', e.target.value)}
          className="bg-transparent border-none text-sm p-0 cursor-pointer hover:text-primary">
          {TRIAL_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </td>
      <td className="px-4 py-2">
        <select value={d.delivery_method} onChange={e => onUpdate(d.id, 'delivery_method', e.target.value)}
          className="bg-transparent border-none text-sm p-0 cursor-pointer hover:text-primary">
          {ALL_METHODS.map(m => <option key={m}>{m}</option>)}
        </select>
      </td>
      <td className="px-4 py-2">
        <input type="date" defaultValue={d.trial_start_date || ''}
          onBlur={e => { if (e.target.value !== (d.trial_start_date || '')) onUpdate(d.id, 'trial_start_date', e.target.value || null); }}
          className="bg-transparent border-none text-sm p-0 cursor-pointer hover:text-primary font-mono text-xs w-[120px]" />
      </td>
      <td className="px-4 py-2">
        <input type="date" defaultValue={d.trial_end_date || ''}
          onBlur={e => { if (e.target.value !== (d.trial_end_date || '')) onUpdate(d.id, 'trial_end_date', e.target.value || null); }}
          className="bg-transparent border-none text-sm p-0 cursor-pointer hover:text-primary font-mono text-xs w-[120px]" />
      </td>
      <td className="px-4 py-2">
        {days !== null ? (
          <span className={`text-xs font-mono font-semibold ${expired ? 'text-destructive' : urgent ? 'text-warning' : 'text-muted-foreground'}`}>
            {expired ? 'Expired' : `${days}d`}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-2">
        <select value={d.access_status || 'not_started'} onChange={e => onUpdate(d.id, 'access_status', e.target.value)}
          className={`bg-transparent border-none text-xs font-medium p-0 cursor-pointer ${
            d.access_status === 'active' ? 'text-success' :
            d.access_status === 'revoked' || d.access_status === 'expired' ? 'text-destructive' :
            'text-muted-foreground'
          }`}>
          {ACCESS_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
      </td>
      <td className="px-4 py-2">
        <EditableText value={d.notes || ''} onSave={v => onUpdate(d.id, 'notes', v)} />
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/*  Editable Text                                                      */
/* ------------------------------------------------------------------ */
function EditableText({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <input
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (draft !== value) onSave(draft); setEditing(false); }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
        autoFocus
        className="w-full bg-muted border border-border rounded px-1.5 py-0.5 text-xs"
      />
    );
  }

  return (
    <span onClick={() => { setDraft(value); setEditing(true); }}
      className="text-xs text-muted-foreground cursor-pointer hover:text-primary transition-colors truncate block max-w-[200px]">
      {value || '—'}
    </span>
  );
}
