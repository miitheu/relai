import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import LoadingState from '@/components/LoadingState';
import { useSalesRollup, RollupFilters } from '@/hooks/useSalesRollup';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency } from '@/data/mockData';
import { useCurrencyRerender } from '@/hooks/useCurrencyRerender';
import RollupKPIs from '@/components/rollup/RollupKPIs';
import RollupCharts from '@/components/rollup/RollupCharts';
import RollupTable from '@/components/rollup/RollupTable';
import RollupTeam from '@/components/rollup/RollupTeam';
import RollupRenewals from '@/components/rollup/RollupRenewals';
import RollupTrials from '@/components/rollup/RollupTrials';
import RollupFiltersBar from '@/components/rollup/RollupFiltersBar';
import { BarChart3, Users, RefreshCw, Table2, Database } from 'lucide-react';
import { useAllDeliveries } from '@/hooks/useCrmData';

type Tab = 'overview' | 'team' | 'trials' | 'renewals' | 'all';

const tabs: { key: Tab; label: string; icon: any }[] = [
  { key: 'overview', label: 'Pipeline', icon: BarChart3 },
  { key: 'team', label: 'Team', icon: Users },
  { key: 'trials', label: 'Trials', icon: Database },
  { key: 'renewals', label: 'Renewals', icon: RefreshCw },
  { key: 'all', label: 'All Deals', icon: Table2 },
];

export default function SalesRollup() {
  useCurrencyRerender();
  const { role } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [filters, setFilters] = useState<RollupFilters>({ openOnly: true });

  const rollup = useSalesRollup(filters);
  const { data: allDeliveries = [] } = useAllDeliveries();
  const { isLoading, kpis, trialKPIs, filteredOpps, stageDistribution, pipelineByOwner, forecastByMonth, dealAging, pipelineByDataset, renewalsByMonth, repPerformance, staleDeals, forecastConfidence, renewals, profiles, clients, datasets, contracts } = rollup;

  // Chart click drill-down
  const handleChartDrill = (key: string, value: string) => {
    if (key === 'stage') setFilters(f => ({ ...f, stage: f.stage === value ? undefined : value, openOnly: false }));
    if (key === 'owner') setFilters(f => ({ ...f, owner: f.owner === value ? undefined : value }));
    if (key === 'dataset') setFilters(f => ({ ...f, dataset: f.dataset === value ? undefined : value }));
  };

  if (isLoading) return <AppLayout><LoadingState /></AppLayout>;

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Revenue Command Center</h1>
          <p className="text-sm text-muted-foreground">
            {filteredOpps.length} opportunities · Last updated {new Date().toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <RollupKPIs kpis={kpis} trialKPIs={trialKPIs} />

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border mb-6 mt-2">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters bar */}
      <RollupFiltersBar
        filters={filters}
        setFilters={setFilters}
        profiles={profiles}
        datasets={datasets}
        clients={clients}
      />

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <RollupCharts
            stageDistribution={stageDistribution}
            pipelineByOwner={pipelineByOwner}
            dealAging={dealAging}
            pipelineByDataset={pipelineByDataset}
            forecastConfidence={forecastConfidence}
            staleDeals={staleDeals}
            onDrill={handleChartDrill}
          />

          {/* Inline forecast by month — merged from old Forecast tab */}
          {forecastByMonth.length > 0 && (
            <div className="data-card">
              <h3 className="text-sm font-medium mb-4">Forecast by Expected Close (Quarterly)</h3>
              <div className="space-y-3">
                {forecastByMonth.map(m => {
                  const maxVal = Math.max(...forecastByMonth.map(x => x.value), 1);
                  return (
                    <div key={m.month} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground font-mono">{m.month}</span>
                        <div className="flex gap-4">
                          <span className="text-muted-foreground">Unweighted: <span className="text-foreground font-mono">{formatCurrency(m.value)}</span></span>
                          <span className="text-muted-foreground">Weighted: <span className="text-primary font-mono">{formatCurrency(m.weighted)}</span></span>
                        </div>
                      </div>
                      <div className="h-5 bg-muted rounded overflow-hidden relative">
                        <div className="absolute inset-y-0 left-0 bg-primary/20 rounded" style={{ width: `${(m.value / maxVal) * 100}%` }} />
                        <div className="absolute inset-y-0 left-0 bg-primary/60 rounded" style={{ width: `${(m.weighted / maxVal) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'team' && (
        <RollupTeam repPerformance={repPerformance} staleDeals={staleDeals} />
      )}

      {activeTab === 'trials' && (
        <RollupTrials
          deliveries={allDeliveries}
          opportunities={filteredOpps}
          datasets={datasets}
          clients={clients}
        />
      )}

      {activeTab === 'renewals' && (
        <RollupRenewals renewals={renewals} renewalsByMonth={renewalsByMonth} contracts={contracts} clients={clients} datasets={datasets} />
      )}

      {activeTab === 'all' && (
        <RollupTable
          opps={filteredOpps}
          profiles={profiles}
          onDrill={handleChartDrill}
        />
      )}
    </AppLayout>
  );
}
