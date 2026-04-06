import { useMemo } from 'react';
import { formatCurrency } from '@/data/mockData';
import { useCurrencyRerender } from '@/hooks/useCurrencyRerender';
import { Database, TrendingUp, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

interface Props {
  deliveries: any[];
  opportunities: any[];
  datasets: any[];
  clients: any[];
}

function daysBetween(a: string | Date, b: string | Date) {
  return Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

function getTrialStatusLocal(status: string, startDate: string, endDate: string, oppStage?: string) {
  if (oppStage === 'Closed Won') return 'converted';
  if (status === 'completed' || status === 'inactive') return 'expired';
  if (!endDate) return 'active';
  const daysLeft = daysBetween(new Date(), endDate);
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 7) return 'ending_soon';
  return 'active';
}

export default function RollupTrials({ deliveries, opportunities, datasets, clients }: Props) {
  useCurrencyRerender();
  const trials = useMemo(() => {
    return deliveries
      .filter((d: any) => d.delivery_type?.toLowerCase() === 'trial')
      .map((t: any) => {
        const opp = opportunities.find((o: any) => o.id === t.opportunity_id);
        const status = getTrialStatusLocal(t.status, t.trial_start_date, t.trial_end_date, opp?.stage);
        const daysLeft = t.trial_end_date ? daysBetween(new Date(), t.trial_end_date) : null;
        return { ...t, trialStatus: status, daysLeft, opp };
      });
  }, [deliveries, opportunities]);

  const active = trials.filter(t => t.trialStatus === 'active' || t.trialStatus === 'ending_soon');
  const endingSoon = trials.filter(t => t.trialStatus === 'ending_soon');
  const converted = trials.filter(t => t.trialStatus === 'converted');
  const expired = trials.filter(t => t.trialStatus === 'expired');
  const conversionRate = trials.length ? Math.round((converted.length / trials.length) * 100) : 0;
  const convertedRev = converted.reduce((sum, t) => sum + (t.opp ? Number(t.opp.value) : 0), 0);

  // By dataset
  const byDataset = useMemo(() => {
    const map = new Map<string, { name: string; total: number; active: number; converted: number; revenue: number }>();
    trials.forEach(t => {
      const dsId = t.dataset_id || 'none';
      const ds = datasets.find((d: any) => d.id === dsId);
      const cur = map.get(dsId) || { name: ds?.name || 'No Dataset', total: 0, active: 0, converted: 0, revenue: 0 };
      cur.total++;
      if (t.trialStatus === 'active' || t.trialStatus === 'ending_soon') cur.active++;
      if (t.trialStatus === 'converted') {
        cur.converted++;
        cur.revenue += t.opp ? Number(t.opp.value) : 0;
      }
      map.set(dsId, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [trials, datasets]);

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <div className="data-card">
          <div className="flex items-center gap-2 mb-1.5">
            <Database size={13} className="text-info" />
            <span className="metric-label">Active Trials</span>
          </div>
          <div className="text-xl font-semibold font-mono">{active.length}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{endingSoon.length} ending within 7d</p>
        </div>
        <div className="data-card">
          <div className="flex items-center gap-2 mb-1.5">
            <TrendingUp size={13} className="text-success" />
            <span className="metric-label">Conversion Rate</span>
          </div>
          <div className="text-xl font-semibold font-mono">{conversionRate}%</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{converted.length} of {trials.length} trials</p>
        </div>
        <div className="data-card">
          <div className="flex items-center gap-2 mb-1.5">
            <CheckCircle2 size={13} className="text-success" />
            <span className="metric-label">Converted Revenue</span>
          </div>
          <div className="text-xl font-semibold font-mono">{formatCurrency(convertedRev)}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">From {converted.length} conversions</p>
        </div>
        <div className="data-card">
          <div className="flex items-center gap-2 mb-1.5">
            <Clock size={13} className="text-muted-foreground" />
            <span className="metric-label">Expired / Inactive</span>
          </div>
          <div className="text-xl font-semibold font-mono">{expired.length}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Not converted</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Conversion by Dataset */}
        <div className="data-card">
          <h3 className="text-sm font-medium mb-4">Trial Performance by Dataset</h3>
          {byDataset.length === 0 ? (
            <p className="text-xs text-muted-foreground">No trial data.</p>
          ) : (
            <div className="space-y-3">
              {byDataset.map(d => {
                const rate = d.total > 0 ? Math.round((d.converted / d.total) * 100) : 0;
                return (
                  <div key={d.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground truncate max-w-[200px]">{d.name}</span>
                      <span className="font-mono">{d.active} active · {rate}% conv</span>
                    </div>
                    <div className="h-4 bg-muted rounded overflow-hidden flex">
                      {d.total > 0 && (
                        <>
                          <div className="h-full bg-success/50 rounded-l" style={{ width: `${(d.converted / d.total) * 100}%` }} />
                          <div className="h-full bg-info/40" style={{ width: `${(d.active / d.total) * 100}%` }} />
                          <div className="h-full bg-muted-foreground/20" style={{ width: `${((d.total - d.converted - d.active) / d.total) * 100}%` }} />
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Ending Soon list */}
        <div className="data-card">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={13} className="text-warning" />
            <h3 className="text-sm font-medium">Trials Ending Soon</h3>
          </div>
          {endingSoon.length === 0 ? (
            <div className="flex items-center gap-2 py-6 justify-center">
              <CheckCircle2 size={14} className="text-success" />
              <p className="text-xs text-muted-foreground">No trials ending within 7 days</p>
            </div>
          ) : (
            <div className="space-y-2">
              {endingSoon.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between bg-muted/50 rounded px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{t.clients?.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{t.datasets?.name}</p>
                  </div>
                  <span className={`status-badge text-[10px] ${t.daysLeft != null && t.daysLeft <= 2 ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}`}>
                    {t.daysLeft}d left
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* All active trials table */}
      {active.length > 0 && (
        <div className="data-card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-medium">Active Trials ({active.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Client</th>
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Dataset</th>
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Opportunity</th>
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Start</th>
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">End</th>
                  <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Days Left</th>
                </tr>
              </thead>
              <tbody>
                {active.map((t: any) => (
                  <tr key={t.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-medium">{t.clients?.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{t.datasets?.name || '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[160px]">{t.opp?.name || '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">{t.trial_start_date || '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">{t.trial_end_date || '—'}</td>
                    <td className={`px-4 py-2.5 text-right font-mono ${t.daysLeft != null && t.daysLeft <= 7 ? 'text-warning font-medium' : 'text-muted-foreground'}`}>
                      {t.daysLeft != null ? `${t.daysLeft}d` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
