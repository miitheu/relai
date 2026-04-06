import { useState, useEffect, useRef, useMemo } from 'react';
import { X, ChevronDown, ChevronRight, Plus, Zap, Search } from 'lucide-react';
import { useQuickCreate } from '@/contexts/QuickCreateContext';
import { useClients, useDatasets, useCreateOpportunity, useCreateClient, useProfiles } from '@/hooks/useCrmData';
import { useAuth } from '@/contexts/AuthContext';
import { useSupabase } from '@/hooks/useSupabase';
import { stageOrder } from '@/data/mockData';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

const stageProbability: Record<string, number> = {
  'Lead': 10, 'Initial Discussion': 20, 'Demo Scheduled': 35, 'Trial': 50,
  'Evaluation': 60, 'Commercial Discussion': 75, 'Contract Sent': 90, 'Closed Won': 100, 'Closed Lost': 0,
};

function SearchableSelect({ value, onChange, options, placeholder, onCreateNew, createLabel }: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  placeholder: string;
  onCreateNew?: () => void;
  createLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() =>
    options.filter(o => o.label.toLowerCase().includes(search.toLowerCase())),
    [options, search]
  );

  const selectedLabel = options.find(o => o.id === value)?.label;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(!open); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-muted border border-border rounded-lg text-sm hover:border-primary/40 transition-colors"
      >
        <span className={selectedLabel ? 'text-foreground' : 'text-muted-foreground'}>
          {selectedLabel || placeholder}
        </span>
        <ChevronDown size={14} className="text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-muted rounded-md">
              <Search size={13} className="text-muted-foreground" />
              <input
                ref={inputRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="bg-transparent text-sm outline-none flex-1 text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">No results</div>
            )}
            {filtered.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(o.id); setOpen(false); setSearch(''); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${o.id === value ? 'bg-primary/10 text-primary' : 'text-foreground'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {onCreateNew && (
            <button
              type="button"
              onClick={() => { onCreateNew(); setOpen(false); setSearch(''); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-primary hover:bg-primary/5 border-t border-border transition-colors"
            >
              <Plus size={13} />
              {createLabel || 'Create new'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function QuickCreateOpportunity() {
  const supabase = useSupabase();
  const { isOpen, defaults, close } = useQuickCreate();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const createOpp = useCreateOpportunity();
  const createClient = useCreateClient();
  const { data: clients = [] } = useClients();
  const { data: datasets = [] } = useDatasets();
  const { data: profiles = [] } = useProfiles();

  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [datasetId, setDatasetId] = useState('');
  const [stage, setStage] = useState('Lead');
  const [valueMin, setValueMin] = useState('');
  const [valueMax, setValueMax] = useState('');
  const [closeDate, setCloseDate] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [ownerId, setOwnerId] = useState('');
  const [probability, setProbability] = useState('10');
  const [notes, setNotes] = useState('');
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientType, setNewClientType] = useState('Hedge Fund');
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);

  // Reset form when opened with new defaults
  useEffect(() => {
    if (isOpen) {
      setName('');
      setClientId(defaults.client_id || '');
      setDatasetId(defaults.dataset_id || '');
      setStage(defaults.stage || 'Lead');
      setValueMin('');
      setValueMax('');
      setCloseDate('');
      setShowDetails(false);
      setOwnerId(defaults.owner_id || user?.id || '');
      setProbability(String(stageProbability[defaults.stage || 'Lead'] || 10));
      setNotes('');
      setShowNewClient(false);
      setNewClientName('');
      setLastCreatedId(null);
      setTimeout(() => nameRef.current?.focus(), 150);
    }
  }, [isOpen, defaults, user?.id]);

  // Auto-adjust probability when stage changes
  useEffect(() => {
    if (stageProbability[stage] !== undefined) {
      setProbability(String(stageProbability[stage]));
    }
  }, [stage]);

  if (!isOpen) return null;

  const clientOptions = clients.map((c: any) => ({ id: c.id, label: c.name }));
  const datasetOptions = datasets.map((d: any) => ({ id: d.id, label: d.name }));
  const profileOptions = profiles.map((p: any) => ({ id: p.user_id, label: p.full_name || p.email }));

  const handleCreateClient = async () => {
    if (!newClientName.trim()) return;
    try {
      const result = await createClient.mutateAsync({ name: newClientName.trim(), client_type: newClientType });
      setClientId(result.id);
      setShowNewClient(false);
      setNewClientName('');
      toast({ title: `Client "${result.name}" created` });
    } catch (err: any) {
      toast({ title: 'Error creating client', description: err.message, variant: 'destructive' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) {
      toast({ title: 'Please select a client', variant: 'destructive' });
      return;
    }
    if (!name.trim()) {
      toast({ title: 'Please enter an opportunity name', variant: 'destructive' });
      return;
    }
    try {
      const minVal = Number(valueMin) || 0;
      const maxVal = Number(valueMax) || 0;
      const midpoint = Math.round((minVal + maxVal) / 2);
      const result = await createOpp.mutateAsync({
        name: name.trim(),
        client_id: clientId,
        dataset_id: datasetId || undefined,
        stage,
        value: midpoint,
        value_min: minVal,
        value_max: maxVal,
        probability: Number(probability) || 10,
        expected_close: closeDate || undefined,
        owner_id: ownerId || user?.id,
        notes: notes || undefined,
      });
      setLastCreatedId(result.id);

      // Also add to opportunity_products if a dataset was selected
      if (datasetId && result.id) {
        await supabase.from('opportunity_products').insert({
          opportunity_id: result.id,
          dataset_id: datasetId,
          revenue: 0,
        });
      }

      toast({
        title: '✓ Opportunity created',
        description: `${name} added to ${stage}`,
      });
      close();
      navigate(`/pipeline/${result.id}?draft=initial`);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm" onClick={close} />

      {/* Slide-over */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg flex flex-col bg-card border-l border-border shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 h-14 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center">
              <Zap size={13} className="text-primary" />
            </div>
            <h2 className="text-sm font-semibold text-foreground">Quick Create Opportunity</h2>
          </div>
          <button onClick={close} className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-5">
            {/* Quick capture section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Quick Capture</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {/* Opportunity Name */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Opportunity Name *</label>
                <input
                  ref={nameRef}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  placeholder="e.g. Schonfeld — ESG Signals Trial"
                  className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-sm focus:border-primary/40 focus:ring-1 focus:ring-primary/20 outline-none transition-all placeholder:text-muted-foreground/50"
                />
              </div>

              {/* Client */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Client *</label>
                {showNewClient ? (
                  <div className="space-y-2">
                    <input
                      value={newClientName}
                      onChange={e => setNewClientName(e.target.value)}
                      placeholder="Client name"
                      className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-sm focus:border-primary/40 outline-none"
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <select
                        value={newClientType}
                        onChange={e => setNewClientType(e.target.value)}
                        className="flex-1 px-3 py-2 bg-muted border border-border rounded-lg text-sm"
                      >
                        {['Hedge Fund', 'Bank', 'Asset Manager', 'Corporate', 'Vendor', 'Other'].map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleCreateClient}
                        disabled={!newClientName.trim() || createClient.isPending}
                        className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
                      >
                        {createClient.isPending ? '...' : 'Add'}
                      </button>
                      <button type="button" onClick={() => setShowNewClient(false)} className="px-2 py-2 text-sm text-muted-foreground">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <SearchableSelect
                    value={clientId}
                    onChange={setClientId}
                    options={clientOptions}
                    placeholder="Search clients..."
                    onCreateNew={() => setShowNewClient(true)}
                    createLabel="Create new client"
                  />
                )}
              </div>

              {/* Dataset */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Dataset</label>
                <SearchableSelect
                  value={datasetId}
                  onChange={setDatasetId}
                  options={datasetOptions}
                  placeholder="Search datasets..."
                />
              </div>

              {/* Stage + Value row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Stage</label>
                  <select
                    value={stage}
                    onChange={e => setStage(e.target.value)}
                    className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-sm"
                  >
                    {stageOrder.filter(s => s !== 'Closed Won' && s !== 'Closed Lost').map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                   <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Min Value ($) *</label>
                   <input
                     value={valueMin}
                     onChange={e => setValueMin(e.target.value)}
                     type="number"
                     min="0"
                     required
                     placeholder="0"
                     className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-sm focus:border-primary/40 outline-none"
                   />
                 </div>
               </div>
               <div className="grid grid-cols-2 gap-3">
                 <div>
                   <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Max Value ($) *</label>
                   <input
                     value={valueMax}
                     onChange={e => setValueMax(e.target.value)}
                     type="number"
                     min="0"
                     required
                     placeholder="0"
                     className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-sm focus:border-primary/40 outline-none"
                   />
                 </div>
              </div>

              {/* Expected Close */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Expected Close Date</label>
                <input
                  value={closeDate}
                  onChange={e => setCloseDate(e.target.value)}
                  type="date"
                  className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-sm focus:border-primary/40 outline-none"
                />
              </div>
            </div>

            {/* Additional Details (collapsible) */}
            <div>
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                {showDetails ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                Additional Details
              </button>

              {showDetails && (
                <div className="mt-3 space-y-4 pl-1 border-l-2 border-border ml-1.5">
                  <div className="pl-4">
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Owner</label>
                    <SearchableSelect
                      value={ownerId}
                      onChange={setOwnerId}
                      options={profileOptions}
                      placeholder="Assign owner..."
                    />
                  </div>
                  <div className="pl-4">
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Probability (%)</label>
                    <input
                      value={probability}
                      onChange={e => setProbability(e.target.value)}
                      type="number"
                      min="0"
                      max="100"
                      className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-sm focus:border-primary/40 outline-none"
                    />
                  </div>
                  <div className="pl-4">
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notes</label>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      rows={3}
                      placeholder="Quick notes about this opportunity..."
                      className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-sm focus:border-primary/40 outline-none resize-none"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <kbd className="px-1.5 py-0.5 bg-muted rounded border border-border font-mono">⌘</kbd>
            <kbd className="px-1.5 py-0.5 bg-muted rounded border border-border font-mono">↵</kbd>
            <span>to create</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={close} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={createOpp.isPending || !name.trim() || !clientId}
              className="px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-all"
            >
              {createOpp.isPending ? 'Creating...' : 'Create Opportunity'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
