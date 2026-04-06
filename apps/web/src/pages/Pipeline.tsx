import { Fragment, useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { useOpportunities, useUpdateOpportunity, useProfiles } from '@/hooks/useCrmData';
import { useClients, useDatasets } from '@/hooks/useCrmData';
import { formatCurrency, getStageColor, stageOrder, ICEBOX_STAGES } from '@/data/mockData';
import { useCurrencyRerender } from '@/hooks/useCurrencyRerender';
import { LayoutGrid, List, Plus, Clock, ChevronDown, ChevronRight, AlertTriangle, User, Table2, LineChart, Filter, X } from 'lucide-react';
import { differenceInDays } from 'date-fns';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useQuickCreate } from '@/contexts/QuickCreateContext';
import { useNavigate } from 'react-router-dom';
import BallStatusBadge from '@/components/BallStatusBadge';
import { BallStatus } from '@/hooks/useActionCenter';
import { useStageConfig } from '@/hooks/useCrmSettings';
import AllOpportunitiesTable from '@/components/pipeline/AllOpportunitiesTable';
import KanbanBoard from '@/components/pipeline/KanbanBoard';
import ForecastView from '@/components/pipeline/ForecastView';

type ViewMode = 'kanban' | 'table' | 'all' | 'forecast';
type PipelineScope = 'mine' | 'company' | 'team';
type PipelineFilter = 'active' | 'icebox' | 'hygiene' | 'closed_won' | 'closed_lost';

export default function Pipeline() {
  useCurrencyRerender();
  const { user, role, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { open: openQuickCreate } = useQuickCreate();
  const [view, setView] = useState<ViewMode>('all');
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState<PipelineScope>('company');
  const [showClosed, setShowClosed] = useState(false);
  const [pipelineFilter, setPipelineFilter] = useState<PipelineFilter>('active');
  const [showFilters, setShowFilters] = useState(false);
  const [filterOwner, setFilterOwner] = useState<string>('');
  const [filterClient, setFilterClient] = useState<string>('');
  const [filterDataset, setFilterDataset] = useState<string>('');
  const [filterStage, setFilterStage] = useState<string>('');
  const [filterDealType, setFilterDealType] = useState<string>('');
  const [filterCloseFrom, setFilterCloseFrom] = useState<string>('');
  const [filterCloseTo, setFilterCloseTo] = useState<string>('');
  const [filterBallStatus, setFilterBallStatus] = useState<string>('');
  const { data: opportunities = [], isLoading } = useOpportunities();
  const { data: profiles = [] } = useProfiles();
  const { data: clients = [] } = useClients();
  const { data: datasets = [] } = useDatasets();
  const updateOpp = useUpdateOpportunity();
  const configuredStages = useStageConfig();

  const activeFilterCount = [filterOwner, filterClient, filterDataset, filterStage, filterDealType, filterCloseFrom, filterCloseTo, filterBallStatus].filter(Boolean).length;

  const clearAllFilters = () => {
    setFilterOwner(''); setFilterClient(''); setFilterDataset(''); setFilterStage('');
    setFilterDealType(''); setFilterCloseFrom(''); setFilterCloseTo(''); setFilterBallStatus('');
  };

  const profileMap = useMemo(() => {
    const m = new Map<string, string>();
    profiles.forEach((p: any) => m.set(p.user_id, p.full_name || p.email));
    return m;
  }, [profiles]);

  // Scope filtering
  const scopedOpps = useMemo(() => {
    if (scope === 'mine') return opportunities.filter((o: any) => o.owner_id === user?.id);
    if (scope === 'team' && profile?.team) {
      const teamUserIds = new Set(profiles.filter((p: any) => p.team === profile.team).map((p: any) => p.user_id));
      return opportunities.filter((o: any) => teamUserIds.has(o.owner_id));
    }
    return opportunities; // company
  }, [opportunities, scope, user?.id, profile?.team, profiles]);

  const activeStages = stageOrder.filter(s => s !== 'Closed Won' && s !== 'Closed Lost');
  const nonIceboxOpps = scopedOpps.filter((o: any) => !(ICEBOX_STAGES as readonly string[]).includes(o.stage));
  const iceboxOpps = scopedOpps.filter((o: any) => (ICEBOX_STAGES as readonly string[]).includes(o.stage));
  const closedWonOpps = nonIceboxOpps.filter((o: any) => o.stage === 'Closed Won');
  const closedLostOpps = scopedOpps.filter((o: any) => o.stage === 'Closed Lost');

  // Hygiene issues: active opps missing crucial data or stale
  const allActiveOpps = nonIceboxOpps.filter((o: any) => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
  const hygieneOpps = useMemo(() => allActiveOpps.filter((o: any) => {
    const issues: string[] = [];
    if (!o.expected_close) issues.push('no close date');
    if (Number(o.value) === 0 && Number(o.value_min || 0) === 0 && Number(o.value_max || 0) === 0) issues.push('no value');
    if (!o.owner_id) issues.push('no owner');
    if (!o.dataset_id) issues.push('no product');
    if (!(o as any).deal_type) issues.push('no deal type');
    const lastDate = o.last_activity_at || o.updated_at || o.created_at;
    if (differenceInDays(new Date(), new Date(lastDate)) > 14) issues.push('stale (14+ days)');
    if (o.expected_close && new Date(o.expected_close) < new Date() && o.stage !== 'Closed Won' && o.stage !== 'Closed Lost') issues.push('overdue close date');
    (o as any)._hygieneIssues = issues;
    return issues.length > 0;
  }), [allActiveOpps]);

  // What to show based on filter
  const baseFilteredOpps = pipelineFilter === 'active' ? allActiveOpps
    : pipelineFilter === 'icebox' ? iceboxOpps
    : pipelineFilter === 'hygiene' ? hygieneOpps
    : pipelineFilter === 'closed_won' ? closedWonOpps
    : pipelineFilter === 'closed_lost' ? closedLostOpps
    : allActiveOpps;

  // Apply granular filters
  const filteredOpps = useMemo(() => {
    let opps = baseFilteredOpps;
    if (filterOwner) opps = opps.filter((o: any) => o.owner_id === filterOwner);
    if (filterClient) opps = opps.filter((o: any) => o.client_id === filterClient);
    if (filterDataset) opps = opps.filter((o: any) => o.dataset_id === filterDataset);
    if (filterStage) opps = opps.filter((o: any) => o.stage === filterStage);
    if (filterDealType) opps = opps.filter((o: any) => o.deal_type === filterDealType);
    if (filterBallStatus) opps = opps.filter((o: any) => (o.ball_status || 'unknown') === filterBallStatus);
    if (filterCloseFrom) opps = opps.filter((o: any) => o.expected_close && o.expected_close >= filterCloseFrom);
    if (filterCloseTo) opps = opps.filter((o: any) => o.expected_close && o.expected_close <= filterCloseTo);
    return opps;
  }, [baseFilteredOpps, filterOwner, filterClient, filterDataset, filterStage, filterDealType, filterBallStatus, filterCloseFrom, filterCloseTo]);

  // Derive which stages to show based on what's in filteredOpps
  const displayStages = useMemo(() => {
    const stagesInData = new Set(filteredOpps.map((o: any) => o.stage));
    // Use stageOrder + ICEBOX_STAGES to maintain order
    return [...stageOrder, ...ICEBOX_STAGES].filter(s => stagesInData.has(s));
  }, [filteredOpps]);

  const filterCounts = {
    active: allActiveOpps.length,
    icebox: iceboxOpps.length,
    hygiene: hygieneOpps.length,
    closed_won: closedWonOpps.length,
    closed_lost: closedLostOpps.length,
  };

  // Data completeness score
  const getCompleteness = (o: any) => {
    let score = 0;
    let total = 5;
    if (o.expected_close) score++;
    if (Number(o.value) > 0) score++;
    if (o.owner_id) score++;
    if (o.dataset_id) score++;
    if (o.next_action_description) score++;
    return { score, total, pct: Math.round((score / total) * 100) };
  };

  const toggleStage = (stage: string) => {
    setExpandedStages(prev => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  };

  const handleStageChange = async (oppId: string, newStage: string) => {
    try {
      await updateOpp.mutateAsync({ id: oppId, stage: newStage });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  // Scope controls visibility based on role
  const showTeamScope = profile?.team && (role === 'admin' || role === 'sales_manager');
  const showCompanyScope = role === 'admin' || role === 'sales_manager' || role === 'viewer';

  if (isLoading) return <AppLayout><LoadingState /></AppLayout>;

  const renderOppCard = (o: any) => {
    const bs: BallStatus = (o as any).ball_status || 'unknown';
    const daysInStage = (o as any).stage_entered_at ? differenceInDays(new Date(), new Date((o as any).stage_entered_at)) : null;
    const comp = getCompleteness(o);
    const isStale = differenceInDays(new Date(), new Date(o.last_activity_at || o.updated_at || o.created_at)) > 30;
    const isOverdueAction = o.next_action_due_date && o.next_action_due_date < new Date().toISOString().split('T')[0];
    const ownerName = o.owner_id ? profileMap.get(o.owner_id) : null;

    return (
      <div key={o.id} className={`kanban-card ${isStale ? 'border-warning/40' : ''} ${isOverdueAction ? 'border-destructive/40' : ''}`} onClick={() => navigate(`/pipeline/${o.id}`)}>
        <div className="flex items-center gap-1.5 mb-0.5">
          <p className="text-sm font-medium truncate flex-1">{o.name}</p>
          {bs !== 'unknown' && <BallStatusBadge status={bs} size="sm" showIcon={true} />}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{o.clients?.name} · {o.datasets?.name || '—'}</p>

        {scope !== 'mine' && ownerName && (
          <div className="flex items-center gap-1 mt-1">
            <User size={9} className="text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">{ownerName}</span>
          </div>
        )}

        <div className="flex items-center justify-between mt-2">
          <div>
            <span className="text-xs font-mono">{formatCurrency(Number(o.value))}</span>
            {(Number(o.value_min) > 0 || Number(o.value_max) > 0) && (
              <p className="text-[9px] text-muted-foreground font-mono">{formatCurrency(Number(o.value_min))}–{formatCurrency(Number(o.value_max))}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <CompletenessIndicator pct={comp.pct} />
            {daysInStage !== null && (
              <span className={`text-[10px] flex items-center gap-0.5 ${daysInStage > 30 ? 'text-destructive' : daysInStage > 14 ? 'text-warning' : 'text-muted-foreground'}`}>
                <Clock size={9} />{daysInStage}d
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">{o.probability}%</span>
          </div>
        </div>

        {(isStale || isOverdueAction) && (
          <div className="flex gap-1 mt-1.5 pt-1.5 border-t border-border">
            {isOverdueAction && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive flex items-center gap-0.5">
                <AlertTriangle size={8} /> Overdue action
              </span>
            )}
            {isStale && !isOverdueAction && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-warning/10 text-warning flex items-center gap-0.5">
                <Clock size={8} /> Stale
              </span>
            )}
          </div>
        )}

        {!isStale && !isOverdueAction && (o as any).next_action_description && (
          <p className="text-[10px] text-muted-foreground mt-1.5 truncate border-t border-border pt-1.5">
            {(o as any).next_action_description}
          </p>
        )}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            {filteredOpps.length} deals · {formatCurrency(filteredOpps.reduce((s: number, o: any) => s + Number(o.value), 0))} total
            · {formatCurrency(filteredOpps.reduce((s: number, o: any) => s + Number(o.value) * (o.probability / 100), 0))} weighted
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Pipeline Scope Toggle */}
          <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
            <button onClick={() => { setScope('mine'); setFilterOwner(''); }} className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${scope === 'mine' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              My Pipeline
            </button>
            {showTeamScope && (
              <button onClick={() => { setScope('team'); setFilterOwner(''); }} className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${scope === 'team' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                Team
              </button>
            )}
            {showCompanyScope && (
              <button onClick={() => { setScope('company'); setFilterOwner(''); }} className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${scope === 'company' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                Company
              </button>
            )}
          </div>

          <div className="w-px h-6 bg-border" />

          <button onClick={() => openQuickCreate()} className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90">
            <Plus size={14} /> New Opportunity
          </button>
          <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
            <button onClick={() => setView('kanban')} className={`px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 ${view === 'kanban' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              <LayoutGrid size={13} /> Board
            </button>
            <button onClick={() => setView('table')} className={`px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 ${view === 'table' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              <List size={13} /> Stages
            </button>
            <button onClick={() => setView('all')} className={`px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 ${view === 'all' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              <Table2 size={13} /> All Opps
            </button>
            <button onClick={() => setView('forecast')} className={`px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 ${view === 'forecast' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              <LineChart size={13} /> Forecast
            </button>
          </div>
        </div>
      </div>

      {/* Pipeline Filter Tabs + Granular Filters (hidden in Forecast view) */}
      {view !== 'forecast' && <div className="flex items-center gap-1 mb-0 border-b border-border">
        {([
          { key: 'active', label: 'Active' },
          { key: 'icebox', label: 'Icebox' },
          { key: 'hygiene', label: 'Hygiene' },
          { key: 'closed_won', label: 'Closed Won' },
          { key: 'closed_lost', label: 'Closed Lost' },
        ] as const).map(f => (
          <button
            key={f.key}
            onClick={() => setPipelineFilter(f.key)}
            className={`px-3 py-2 text-sm border-b-2 transition-colors ${
              pipelineFilter === f.key
                ? 'border-primary text-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {f.label}
            <span className="ml-1.5 text-[10px] bg-muted px-1.5 py-0.5 rounded-full">{filterCounts[f.key]}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pb-1">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
              showFilters || activeFilterCount > 0
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Filter size={12} />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{activeFilterCount}</span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button onClick={clearAllFilters} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <X size={11} /> Clear
            </button>
          )}
        </div>
      </div>}

      {showFilters && view !== 'forecast' && (
        <div className="flex items-end gap-3 flex-wrap py-3 px-1 mb-1 border-b border-border bg-muted/20 rounded-b-md -mt-px">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Owner</label>
            <select value={filterOwner} onChange={e => {
              const val = e.target.value;
              setFilterOwner(val);
              if (val === user?.id) setScope('mine');
              else if (val && scope === 'mine') setScope('company');
            }} className="block w-[140px] bg-card border border-border rounded px-2 py-1.5 text-xs">
              <option value="">All owners</option>
              {profiles.filter((p: any) => p.is_active).map((p: any) => (
                <option key={p.user_id} value={p.user_id}>{p.full_name || p.email}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Client</label>
            <select value={filterClient} onChange={e => setFilterClient(e.target.value)} className="block w-[160px] bg-card border border-border rounded px-2 py-1.5 text-xs">
              <option value="">All clients</option>
              {clients.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')).map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Dataset</label>
            <select value={filterDataset} onChange={e => setFilterDataset(e.target.value)} className="block w-[140px] bg-card border border-border rounded px-2 py-1.5 text-xs">
              <option value="">All datasets</option>
              {datasets.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')).map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Stage</label>
            <select value={filterStage} onChange={e => setFilterStage(e.target.value)} className="block w-[140px] bg-card border border-border rounded px-2 py-1.5 text-xs">
              <option value="">All stages</option>
              {configuredStages.map(s => <option key={s} value={s}>{s}</option>)}
              <option value="Inactive">Inactive</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Deal Type</label>
            <select value={filterDealType} onChange={e => setFilterDealType(e.target.value)} className="block w-[120px] bg-card border border-border rounded px-2 py-1.5 text-xs">
              <option value="">All types</option>
              {['New Business', 'Upsell', 'Renewal', 'Trial'].map(dt => <option key={dt} value={dt}>{dt}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Court</label>
            <select value={filterBallStatus} onChange={e => setFilterBallStatus(e.target.value)} className="block w-[120px] bg-card border border-border rounded px-2 py-1.5 text-xs">
              <option value="">All</option>
              <option value="our_court">Our Move</option>
              <option value="their_court">Their Move</option>
              <option value="neutral">Open Loop</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Close From</label>
            <input type="date" value={filterCloseFrom} onChange={e => setFilterCloseFrom(e.target.value)} className="block w-[130px] bg-card border border-border rounded px-2 py-1.5 text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Close To</label>
            <input type="date" value={filterCloseTo} onChange={e => setFilterCloseTo(e.target.value)} className="block w-[130px] bg-card border border-border rounded px-2 py-1.5 text-xs" />
          </div>
        </div>
      )}

      <div className="mb-4" />

      {view === 'forecast' ? (
        <ForecastView opportunities={opportunities} />
      ) : scopedOpps.length === 0 && view !== 'all' ? (
        <EmptyState icon={LayoutGrid} title={scope === 'mine' ? 'No deals in your pipeline' : 'No deals found'} description={scope === 'mine' ? 'Create an opportunity or switch to Company view.' : 'Create your first opportunity to get started.'} actionLabel="Create Opportunity" onAction={() => openQuickCreate()} />
      ) : view === 'all' ? (
        <AllOpportunitiesTable
          opportunities={filteredOpps}
          profiles={profiles}
          clients={clients}
          datasets={datasets}
          scope={scope}
          userId={user?.id}
        />
      ) : view === 'kanban' ? (
        <KanbanBoard
          opportunities={filteredOpps}
          stages={displayStages}
          profileMap={profileMap}
          scope={scope}
          onStageChange={handleStageChange}
          getCompleteness={getCompleteness}
        />
      ) : (
        <div className="data-card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Opportunity</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Client</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Dataset</th>
                {scope !== 'mine' && <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Owner</th>}
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Stage</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Court</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Age</th>
                <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Value</th>
                <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Prob</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Close</th>
                <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium w-10">
                  <span title="Data completeness">●</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {displayStages.map(stage => {
                const opps = filteredOpps.filter((o: any) => o.stage === stage);
                if (opps.length === 0) return null;
                const total = opps.reduce((s: number, o: any) => s + Number(o.value), 0);
                const weighted = opps.reduce((s: number, o: any) => s + Number(o.value) * (o.probability / 100), 0);
                const isExpanded = expandedStages.has(stage);

                return (
                  <Fragment key={stage}>
                    <tr
                      className="border-b border-border bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => toggleStage(stage)}
                    >
                      <td className="px-4 py-2.5 font-semibold text-xs" colSpan={2}>
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          <span className={`status-badge ${getStageColor(stage)}`}>{stage}</span>
                          <span className="text-muted-foreground font-normal">{opps.length} deals</span>
                        </div>
                      </td>
                      <td colSpan={scope !== 'mine' ? 5 : 4} />
                      <td className="px-4 py-2.5 text-right font-mono text-xs font-medium">{formatCurrency(total)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-primary">{formatCurrency(weighted)}</td>
                      <td colSpan={2} />
                    </tr>
                    {isExpanded && opps.map((o: any) => {
                      const bs: BallStatus = (o as any).ball_status || 'unknown';
                      const daysInStage = (o as any).stage_entered_at ? differenceInDays(new Date(), new Date((o as any).stage_entered_at)) : null;
                      const comp = getCompleteness(o);
                      const isStale = differenceInDays(new Date(), new Date(o.last_activity_at || o.updated_at || o.created_at)) > 30;
                      const isOverdueAction = o.next_action_due_date && o.next_action_due_date < new Date().toISOString().split('T')[0];
                      const ownerName = o.owner_id ? profileMap.get(o.owner_id) : null;

                      return (
                        <tr key={o.id} className={`border-b border-border hover:bg-muted/30 cursor-pointer transition-colors ${isStale ? 'bg-warning/[0.03]' : ''} ${isOverdueAction ? 'bg-destructive/[0.03]' : ''}`} onClick={() => navigate(`/pipeline/${o.id}`)}>
                          <td className="px-4 py-3 pl-10">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{o.name}</span>
                              {isOverdueAction && <span className="text-[9px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">overdue</span>}
                              {isStale && !isOverdueAction && <span className="text-[9px] px-1.5 py-0.5 rounded bg-warning/10 text-warning">stale</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{o.clients?.name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{o.datasets?.name || '—'}</td>
                          {scope !== 'mine' && <td className="px-4 py-3 text-xs text-muted-foreground">{ownerName || <span className="text-destructive">Unassigned</span>}</td>}
                          <td className="px-4 py-3">
                            <span className={`status-badge ${getStageColor(o.stage)}`}>{o.stage}</span>
                          </td>
                          <td className="px-4 py-3">
                            <BallStatusBadge status={bs} size="sm" />
                          </td>
                          <td className="px-4 py-3">
                            {daysInStage !== null && (
                              <span className={`text-xs font-mono flex items-center gap-0.5 ${daysInStage > 30 ? 'text-destructive' : daysInStage > 14 ? 'text-warning' : 'text-muted-foreground'}`}>
                                <Clock size={10} />{daysInStage}d
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">{formatCurrency(Number(o.value))}</td>
                          <td className="px-4 py-3 text-right font-mono text-muted-foreground">{o.probability}%</td>
                          <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{o.expected_close || <span className="text-warning">—</span>}</td>
                          <td className="px-4 py-3 text-center">
                            <CompletenessIndicator pct={comp.pct} />
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}

function CompletenessIndicator({ pct }: { pct: number }) {
  const color = pct >= 80 ? 'bg-success' : pct >= 60 ? 'bg-warning' : 'bg-destructive';
  return (
    <div className="flex items-center gap-1" title={`${pct}% complete`}>
      <div className="w-3 h-3 rounded-full border border-border relative overflow-hidden">
        <div className={`absolute bottom-0 left-0 right-0 ${color} transition-all`} style={{ height: `${pct}%` }} />
      </div>
    </div>
  );
}
