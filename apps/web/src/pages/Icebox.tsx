import { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { useOpportunities, useUpdateOpportunity, useProfiles, useClients, useDatasets } from '@/hooks/useCrmData';
import { formatCurrency, getStageColor, ICEBOX_STAGES, stageOrder } from '@/data/mockData';
import { useCurrencyRerender } from '@/hooks/useCurrencyRerender';
import { Snowflake, ChevronRight, TrendingUp, ArchiveRestore, Search } from 'lucide-react';
import { differenceInDays } from 'date-fns';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import BallStatusBadge from '@/components/BallStatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

type PipelineScope = 'mine' | 'company' | 'team';

export default function Icebox() {
  useCurrencyRerender();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { data: opportunities = [], isLoading } = useOpportunities();
  const { data: profiles = [] } = useProfiles();
  const { data: clients = [] } = useClients();
  const { data: datasets = [] } = useDatasets();
  const updateOpp = useUpdateOpportunity();

  const [scope, setScope] = useState<PipelineScope>('company');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

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
    return opportunities;
  }, [opportunities, scope, user?.id, profile?.team, profiles]);

  // Icebox = opportunities in icebox stages
  const iceboxOpps = useMemo(() => {
    let filtered = scopedOpps.filter((o: any) => (ICEBOX_STAGES as readonly string[]).includes(o.stage));
    if (stageFilter !== 'all') filtered = filtered.filter((o: any) => o.stage === stageFilter);
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((o: any) =>
        o.name?.toLowerCase().includes(q) ||
        o.clients?.name?.toLowerCase().includes(q) ||
        o.datasets?.name?.toLowerCase().includes(q)
      );
    }
    return filtered.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [scopedOpps, stageFilter, search]);

  const totalValue = iceboxOpps.reduce((s: number, o: any) => s + Number(o.value), 0);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    ICEBOX_STAGES.forEach(s => { counts[s] = 0; });
    scopedOpps.forEach((o: any) => {
      if ((ICEBOX_STAGES as readonly string[]).includes(o.stage)) {
        counts[o.stage] = (counts[o.stage] || 0) + 1;
      }
    });
    return counts;
  }, [scopedOpps]);

  const handleReactivate = (opp: any) => {
    updateOpp.mutate({ id: opp.id, stage: 'Lead' }, {
      onSuccess: () => toast({ title: 'Reactivated', description: `${opp.name} moved to Lead stage.` }),
    });
  };

  if (isLoading) return <AppLayout><LoadingState /></AppLayout>;

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Snowflake size={20} className="text-info" />
            Icebox
          </h1>
          <p className="text-sm text-muted-foreground">
            Inactive and lost opportunities — not in active pipeline
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {ICEBOX_STAGES.map(stage => (
          <div key={stage} className="data-card text-center">
            <p className="text-2xl font-bold">{stageCounts[stage]}</p>
            <p className="text-xs text-muted-foreground">{stage}</p>
          </div>
        ))}
        <div className="data-card text-center">
          <p className="text-2xl font-bold text-primary">{formatCurrency(totalValue)}</p>
          <p className="text-xs text-muted-foreground">Total Value</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search opportunities..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>

        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue placeholder="All stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {ICEBOX_STAGES.map(s => (
              <SelectItem key={s} value={s}>{s} ({stageCounts[s]})</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-1 ml-auto">
          {(['mine', 'team', 'company'] as PipelineScope[]).map(s => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${scope === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
            >
              {s === 'mine' ? 'My' : s === 'team' ? 'Team' : 'Company'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {iceboxOpps.length === 0 ? (
        <EmptyState
          icon={Snowflake}
          title="Icebox is empty"
          description="No inactive or lost opportunities found."
        />
      ) : (
        <div className="space-y-2">
          {iceboxOpps.map((opp: any) => (
            <div
              key={opp.id}
              className="data-card flex items-center justify-between cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => navigate(`/pipeline/${opp.id}`)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <TrendingUp size={14} className="text-muted-foreground shrink-0" />
                  <span className="font-medium truncate">{opp.name}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span>{opp.clients?.name || '—'}</span>
                  <span>·</span>
                  <span>{opp.datasets?.name || 'No dataset'}</span>
                  {opp.owner_id && profileMap.has(opp.owner_id) && (
                    <>
                      <span>·</span>
                      <span>{profileMap.get(opp.owner_id)}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <BallStatusBadge status={opp.ball_status} />
                <span className={`status-badge ${getStageColor(opp.stage)}`}>{opp.stage}</span>
                <div className="text-right w-24">
                  <span className="font-mono font-medium">{formatCurrency(Number(opp.value))}</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs gap-1"
                  onClick={e => { e.stopPropagation(); handleReactivate(opp); }}
                  title="Reactivate to Lead"
                >
                  <ArchiveRestore size={14} />
                </Button>
                <ChevronRight size={14} className="text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
