import { formatCurrency } from '@/data/mockData';
import { useCurrencyRerender } from '@/hooks/useCurrencyRerender';
import { AlertTriangle } from 'lucide-react';

interface Props {
  repPerformance: any[];
  staleDeals: any[];
}

export default function RollupTeam({ repPerformance, staleDeals }: Props) {
  useCurrencyRerender();
  return (
    <div className="space-y-6">
      {/* Rep performance table */}
      <div className="data-card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium">Rep Performance Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Rep</th>
                <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Open Pipeline</th>
                <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Weighted</th>
                <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Opps</th>
                <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Avg Deal</th>
                <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Won (Q)</th>
                <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Won Value (Q)</th>
                <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Stale</th>
              </tr>
            </thead>
            <tbody>
              {repPerformance.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No rep data available.</td></tr>
              ) : repPerformance.map(r => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-4 py-2.5 font-medium">{r.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{formatCurrency(r.openValue)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-primary">{formatCurrency(r.weightedValue)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{r.oppCount}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{formatCurrency(r.avgDealSize)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-success">{r.wonThisQ}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-success">{formatCurrency(r.wonValueQ)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {r.staleCount > 0 ? <span className="text-warning">{r.staleCount}</span> : <span className="text-muted-foreground">0</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pipeline visualization per rep */}
      <div className="data-card">
        <h3 className="text-sm font-medium mb-4">Pipeline Comparison</h3>
        {repPerformance.length === 0 ? (
          <p className="text-xs text-muted-foreground">No data.</p>
        ) : (
          <div className="space-y-3">
            {repPerformance.map(r => {
              const maxVal = Math.max(...repPerformance.map(x => x.openValue), 1);
              return (
                <div key={r.id}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{r.name}</span>
                    <span className="font-mono">{formatCurrency(r.openValue)} ({r.oppCount} opps)</span>
                  </div>
                  <div className="h-5 bg-muted rounded overflow-hidden relative">
                    <div className="absolute inset-y-0 left-0 bg-info/30 rounded" style={{ width: `${(r.openValue / maxVal) * 100}%` }} />
                    <div className="absolute inset-y-0 left-0 bg-info/60 rounded" style={{ width: `${(r.weightedValue / maxVal) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stage bottleneck */}
      {staleDeals.length > 0 && (
        <div className="data-card border-warning/30">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={14} className="text-warning" />
            <h3 className="text-sm font-medium">Deals Needing Attention</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">{staleDeals.length} deals with no activity in 30+ days</p>
          <div className="grid grid-cols-2 gap-2">
            {staleDeals.slice(0, 6).map((d: any) => (
              <div key={d.id} className="flex items-center justify-between bg-muted/50 rounded px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{d.name}</p>
                  <p className="text-[10px] text-muted-foreground">{d.clients?.name} · {d.stage}</p>
                </div>
                <div className="text-right ml-2 shrink-0">
                  <p className="text-xs font-mono">{formatCurrency(Number(d.value))}</p>
                  <p className="text-[10px] text-warning">{d.daysStale}d stale</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
