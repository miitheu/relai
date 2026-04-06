import AppLayout from '@/components/AppLayout';
import { useClients, useDatasets, useDeliveries, useRenewals } from '@/hooks/useCrmData';
import { useOpportunities } from '@/hooks/useOpportunities';
import { useContracts } from '@/hooks/useContracts';
import { useQuickCreate } from '@/contexts/QuickCreateContext';
import LoadingState from '@/components/LoadingState';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Grid3X3, Filter, PlusCircle } from 'lucide-react';

type AccountFilter = 'all' | 'active' | 'prospect';
type InteractionFilter = 'all' | 'true_whitespace' | 'previously_attempted';

export default function WhitespaceAnalysis() {
  const { data: clients = [], isLoading: lc } = useClients();
  const { data: datasets = [], isLoading: ld } = useDatasets();
  const { data: deliveries = [] } = useDeliveries({});
  const { data: renewals = [] } = useRenewals();
  const { data: opportunities = [] } = useOpportunities();
  const { data: contracts = [] } = useContracts();
  const navigate = useNavigate();
  const { open: openOpportunity } = useQuickCreate();
  const [filterType, setFilterType] = useState<AccountFilter>('active');
  const [interactionFilter, setInteractionFilter] = useState<InteractionFilter>('all');

  const filteredClients = useMemo(() => {
    if (filterType === 'all') return clients.filter((c: any) => !c.is_merged);
    if (filterType === 'prospect') return clients.filter((c: any) => !c.is_merged && c.relationship_status === 'Prospect');
    return clients.filter((c: any) => !c.is_merged && c.relationship_status === 'Active Client');
  }, [clients, filterType]);

  const activeDatasets = useMemo(() => datasets.filter((d: any) => d.is_active), [datasets]);

  // Helper: get all dataset IDs for an opportunity (legacy dataset_id + opportunity_products)
  const getOppDatasetIds = (o: any): string[] => {
    const ids: string[] = [];
    if (o.dataset_id) ids.push(o.dataset_id);
    if (o.opportunity_products) {
      for (const p of o.opportunity_products) {
        if (p.dataset_id && !ids.includes(p.dataset_id)) ids.push(p.dataset_id);
      }
    }
    return ids;
  };

  // Coverage map: client+dataset → active coverage (deliveries, contracts, closed-won)
  const coverageMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const d of deliveries as any[]) {
      if (d.dataset_id && d.client_id) {
        if (!map[d.client_id]) map[d.client_id] = new Set();
        map[d.client_id].add(d.dataset_id);
      }
    }
    for (const c of contracts as any[]) {
      if (c.dataset_id && c.client_id) {
        if (!map[c.client_id]) map[c.client_id] = new Set();
        map[c.client_id].add(c.dataset_id);
      }
    }
    for (const r of renewals as any[]) {
      if (r.dataset_id && r.client_id) {
        if (!map[r.client_id]) map[r.client_id] = new Set();
        map[r.client_id].add(r.dataset_id);
      }
    }
    for (const o of opportunities as any[]) {
      if (o.stage === 'Closed Won' && o.client_id) {
        if (!map[o.client_id]) map[o.client_id] = new Set();
        for (const dsId of getOppDatasetIds(o)) map[o.client_id].add(dsId);
      }
    }
    return map;
  }, [deliveries, contracts, renewals, opportunities]);

  // Pipeline map: client+dataset → active pipeline
  const pipelineMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const o of opportunities as any[]) {
      if (!['Closed Won', 'Closed Lost', 'Inactive'].includes(o.stage) && o.client_id) {
        if (!map[o.client_id]) map[o.client_id] = new Set();
        for (const dsId of getOppDatasetIds(o)) map[o.client_id].add(dsId);
      }
    }
    return map;
  }, [opportunities]);

  // Closed Lost map: client+dataset → had a closed lost opp
  const closedLostMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const o of opportunities as any[]) {
      if (o.stage === 'Closed Lost' && o.client_id) {
        if (!map[o.client_id]) map[o.client_id] = new Set();
        for (const dsId of getOppDatasetIds(o)) map[o.client_id].add(dsId);
      }
    }
    return map;
  }, [opportunities]);

  // Inactive map: client+dataset → had an inactive/iced opp
  const inactiveMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const o of opportunities as any[]) {
      if (o.stage === 'Inactive' && o.client_id) {
        if (!map[o.client_id]) map[o.client_id] = new Set();
        for (const dsId of getOppDatasetIds(o)) map[o.client_id].add(dsId);
      }
    }
    return map;
  }, [opportunities]);

  // Clients with ANY opportunity (for "previously attempted" filter)
  const clientsWithEngagement = useMemo(() => {
    const set = new Set<string>();
    for (const o of opportunities as any[]) {
      if (o.client_id) set.add(o.client_id);
    }
    for (const d of deliveries as any[]) {
      if (d.client_id) set.add(d.client_id);
    }
    for (const r of renewals as any[]) {
      if (r.client_id) set.add(r.client_id);
    }
    return set;
  }, [opportunities, deliveries, renewals]);

  // Determine cell status (priority order: active > pipeline > closed_lost > inactive > whitespace)
  const getCellStatus = (clientId: string, datasetId: string) => {
    if (coverageMap[clientId]?.has(datasetId)) return 'active';
    if (pipelineMap[clientId]?.has(datasetId)) return 'pipeline';
    if (closedLostMap[clientId]?.has(datasetId)) return 'closed_lost';
    if (inactiveMap[clientId]?.has(datasetId)) return 'inactive';
    return 'whitespace';
  };

  // Has any uncovered cells (whitespace)?
  const hasWhitespace = (clientId: string) => {
    return activeDatasets.some((d: any) => getCellStatus(clientId, d.id) === 'whitespace');
  };

  // Apply interaction filter
  const visibleClients = useMemo(() => {
    if (interactionFilter === 'all') return filteredClients;
    if (interactionFilter === 'true_whitespace') {
      return filteredClients.filter((c: any) => !clientsWithEngagement.has(c.id));
    }
    return filteredClients.filter((c: any) => clientsWithEngagement.has(c.id));
  }, [filteredClients, clientsWithEngagement, interactionFilter]);

  // Stats
  const totalCells = filteredClients.length * activeDatasets.length;
  const activeCells = filteredClients.reduce((sum, c: any) => sum + (coverageMap[c.id]?.size || 0), 0);
  const pipelineCells = filteredClients.reduce((sum, c: any) => sum + (pipelineMap[c.id]?.size || 0), 0);
  const attemptedCount = filteredClients.filter((c: any) => clientsWithEngagement.has(c.id)).length;
  const trueWhitespaceAccounts = filteredClients.filter((c: any) => !clientsWithEngagement.has(c.id)).length;

  if (lc || ld) return <AppLayout><LoadingState /></AppLayout>;

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2"><Grid3X3 size={20} /> Whitespace Analysis</h1>
          <p className="text-sm text-muted-foreground">Accounts × Products matrix — identify untapped opportunities</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        <div className="data-card">
          <p className="metric-label">Accounts</p>
          <p className="metric-value">{filteredClients.length}</p>
        </div>
        <div className="data-card">
          <p className="metric-label">Active Coverage</p>
          <p className="metric-value text-success">{activeCells}</p>
          <p className="text-[10px] text-muted-foreground">{totalCells > 0 ? Math.round(activeCells / totalCells * 100) : 0}% penetration</p>
        </div>
        <div className="data-card">
          <p className="metric-label">In Pipeline</p>
          <p className="metric-value text-info">{pipelineCells}</p>
        </div>
        <div className="data-card">
          <p className="metric-label">Previously Attempted</p>
          <p className="metric-value text-destructive">{attemptedCount}</p>
          <p className="text-[10px] text-muted-foreground">accounts w/ lost/iced opps</p>
        </div>
        <div className="data-card">
          <p className="metric-label">True Whitespace</p>
          <p className="metric-value text-warning">{trueWhitespaceAccounts}</p>
          <p className="text-[10px] text-muted-foreground">accounts, zero prior attempts</p>
        </div>
      </div>

      {/* Filters — single bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Filter size={12} className="text-muted-foreground" />
        {(['active', 'prospect', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilterType(f)} className={`px-2 py-0.5 rounded text-xs ${filterType === f ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            {f === 'active' ? 'Active Clients' : f === 'prospect' ? 'Prospects' : 'All Accounts'}
          </button>
        ))}
        <span className="w-px h-4 bg-border mx-1" />
        {([
          { key: 'all' as InteractionFilter, label: 'All' },
          { key: 'true_whitespace' as InteractionFilter, label: 'True Whitespace' },
          { key: 'previously_attempted' as InteractionFilter, label: 'Previously Attempted' },
        ]).map(f => (
          <button key={f.key} onClick={() => setInteractionFilter(f.key)} className={`px-2 py-0.5 rounded text-xs ${interactionFilter === f.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Matrix */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground sticky left-0 bg-background z-10 min-w-[160px]">Account</th>
              {activeDatasets.map((d: any) => (
                <th key={d.id} className="py-2 px-1 font-medium text-muted-foreground text-center min-w-[60px]">
                  <span className="writing-mode-vertical" title={d.name}>{d.name.length > 12 ? d.name.slice(0, 12) + '…' : d.name}</span>
                </th>
              ))}
              <th className="py-2 px-2 font-medium text-muted-foreground text-center">Coverage</th>
              <th className="py-2 px-2 font-medium text-muted-foreground text-center min-w-[50px]">History</th>
            </tr>
          </thead>
          <tbody>
            {visibleClients.slice(0, 50).map((c: any) => {
              const activeDsCount = activeDatasets.filter((d: any) => getCellStatus(c.id, d.id) === 'active').length;
              const coverageRate = activeDatasets.length > 0 ? Math.round(activeDsCount / activeDatasets.length * 100) : 0;
              const hasOpps = clientsWithEngagement.has(c.id);
              return (
                <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                  <td className="py-1.5 px-2 sticky left-0 bg-background z-10">
                    <button onClick={() => navigate(`/clients/${c.id}`)} className="text-foreground hover:text-primary truncate max-w-[150px] block text-left">
                      {c.name}
                    </button>
                    <span className="text-[9px] text-muted-foreground">{c.relationship_status}</span>
                  </td>
                  {activeDatasets.map((d: any) => {
                    const status = getCellStatus(c.id, d.id);
                    return (
                      <td key={d.id} className="py-1.5 px-1 text-center">
                        {status === 'active' ? (
                          <span className="inline-block w-5 h-5 rounded bg-success/20 text-success text-[9px] leading-5" title="Active coverage">✓</span>
                        ) : status === 'pipeline' ? (
                          <span className="inline-block w-5 h-5 rounded bg-info/20 text-info text-[9px] leading-5" title="In pipeline">●</span>
                        ) : status === 'closed_lost' ? (
                          <button
                            onClick={() => openOpportunity({ client_id: c.id, dataset_id: d.id })}
                            className="inline-block w-5 h-5 rounded bg-destructive/20 text-destructive text-[9px] leading-5 hover:bg-destructive/40 transition-colors cursor-pointer"
                            title={`Closed Lost — click to re-attempt ${d.name} for ${c.name}`}
                          >✗</button>
                        ) : status === 'inactive' ? (
                          <button
                            onClick={() => openOpportunity({ client_id: c.id, dataset_id: d.id })}
                            className="inline-block w-5 h-5 rounded bg-warning/20 text-warning text-[9px] leading-5 hover:bg-warning/40 transition-colors cursor-pointer"
                            title={`Inactive / Iced — click to re-attempt ${d.name} for ${c.name}`}
                          >◦</button>
                        ) : (
                          <button
                            onClick={() => openOpportunity({ client_id: c.id, dataset_id: d.id })}
                            className="inline-block w-5 h-5 rounded bg-muted text-muted-foreground text-[9px] leading-5 cursor-pointer hover:bg-primary/20 hover:text-primary transition-colors"
                            title={`Create opportunity: ${d.name} for ${c.name}`}
                          >
                            <PlusCircle size={10} className="inline" />
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-1.5 px-2 text-center">
                    <span className={`text-xs font-mono ${coverageRate > 50 ? 'text-success' : coverageRate > 0 ? 'text-warning' : 'text-muted-foreground'}`}>
                      {coverageRate}%
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    {hasOpps ? (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[9px] bg-primary/10 text-primary" title="Has opportunities">engaged</span>
                    ) : (
                      <span className="text-[9px] text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visibleClients.length > 50 && (
          <p className="text-xs text-muted-foreground text-center py-2">Showing first 50 of {visibleClients.length} accounts</p>
        )}
        {visibleClients.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No accounts match the current filters</p>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-[10px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-success/20 inline-block" /> Active coverage</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-info/20 inline-block" /> In pipeline</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-destructive/20 inline-block" /> Closed Lost</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-warning/20 inline-block" /> Inactive / Iced</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-muted inline-block" /> Whitespace</span>
      </div>
    </AppLayout>
  );
}
