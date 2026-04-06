import AppLayout from '@/components/AppLayout';
import { useClients, useCreateClient, useUpdateClient } from '@/hooks/useCrmData';
import { useNavigate } from 'react-router-dom';
import { Building2, Search, Plus, Fingerprint, Zap, Loader2, CheckCircle2, XCircle, BrainCircuit, RefreshCw, BarChart3, UserCheck, Tag, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/data/mockData';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import { useToast } from '@/hooks/use-toast';
import { useAllEntityResolutions } from '@/hooks/useEntityResolution';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuth } from '@/contexts/AuthContext';
import { Progress } from '@/components/ui/progress';
import BulkActionsBar from '@/components/BulkActionsBar';
import FilterBuilder, { type FilterCondition } from '@/components/filters/FilterBuilder';

export default function ClientList() {
  const supabase = useSupabase();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: clients = [], isLoading } = useClients();
  const { data: resolutions = [] } = useAllEntityResolutions();
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();

  // Row selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([]);

  // Bulk intelligence state
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, succeeded: 0, failed: 0, current: '' });
  const cancelRef = useRef(false);

  // Fetch intelligence run status + product coverage per client
  const [intelMap, setIntelMap] = useState<Record<string, { status: string }>>({});
  const [coverageMap, setCoverageMap] = useState<Record<string, { topScore: number; productCount: number; topProduct: string | null }>>({});
  const [lastActivityMap, setLastActivityMap] = useState<Record<string, string>>({});
  const [pipelineMap, setPipelineMap] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      const [runsRes, fitsRes, activitiesRes, oppsRes, emailsRes, meetingsRes] = await Promise.all([
        supabase
          .from('fund_intelligence_runs')
          .select('client_id, run_status')
          .order('created_at', { ascending: false }),
        supabase
          .from('product_fit_analyses' as any)
          .select('client_id, fit_score, coverage_overlap_score, product_id, datasets(name)')
          .eq('is_latest', true)
          .order('fit_score', { ascending: false }),
        supabase
          .from('activities')
          .select('client_id, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('opportunities')
          .select('client_id, value')
          .not('stage', 'in', '("Closed Won","Closed Lost")'),
        supabase
          .from('emails')
          .select('client_id, email_date')
          .order('email_date', { ascending: false }),
        supabase
          .from('meetings')
          .select('client_id, meeting_date')
          .order('meeting_date', { ascending: false }),
      ]);

      const map: Record<string, { status: string }> = {};
      (runsRes.data || []).forEach((r: any) => {
        if (!map[r.client_id]) map[r.client_id] = { status: r.run_status };
      });
      setIntelMap(map);

      const cMap: Record<string, { topScore: number; productCount: number; topProduct: string | null }> = {};
      (fitsRes.data || []).forEach((f: any) => {
        if (!cMap[f.client_id]) {
          cMap[f.client_id] = { topScore: f.fit_score || 0, productCount: 1, topProduct: f.datasets?.name || null };
        } else {
          cMap[f.client_id].productCount++;
          if ((f.fit_score || 0) > cMap[f.client_id].topScore) {
            cMap[f.client_id].topScore = f.fit_score;
            cMap[f.client_id].topProduct = f.datasets?.name || null;
          }
        }
      });
      setCoverageMap(cMap);

      // Last activity per client (merge activities, emails, meetings)
      const aMap: Record<string, string> = {};
      const updateIfNewer = (clientId: string, dateStr: string) => {
        if (!clientId || !dateStr) return;
        if (!aMap[clientId] || dateStr > aMap[clientId]) aMap[clientId] = dateStr;
      };
      (activitiesRes.data || []).forEach((a: any) => updateIfNewer(a.client_id, a.created_at));
      (emailsRes.data || []).forEach((e: any) => updateIfNewer(e.client_id, e.email_date));
      (meetingsRes.data || []).forEach((m: any) => updateIfNewer(m.client_id, m.meeting_date));
      setLastActivityMap(aMap);

      // Pipeline value per client
      const pMap: Record<string, number> = {};
      (oppsRes.data || []).forEach((o: any) => {
        if (o.client_id) pMap[o.client_id] = (pMap[o.client_id] || 0) + (Number(o.value) || 0);
      });
      setPipelineMap(pMap);
    })();
  }, [bulkRunning]);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [resolutionFilter, setResolutionFilter] = useState<string>('all');
  const [needsAttention, setNeedsAttention] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('Hedge Fund');

  const runBulkIntelligence = useCallback(async (forceRerun = false) => {
    cancelRef.current = false;
    setBulkRunning(true);
    setBulkProgress({ done: 0, total: 0, succeeded: 0, failed: 0, current: 'Finding eligible accounts...' });

    try {
      // 1. Get accounts with external source mappings (have SEC data)
      const { data: mappings } = await supabase
        .from('external_source_mappings')
        .select('client_id, external_entity_name')
        .in('external_source_type', ['sec_filer', 'sec_issuer', 'sec_adviser']);

      if (!mappings?.length) {
        toast({ title: 'No eligible accounts', description: 'No accounts have SEC source mappings yet.' });
        setBulkRunning(false);
        return;
      }

      const clientMap = new Map(clients.map((c: any) => [c.id, c.name]));
      let eligible: { clientId: string; clientName: string }[];

      if (forceRerun) {
        // Include all accounts with SEC mappings
        eligible = mappings
          .filter((m: any) => clientMap.has(m.client_id))
          .reduce((acc: any[], m: any) => {
            if (!acc.find((a: any) => a.clientId === m.client_id)) {
              acc.push({ clientId: m.client_id, clientName: clientMap.get(m.client_id) || m.external_entity_name });
            }
            return acc;
          }, []);
      } else {
        // 2. Get accounts that already have intelligence runs
        const { data: existingRuns } = await supabase
          .from('fund_intelligence_runs')
          .select('client_id');
        const hasRun = new Set((existingRuns || []).map((r: any) => r.client_id));

        // 3. Filter to eligible: has mapping, no existing run
        eligible = mappings
          .filter((m: any) => !hasRun.has(m.client_id) && clientMap.has(m.client_id))
          .reduce((acc: any[], m: any) => {
            if (!acc.find((a: any) => a.clientId === m.client_id)) {
              acc.push({ clientId: m.client_id, clientName: clientMap.get(m.client_id) || m.external_entity_name });
            }
            return acc;
          }, []);
      }

      if (!eligible.length) {
        toast({ title: 'All caught up', description: forceRerun ? 'No accounts with SEC data found.' : 'All accounts with SEC data already have intelligence runs.' });
        setBulkRunning(false);
        return;
      }

      setBulkProgress({ done: 0, total: eligible.length, succeeded: 0, failed: 0, current: `Starting ${eligible.length} accounts...` });

      let succeeded = 0, failed = 0;
      for (let i = 0; i < eligible.length; i++) {
        if (cancelRef.current) break;
        const { clientId, clientName } = eligible[i];
        setBulkProgress(prev => ({ ...prev, done: i, current: clientName }));

        try {
          const { data, error } = await supabase.functions.invoke('fund-intelligence', {
            body: { client_id: clientId, client_name: clientName, user_id: user?.id, run_reason: 'bulk' },
          });
          if (error || data?.error) { failed++; } else { succeeded++; }
        } catch { failed++; }

        setBulkProgress(prev => ({ ...prev, done: i + 1, succeeded, failed }));
      }

      toast({ title: 'Bulk intelligence complete', description: `${succeeded} succeeded, ${failed} failed out of ${eligible.length}.` });
    } catch (err: any) {
      toast({ title: 'Bulk run failed', description: err.message, variant: 'destructive' });
    } finally {
      setBulkRunning(false);
    }
  }, [clients, user, toast]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    clients.forEach((c: any) => { counts[c.client_type] = (counts[c.client_type] || 0) + 1; });
    return counts;
  }, [clients]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    clients.forEach((c: any) => { counts[c.relationship_status] = (counts[c.relationship_status] || 0) + 1; });
    return counts;
  }, [clients]);

  const resolutionMap = useMemo(() => {
    const map: Record<string, { status: string; name: string | null }> = {};
    resolutions.forEach((r: any) => {
      map[r.client_id] = { status: r.resolution_status, name: r.canonical_name || r.sec_filer_name };
    });
    return map;
  }, [resolutions]);

  const resolutionCounts = useMemo(() => {
    let resolved = 0, needsReview = 0, unresolved = 0;
    clients.forEach((c: any) => {
      const r = resolutionMap[c.id];
      if (!r) { unresolved++; }
      else if (r.status === 'auto_matched' || r.status === 'manually_confirmed') { resolved++; }
      else if (r.status === 'needs_review') { needsReview++; }
      else { unresolved++; }
    });
    return { resolved, needsReview, unresolved };
  }, [clients, resolutionMap]);

  const filtered = clients.filter((c: any) => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter !== 'all' && c.client_type !== typeFilter) return false;
    if (statusFilter !== 'all' && c.relationship_status !== statusFilter) return false;
    if (resolutionFilter !== 'all') {
      const r = resolutionMap[c.id];
      if (resolutionFilter === 'resolved' && (!r || (r.status !== 'auto_matched' && r.status !== 'manually_confirmed'))) return false;
      if (resolutionFilter === 'needs_review' && (!r || r.status !== 'needs_review')) return false;
      if (resolutionFilter === 'unresolved' && r && (r.status === 'auto_matched' || r.status === 'manually_confirmed' || r.status === 'needs_review')) return false;
    }
    if (needsAttention) {
      const hasFit = coverageMap[c.id] && coverageMap[c.id].topScore >= 50;
      const lastAct = lastActivityMap[c.id];
      const stale = !lastAct || (Date.now() - new Date(lastAct).getTime()) > 30 * 24 * 60 * 60 * 1000;
      if (!(hasFit && stale)) return false;
    }
    return true;
  });

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      'Active Client': 'bg-success/10 text-success',
      'Prospect': 'bg-info/10 text-info',
      'Strategic': 'bg-primary/10 text-primary',
      'Dormant': 'bg-muted text-muted-foreground',
    };
    return map[status] || 'bg-muted text-muted-foreground';
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await createClient.mutateAsync({ name: newName.trim(), client_type: newType });
      toast({ title: 'Account created' });
      setShowCreate(false);
      setNewName('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  // Filter fields for FilterBuilder
  const filterFields = useMemo(() => [
    { name: 'name', label: 'Name', type: 'text' as const },
    {
      name: 'client_type', label: 'Type', type: 'select' as const,
      options: ['Hedge Fund', 'Bank', 'Asset Manager', 'Corporate', 'Vendor', 'Other'].map(v => ({ value: v, label: v })),
    },
    {
      name: 'relationship_status', label: 'Status', type: 'select' as const,
      options: ['Active Client', 'Prospect', 'Strategic', 'Dormant'].map(v => ({ value: v, label: v })),
    },
    { name: 'headquarters_country', label: 'Country', type: 'text' as const },
  ], []);

  // Apply FilterBuilder conditions on top of existing filtering
  const filteredClients = useMemo(() => {
    let result = filtered;
    for (const cond of filterConditions) {
      if (!cond.value) continue;
      result = result.filter((c: any) => {
        const val = String(c[cond.field] || '').toLowerCase();
        const target = cond.value.toLowerCase();
        switch (cond.operator) {
          case 'eq': return val === target;
          case 'neq': return val !== target;
          case 'contains': return val.includes(target);
          case 'gt': return Number(val) > Number(target);
          case 'lt': return Number(val) < Number(target);
          case 'gte': return Number(val) >= Number(target);
          case 'lte': return Number(val) <= Number(target);
          default: return true;
        }
      });
    }
    return result;
  }, [filtered, filterConditions]);

  // Selection helpers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds(prev => {
      if (prev.size === filteredClients.length && filteredClients.length > 0) return new Set();
      return new Set(filteredClients.map((c: any) => c.id));
    });
  }, [filteredClients]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // Bulk action handlers
  const handleBulkUpdateStatus = useCallback(async () => {
    const status = window.prompt('Enter new status (Active Client, Prospect, Strategic, Dormant):');
    if (!status || !['Active Client', 'Prospect', 'Strategic', 'Dormant'].includes(status)) {
      if (status !== null) toast({ title: 'Invalid status', description: 'Please enter a valid status.', variant: 'destructive' });
      return;
    }
    try {
      await Promise.all(
        Array.from(selectedIds).map(id => updateClient.mutateAsync({ id, relationship_status: status }))
      );
      toast({ title: 'Status updated', description: `${selectedIds.size} account(s) updated to ${status}.` });
      clearSelection();
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    }
  }, [selectedIds, updateClient, toast, clearSelection]);

  const handleBulkAssignOwner = useCallback(async () => {
    const ownerId = window.prompt('Enter the owner user ID to assign:');
    if (!ownerId) return;
    try {
      await Promise.all(
        Array.from(selectedIds).map(id => updateClient.mutateAsync({ id, owner_id: ownerId.trim() }))
      );
      toast({ title: 'Owner assigned', description: `${selectedIds.size} account(s) assigned.` });
      clearSelection();
    } catch (err: any) {
      toast({ title: 'Assign failed', description: err.message, variant: 'destructive' });
    }
  }, [selectedIds, updateClient, toast, clearSelection]);

  const bulkActions = useMemo(() => [
    { label: 'Update Status', icon: Tag, onClick: handleBulkUpdateStatus },
    { label: 'Assign Owner', icon: UserCheck, onClick: handleBulkAssignOwner },
  ], [handleBulkUpdateStatus, handleBulkAssignOwner]);

  if (isLoading) return <AppLayout><LoadingState /></AppLayout>;

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Accounts</h1>
          <p className="text-sm text-muted-foreground">{clients.length} firms in database</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => runBulkIntelligence(false)}
            disabled={bulkRunning}
            className="flex items-center gap-1.5 px-3 py-2 bg-accent text-accent-foreground rounded-md text-sm font-medium hover:bg-accent/80 transition-colors disabled:opacity-50"
          >
            {bulkRunning ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            {bulkRunning ? 'Running...' : 'Run Intelligence (New)'}
          </button>
          <button
            onClick={() => runBulkIntelligence(true)}
            disabled={bulkRunning}
            className="flex items-center gap-1.5 px-3 py-2 bg-warning/10 text-warning rounded-md text-sm font-medium hover:bg-warning/20 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} />
            Re-run All
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus size={14} /> New Account
          </button>
        </div>
      </div>

      {/* Bulk intelligence progress */}
      {bulkRunning && (
        <div className="data-card space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Processing: <span className="text-foreground font-medium">{bulkProgress.current}</span>
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-success"><CheckCircle2 size={12} /> {bulkProgress.succeeded}</span>
              {bulkProgress.failed > 0 && <span className="flex items-center gap-1 text-destructive"><XCircle size={12} /> {bulkProgress.failed}</span>}
              <span>{bulkProgress.done} / {bulkProgress.total}</span>
            </div>
          </div>
          <Progress value={bulkProgress.total > 0 ? (bulkProgress.done / bulkProgress.total) * 100 : 0} className="h-1.5" />
          <button onClick={() => { cancelRef.current = true; }} className="text-xs text-muted-foreground hover:text-destructive">
            Cancel
          </button>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <form onSubmit={handleCreate} className="data-card w-full max-w-md space-y-4">
            <h2 className="text-sm font-semibold">New Account</h2>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Name *</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} required className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Client name" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Type</label>
              <select value={newType} onChange={e => setNewType(e.target.value)} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm">
                {['Hedge Fund', 'Bank', 'Asset Manager', 'Corporate', 'Vendor', 'Other'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button type="submit" disabled={createClient.isPending} className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                {createClient.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {clients.length === 0 ? (
        <EmptyState icon={Building2} title="No accounts yet" description="Create your first account to start building your CRM." actionLabel="New Account" onAction={() => setShowCreate(true)} />
      ) : (
        <>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" placeholder="Search accounts..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="bg-card border border-border rounded-md text-sm px-3 py-2">
              <option value="all">All Types ({clients.length})</option>
              {Object.entries(typeCounts).sort(([a], [b]) => a.localeCompare(b)).map(([t, count]) => (
                <option key={t} value={t}>{t} ({count})</option>
              ))}
            </select>
             <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-card border border-border rounded-md text-sm px-3 py-2">
              <option value="all">All Statuses ({clients.length})</option>
              {['Active Client', 'Prospect', 'Strategic', 'Dormant'].map(s => (
                <option key={s} value={s}>{s === 'Active Client' ? 'Active' : s} ({statusCounts[s] || 0})</option>
              ))}
            </select>
            <select value={resolutionFilter} onChange={e => setResolutionFilter(e.target.value)} className="bg-card border border-border rounded-md text-sm px-3 py-2">
              <option value="all">All Resolution ({clients.length})</option>
              <option value="resolved">Resolved ({resolutionCounts.resolved})</option>
              <option value="needs_review">Needs Review ({resolutionCounts.needsReview})</option>
              <option value="unresolved">Unresolved ({resolutionCounts.unresolved})</option>
            </select>
            <button
              onClick={() => setNeedsAttention(a => !a)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                needsAttention ? 'bg-warning/20 text-warning border border-warning/30' : 'bg-card border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <AlertCircle size={14} />
              Needs Attention
            </button>
          </div>

          <FilterBuilder fields={filterFields} conditions={filterConditions} onChange={setFilterConditions} />

          <BulkActionsBar selectedCount={selectedIds.size} actions={bulkActions} onClear={clearSelection} />

          <div className="data-card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="w-10 px-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredClients.length && filteredClients.length > 0}
                      onChange={toggleAll}
                      className="rounded border-border"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Account</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Type</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Country</th>
                   <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">AUM</th>
                   <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Last Activity</th>
                   <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Pipeline</th>
                   <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Coverage</th>
                   <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Intel</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((c: any) => (
                  <tr key={c.id} onClick={() => navigate(`/clients/${c.id}`)} className={`border-b border-border hover:bg-muted/30 cursor-pointer transition-colors ${selectedIds.has(c.id) ? 'bg-primary/5' : ''}`}>
                    <td className="px-2" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        className="rounded border-border"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded bg-secondary flex items-center justify-center">
                          <Building2 size={13} className="text-muted-foreground" />
                        </div>
                        <span className="font-medium">{c.name}</span>
                        {resolutionMap[c.id] && (resolutionMap[c.id].status === 'auto_matched' || resolutionMap[c.id].status === 'manually_confirmed') && (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Fingerprint size={12} className="text-success shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                Resolved: {resolutionMap[c.id].name || 'Confirmed'}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {resolutionMap[c.id] && resolutionMap[c.id].status === 'needs_review' && (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Fingerprint size={12} className="text-warning shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                Needs review
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.client_type}</td>
                    <td className="px-4 py-3"><span className={`status-badge ${statusColor(c.relationship_status)}`}>{c.relationship_status}</span></td>
                    <td className="px-4 py-3 text-muted-foreground">{c.headquarters_country || '—'}</td>
                     <td className="px-4 py-3 text-right font-mono text-muted-foreground">{c.aum || '—'}</td>
                     <td className="px-4 py-3">
                       {lastActivityMap[c.id] ? (() => {
                         const daysAgo = Math.floor((Date.now() - new Date(lastActivityMap[c.id]).getTime()) / (1000 * 60 * 60 * 24));
                         return (
                           <span className={`text-xs font-mono ${daysAgo > 30 ? 'text-destructive font-medium' : daysAgo > 14 ? 'text-warning' : 'text-muted-foreground'}`}>
                             {daysAgo === 0 ? 'Today' : daysAgo === 1 ? '1d ago' : `${daysAgo}d ago`}
                           </span>
                         );
                       })() : (
                         <span className="text-xs text-muted-foreground/40">—</span>
                       )}
                     </td>
                     <td className="px-4 py-3 text-right">
                       {pipelineMap[c.id] ? (
                         <span className="text-xs font-mono font-medium">{formatCurrency(pipelineMap[c.id])}</span>
                       ) : (
                         <span className="text-xs text-muted-foreground/40">—</span>
                       )}
                     </td>
                     <td className="px-4 py-3 text-center">
                       {coverageMap[c.id] ? (
                         <TooltipProvider delayDuration={200}>
                           <Tooltip>
                             <TooltipTrigger asChild>
                               <div className="inline-flex items-center gap-1.5">
                                 <div className="w-10 h-1.5 bg-muted rounded-full overflow-hidden">
                                   <div
                                     className={`h-full rounded-full ${
                                       coverageMap[c.id].topScore >= 60 ? 'bg-success' :
                                       coverageMap[c.id].topScore >= 30 ? 'bg-warning' :
                                       'bg-muted-foreground/40'
                                     }`}
                                     style={{ width: `${Math.min(100, coverageMap[c.id].topScore)}%` }}
                                   />
                                 </div>
                                 <span className={`text-xs font-mono ${
                                   coverageMap[c.id].topScore >= 60 ? 'text-success' :
                                   coverageMap[c.id].topScore >= 30 ? 'text-warning' :
                                   'text-muted-foreground'
                                 }`}>{coverageMap[c.id].topScore}</span>
                               </div>
                             </TooltipTrigger>
                             <TooltipContent side="top" className="text-xs">
                               <div>Top fit: {coverageMap[c.id].topScore}/100</div>
                               {coverageMap[c.id].topProduct && <div className="text-muted-foreground">Best: {coverageMap[c.id].topProduct}</div>}
                               <div className="text-muted-foreground">{coverageMap[c.id].productCount} product{coverageMap[c.id].productCount !== 1 ? 's' : ''} analyzed</div>
                             </TooltipContent>
                           </Tooltip>
                         </TooltipProvider>
                       ) : (
                         <span className="text-muted-foreground/40">—</span>
                       )}
                     </td>
                     <td className="px-4 py-3 text-center">
                      {intelMap[c.id] ? (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <BrainCircuit size={14} className={
                                intelMap[c.id].status === 'completed' ? 'text-success inline-block' :
                                intelMap[c.id].status === 'failed' ? 'text-destructive inline-block' :
                                'text-warning inline-block'
                              } />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              Intelligence: {intelMap[c.id].status === 'completed' ? 'Available' : intelMap[c.id].status === 'failed' ? 'Failed' : 'Running'}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AppLayout>
  );
}
