import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useClients } from '@/hooks/useCrmData';
import { useCreateClient } from '@/hooks/useClients';
import { useCreateCampaignTarget, useCampaignOverlaps, type CampaignOverlap } from '@/hooks/useCampaigns';
import { useSavedDiscoveries, useDiscoveryByName, useImportSuggestion } from '@/hooks/useAccountDiscovery';
import { Search, AlertTriangle, UserPlus, Sparkles, Building2, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export default function AddTargetDialog({
  open, onOpenChange, campaignId, productIds,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  campaignId: string;
  productIds?: string[];
}) {
  const { user } = useAuth();
  const { data: clients = [] } = useClients();
  const createTarget = useCreateCampaignTarget();
  const createClient = useCreateClient();
  const importSuggestion = useImportSuggestion();
  const { data: overlaps = [] } = useCampaignOverlaps(campaignId, productIds);
  const { data: savedDiscoveries = [] } = useSavedDiscoveries();
  const [tab, setTab] = useState<'existing' | 'discovery' | 'new'>('existing');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [excludedOverlaps, setExcludedOverlaps] = useState<Set<string>>(new Set());

  // Discovery tab state
  const [selectedDiscovery, setSelectedDiscovery] = useState<string>('');
  const { data: discoveryResults = [] } = useDiscoveryByName(selectedDiscovery || undefined);
  const [selectedDiscoveryIds, setSelectedDiscoveryIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  // New account tab state
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('Other');
  const [newCountry, setNewCountry] = useState('');

  // Overlap lookup
  const overlapByClient = new Map<string, CampaignOverlap[]>();
  for (const o of overlaps) {
    const existing = overlapByClient.get(o.client_id) || [];
    existing.push(o);
    overlapByClient.set(o.client_id, existing);
  }

  const filtered = clients.filter((c: any) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 20);

  const handleAddExisting = async () => {
    try {
      const toAdd = selected.filter(id => !excludedOverlaps.has(id));
      for (const clientId of toAdd) {
        await createTarget.mutateAsync({ campaign_id: campaignId, client_id: clientId, is_existing_client: true });
      }
      toast.success(`Added ${toAdd.length} targets`);
      resetAndClose();
    } catch { toast.error('Failed to add targets'); }
  };

  const handleAddFromDiscovery = async () => {
    setImporting(true);
    try {
      let added = 0;
      for (const id of selectedDiscoveryIds) {
        const suggestion = discoveryResults.find(s => s.id === id);
        if (!suggestion) continue;

        let clientId = suggestion.imported_client_id;
        // Import as new client if not already imported
        if (!clientId) {
          const result = await importSuggestion.mutateAsync(suggestion);
          clientId = result?.clientId || null;
        }
        if (clientId) {
          await createTarget.mutateAsync({ campaign_id: campaignId, client_id: clientId, is_existing_client: !!suggestion.imported_client_id });
          added++;
        }
      }
      toast.success(`Added ${added} targets from discovery`);
      resetAndClose();
    } catch { toast.error('Failed to import targets'); }
    finally { setImporting(false); }
  };

  const handleCreateAndAdd = async () => {
    if (!newName.trim()) return;
    try {
      const client = await createClient.mutateAsync({
        name: newName.trim(),
        client_type: newType,
        headquarters_country: newCountry || undefined,
        relationship_status: 'Prospect',
      });
      await createTarget.mutateAsync({ campaign_id: campaignId, client_id: client.id, is_existing_client: false });
      toast.success(`Created "${newName}" and added to campaign`);
      resetAndClose();
    } catch { toast.error('Failed to create account'); }
  };

  const resetAndClose = () => {
    setSelected([]); setSearch(''); setExcludedOverlaps(new Set());
    setSelectedDiscovery(''); setSelectedDiscoveryIds(new Set());
    setNewName(''); setNewType('Other'); setNewCountry('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Campaign Targets</DialogTitle>
        </DialogHeader>

        {/* Tab switcher */}
        <div className="flex gap-1 p-0.5 bg-muted/50 rounded-lg mb-3">
          {[
            { id: 'existing' as const, label: 'Existing Accounts', icon: Building2 },
            { id: 'discovery' as const, label: 'From Discovery', icon: Sparkles },
            { id: 'new' as const, label: 'Create New', icon: UserPlus },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === t.id ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <t.icon size={12} /> {t.label}
            </button>
          ))}
        </div>

        {/* Existing accounts tab */}
        {tab === 'existing' && (
          <>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search accounts..."
                className="w-full pl-9 pr-3 py-2 rounded-md bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="max-h-52 overflow-y-auto space-y-1">
              {filtered.map((c: any) => {
                const clientOverlaps = overlapByClient.get(c.id);
                const isExcluded = excludedOverlaps.has(c.id);
                return (
                  <div key={c.id}>
                    <label className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer text-sm transition-colors ${
                      selected.includes(c.id) ? clientOverlaps ? 'bg-warning/10' : 'bg-primary/10' : 'hover:bg-muted'
                    } ${isExcluded ? 'opacity-50' : ''}`}>
                      <input type="checkbox" checked={selected.includes(c.id) && !isExcluded}
                        onChange={() => setSelected(s => s.includes(c.id) ? s.filter(x => x !== c.id) : [...s, c.id])} className="rounded" />
                      <span className="flex-1 truncate">{c.name}</span>
                      {clientOverlaps && <AlertTriangle size={12} className="text-warning shrink-0" />}
                      <span className="text-[11px] text-muted-foreground">{c.client_type}</span>
                    </label>
                    {selected.includes(c.id) && clientOverlaps && (
                      <div className="ml-8 mb-1 px-2 py-1.5 bg-warning/5 border border-warning/20 rounded text-[10px] text-warning">
                        <p className="font-medium mb-0.5">Already in: {clientOverlaps.map(o => o.campaign_name).join(', ')}</p>
                        <button onClick={(e) => { e.preventDefault(); setExcludedOverlaps(s => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; }); }}
                          className="text-[10px] text-warning hover:text-warning/80 underline">
                          {isExcluded ? 'Include anyway' : 'Exclude'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <DialogFooter>
              <button onClick={() => onOpenChange(false)} className="px-3 py-2 text-sm text-muted-foreground">Cancel</button>
              <button onClick={handleAddExisting} disabled={(selected.length - excludedOverlaps.size) === 0 || createTarget.isPending}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
                Add {selected.length - excludedOverlaps.size} Accounts
              </button>
            </DialogFooter>
          </>
        )}

        {/* Discovery tab */}
        {tab === 'discovery' && (
          <>
            {savedDiscoveries.length === 0 ? (
              <div className="py-8 text-center">
                <Sparkles size={24} className="mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No saved discoveries yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Name your discovery runs in Account Discovery to use them here.</p>
              </div>
            ) : (
              <>
                <select value={selectedDiscovery} onChange={e => { setSelectedDiscovery(e.target.value); setSelectedDiscoveryIds(new Set()); }}
                  className="w-full px-3 py-2 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary mb-2">
                  <option value="">Select a saved discovery...</option>
                  {savedDiscoveries.map(d => (
                    <option key={d.discovery_name} value={d.discovery_name}>
                      {d.discovery_name} ({d.run_type}{d.seed_client?.name ? ` — ${d.seed_client.name}` : ''})
                    </option>
                  ))}
                </select>
                {selectedDiscovery && (
                  <div className="max-h-52 overflow-y-auto space-y-1">
                    {discoveryResults.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">No new suggestions in this discovery</p>
                    ) : discoveryResults.map(s => (
                      <label key={s.id} className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer text-sm transition-colors ${
                        selectedDiscoveryIds.has(s.id) ? 'bg-primary/10' : 'hover:bg-muted'
                      }`}>
                        <input type="checkbox" checked={selectedDiscoveryIds.has(s.id)}
                          onChange={() => setSelectedDiscoveryIds(prev => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })} className="rounded" />
                        <span className="flex-1 truncate">{s.name}</span>
                        {s.imported_client_id && <Check size={12} className="text-success shrink-0" title="Already imported" />}
                        <span className="text-[10px] font-mono text-muted-foreground">{s.composite_score ?? '—'}</span>
                        <span className="text-[11px] text-muted-foreground">{s.suggested_type || '—'}</span>
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}
            <DialogFooter>
              <button onClick={() => onOpenChange(false)} className="px-3 py-2 text-sm text-muted-foreground">Cancel</button>
              <button onClick={handleAddFromDiscovery} disabled={selectedDiscoveryIds.size === 0 || importing}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
                {importing ? <><Loader2 size={13} className="animate-spin mr-1 inline" /> Importing...</> :
                  `Add ${selectedDiscoveryIds.size} from Discovery`}
              </button>
            </DialogFooter>
          </>
        )}

        {/* Create new account tab */}
        {tab === 'new' && (
          <>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Company Name *</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Citadel Securities"
                  className="w-full px-3 py-2 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Type</label>
                  <select value={newType} onChange={e => setNewType(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary">
                    {['Hedge Fund', 'Bank', 'Asset Manager', 'Corporate', 'Vendor', 'Other'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Country</label>
                  <input value={newCountry} onChange={e => setNewCountry(e.target.value)} placeholder="e.g. United States"
                    className="w-full px-3 py-2 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <button onClick={() => onOpenChange(false)} className="px-3 py-2 text-sm text-muted-foreground">Cancel</button>
              <button onClick={handleCreateAndAdd} disabled={!newName.trim() || createClient.isPending}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
                <UserPlus size={13} className="mr-1 inline" /> Create & Add
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
