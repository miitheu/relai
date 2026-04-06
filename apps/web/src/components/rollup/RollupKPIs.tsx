import { formatCurrency } from '@/data/mockData';
import { useCurrencyRerender } from '@/hooks/useCurrencyRerender';
import { TrendingUp, Target, BarChart3, Calendar, DollarSign, Percent, Clock, RefreshCw, Database, AlertCircle } from 'lucide-react';

interface KPIs {
  totalPipelineValue: number;
  weightedPipeline: number;
  openCount: number;
  closingThisQCount: number;
  closingThisQValue: number;
  avgDealSize: number;
  winRate: number;
  avgCycleLength: number;
  renewalsDue90: number;
  renewalsDue90Value: number;
}

export default function RollupKPIs({ kpis, trialKPIs, actionCount }: { kpis: KPIs; trialKPIs?: any; actionCount?: number }) {
  useCurrencyRerender();
  const cards = [
    { icon: TrendingUp, label: 'Total Pipeline', value: formatCurrency(kpis.totalPipelineValue), sub: `${kpis.openCount} open opps`, accent: 'text-primary' },
    { icon: Target, label: 'Weighted Pipeline', value: formatCurrency(kpis.weightedPipeline), sub: 'Probability-adjusted', accent: 'text-primary' },
    { icon: BarChart3, label: 'Closing This Quarter', value: formatCurrency(kpis.closingThisQValue), sub: `${kpis.closingThisQCount} opportunities`, accent: 'text-info' },
    { icon: DollarSign, label: 'Avg Deal Size', value: formatCurrency(kpis.avgDealSize), sub: 'Open pipeline', accent: 'text-info' },
    { icon: Percent, label: 'Win Rate', value: `${kpis.winRate.toFixed(0)}%`, sub: 'Won / all opps this year', accent: kpis.winRate >= 50 ? 'text-success' : 'text-warning' },
    { icon: Clock, label: 'Avg Sales Cycle', value: kpis.avgCycleLength > 0 ? `${kpis.avgCycleLength}d` : '—', sub: 'Won deals', accent: 'text-muted-foreground' },
    { icon: RefreshCw, label: 'Renewals (90d)', value: String(kpis.renewalsDue90), sub: formatCurrency(kpis.renewalsDue90Value), accent: 'text-warning' },
    { icon: Database, label: 'Active Trials', value: String(trialKPIs?.activeCount || 0), sub: `${trialKPIs?.conversionRate || 0}% conversion`, accent: 'text-info' },
  ];

  return (
    <div className="grid grid-cols-4 gap-3 mb-6">
      {cards.map((c, i) => (
        <div key={i} className="data-card py-3 px-4">
          <div className="flex items-center gap-2 mb-1.5">
            <c.icon size={13} className={c.accent} />
            <span className="metric-label">{c.label}</span>
          </div>
          <div className="text-xl font-semibold font-mono tracking-tight">{c.value}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}
