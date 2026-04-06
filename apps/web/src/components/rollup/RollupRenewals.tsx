import { formatCurrency } from '@/data/mockData';
import { useCurrencyRerender } from '@/hooks/useCurrencyRerender';
import { useMemo } from 'react';

interface Props {
  renewals: any[];
  renewalsByMonth: { month: string; count: number; value: number }[];
  contracts: any[];
  clients: any[];
  datasets: any[];
}

function daysBetween(a: string | Date, b: string | Date) {
  return Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

export default function RollupRenewals({ renewals, renewalsByMonth, contracts, clients, datasets }: Props) {
  useCurrencyRerender();
  const now = new Date();

  const upcoming = useMemo(() =>
    renewals.filter((r: any) => !['Renewed', 'Lost'].includes(r.status) && new Date(r.renewal_date) >= now)
      .sort((a: any, b: any) => new Date(a.renewal_date).getTime() - new Date(b.renewal_date).getTime()),
    [renewals]
  );

  const due30 = upcoming.filter((r: any) => daysBetween(now, r.renewal_date) <= 30);
  const due60 = upcoming.filter((r: any) => daysBetween(now, r.renewal_date) <= 60);
  const due90 = upcoming.filter((r: any) => daysBetween(now, r.renewal_date) <= 90);

  const statusDist = useMemo(() => {
    const m = new Map<string, number>();
    renewals.forEach((r: any) => m.set(r.status, (m.get(r.status) || 0) + 1));
    return Array.from(m.entries()).map(([status, count]) => ({ status, count }));
  }, [renewals]);

  const maxMonthVal = Math.max(...renewalsByMonth.map(m => m.value), 1);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Due in 30 Days', count: due30.length, value: due30.reduce((s: number, r: any) => s + Number(r.value), 0), accent: 'text-destructive' },
          { label: 'Due in 60 Days', count: due60.length, value: due60.reduce((s: number, r: any) => s + Number(r.value), 0), accent: 'text-warning' },
          { label: 'Due in 90 Days', count: due90.length, value: due90.reduce((s: number, r: any) => s + Number(r.value), 0), accent: 'text-info' },
        ].map(c => (
          <div key={c.label} className="data-card">
            <span className={`metric-label ${c.accent}`}>{c.label}</span>
            <div className="metric-value mt-1">{formatCurrency(c.value)}</div>
            <p className="text-xs text-muted-foreground mt-1">{c.count} renewals</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Renewals by month */}
        <div className="data-card">
          <h3 className="text-sm font-medium mb-4">Renewals by Month</h3>
          {renewalsByMonth.length === 0 ? (
            <p className="text-xs text-muted-foreground">No upcoming renewals.</p>
          ) : (
            <div className="space-y-2">
              {renewalsByMonth.map(m => (
                <div key={m.month}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground font-mono">{m.month}</span>
                    <span className="font-mono">{formatCurrency(m.value)} · {m.count}</span>
                  </div>
                  <div className="h-4 bg-muted rounded overflow-hidden">
                    <div className="h-full bg-warning/50 rounded" style={{ width: `${(m.value / maxMonthVal) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Status distribution */}
        <div className="data-card">
          <h3 className="text-sm font-medium mb-4">Renewal Status</h3>
          {statusDist.length === 0 ? (
            <p className="text-xs text-muted-foreground">No renewals.</p>
          ) : (
            <div className="space-y-3">
              {statusDist.map(s => {
                const total = renewals.length || 1;
                const colors: Record<string, string> = { Upcoming: 'bg-info/50', Negotiation: 'bg-warning/50', Renewed: 'bg-success/50', Lost: 'bg-destructive/50' };
                return (
                  <div key={s.status}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{s.status}</span>
                      <span className="font-mono">{s.count}</span>
                    </div>
                    <div className="h-4 bg-muted rounded overflow-hidden">
                      <div className={`h-full rounded ${colors[s.status] || 'bg-muted-foreground/30'}`} style={{ width: `${(s.count / total) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Upcoming renewals table */}
      <div className="data-card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium">Upcoming Renewals</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Client</th>
                <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Dataset</th>
                <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Status</th>
                <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Value</th>
                <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Date</th>
                <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Days Left</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No upcoming renewals.</td></tr>
              ) : upcoming.map((r: any) => {
                const daysLeft = daysBetween(now, r.renewal_date);
                return (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-medium">{r.clients?.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.datasets?.name || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className="status-badge bg-muted text-foreground">{r.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatCurrency(Number(r.value))}</td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">{r.renewal_date}</td>
                    <td className={`px-4 py-2.5 text-right font-mono ${daysLeft <= 30 ? 'text-destructive' : daysLeft <= 60 ? 'text-warning' : 'text-muted-foreground'}`}>{daysLeft}d</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
