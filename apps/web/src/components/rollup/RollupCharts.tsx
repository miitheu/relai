import { formatCurrency } from '@/data/mockData';
import { useCurrencyRerender } from '@/hooks/useCurrencyRerender';
import { AlertTriangle } from 'lucide-react';

interface Props {
  stageDistribution: { stage: string; count: number; value: number }[];
  pipelineByOwner: { name: string; count: number; value: number; weighted: number }[];
  dealAging: { label: string; count: number; value: number }[];
  pipelineByDataset: { id: string; name: string; count: number; value: number }[];
  forecastConfidence: { high: { count: number; value: number }; medium: { count: number; value: number }; low: { count: number; value: number } };
  staleDeals: any[];
  onDrill: (key: string, value: string) => void;
}

export default function RollupCharts({ stageDistribution, pipelineByOwner, dealAging, pipelineByDataset, forecastConfidence, staleDeals, onDrill }: Props) {
  useCurrencyRerender();
  const maxStageVal = Math.max(...stageDistribution.map(s => s.value), 1);
  const maxOwnerVal = Math.max(...pipelineByOwner.map(o => o.value), 1);
  const maxDsVal = Math.max(...pipelineByDataset.map(d => d.value), 1);
  const maxAgingVal = Math.max(...dealAging.map(d => d.count), 1);
  const totalConfidence = forecastConfidence.high.value + forecastConfidence.medium.value + forecastConfidence.low.value;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        {/* Stage distribution */}
        <div className="data-card">
          <h3 className="text-sm font-medium mb-4">Opportunities by Stage</h3>
          {stageDistribution.length === 0 ? (
            <p className="text-xs text-muted-foreground">No open opportunities.</p>
          ) : (
            <div className="space-y-2">
              {stageDistribution.map(s => (
                <button key={s.stage} onClick={() => onDrill('stage', s.stage)} className="w-full group">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-36 truncate text-left group-hover:text-foreground transition-colors">{s.stage}</span>
                    <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
                      <div className="h-full bg-primary/50 group-hover:bg-primary/70 rounded transition-all" style={{ width: `${(s.value / maxStageVal) * 100}%` }} />
                    </div>
                    <span className="text-xs font-mono w-20 text-right">{formatCurrency(s.value)}</span>
                    <span className="text-[10px] text-muted-foreground w-8 text-right">{s.count}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Pipeline by owner */}
        <div className="data-card">
          <h3 className="text-sm font-medium mb-4">Pipeline by Owner</h3>
          {pipelineByOwner.length === 0 ? (
            <p className="text-xs text-muted-foreground">No assigned opportunities.</p>
          ) : (
            <div className="space-y-2">
              {pipelineByOwner.map(o => (
                <button key={o.name} onClick={() => onDrill('owner', o.name)} className="w-full group">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-32 truncate text-left group-hover:text-foreground transition-colors">{o.name}</span>
                    <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
                      <div className="h-full bg-info/50 group-hover:bg-info/70 rounded transition-all" style={{ width: `${(o.value / maxOwnerVal) * 100}%` }} />
                    </div>
                    <span className="text-xs font-mono w-20 text-right">{formatCurrency(o.value)}</span>
                    <span className="text-[10px] text-muted-foreground w-8 text-right">{o.count}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Deal aging */}
        <div className="data-card">
          <h3 className="text-sm font-medium mb-4">Deal Aging</h3>
          <div className="space-y-3">
            {dealAging.map(d => (
              <div key={d.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{d.label}</span>
                  <span className="font-mono">{d.count} deals · {formatCurrency(d.value)}</span>
                </div>
                <div className="h-4 bg-muted rounded overflow-hidden">
                  <div
                    className={`h-full rounded transition-all ${d.label.includes('90+') ? 'bg-destructive/60' : d.label.includes('61') ? 'bg-warning/60' : 'bg-primary/40'}`}
                    style={{ width: `${(d.count / maxAgingVal) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Dataset demand */}
        <div className="data-card">
          <h3 className="text-sm font-medium mb-4">Dataset Demand</h3>
          {pipelineByDataset.length === 0 ? (
            <p className="text-xs text-muted-foreground">No dataset-linked opportunities.</p>
          ) : (
            <div className="space-y-2">
              {pipelineByDataset.slice(0, 8).map(d => (
                <button key={d.name} onClick={() => onDrill('dataset', d.id)} className="w-full group">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-28 truncate text-left group-hover:text-foreground">{d.name}</span>
                    <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
                      <div className="h-full bg-accent/40 group-hover:bg-accent/60 rounded transition-all" style={{ width: `${(d.value / maxDsVal) * 100}%` }} />
                    </div>
                    <span className="text-[10px] font-mono w-16 text-right">{formatCurrency(d.value)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Forecast confidence */}
        <div className="data-card">
          <h3 className="text-sm font-medium mb-4">Forecast Confidence</h3>
          {totalConfidence === 0 ? (
            <p className="text-xs text-muted-foreground">No open pipeline.</p>
          ) : (
            <div className="space-y-4">
              {[
                { label: 'High (70%+)', data: forecastConfidence.high, color: 'bg-success/60' },
                { label: 'Medium (40-69%)', data: forecastConfidence.medium, color: 'bg-warning/60' },
                { label: 'Low (<40%)', data: forecastConfidence.low, color: 'bg-destructive/60' },
              ].map(b => (
                <div key={b.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{b.label}</span>
                    <span className="font-mono">{formatCurrency(b.data.value)} · {b.data.count}</span>
                  </div>
                  <div className="h-4 bg-muted rounded overflow-hidden">
                    <div className={`h-full ${b.color} rounded`} style={{ width: `${(b.data.value / totalConfidence) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stale deals alert */}
      {staleDeals.length > 0 && (
        <div className="data-card border-warning/30">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={14} className="text-warning" />
            <h3 className="text-sm font-medium">Stale Deals ({staleDeals.length})</h3>
            <span className="text-xs text-muted-foreground">No activity in 30+ days</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">Opportunity</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">Client</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">Stage</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium">Value</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium">Days Stale</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium">Days Open</th>
                </tr>
              </thead>
              <tbody>
                {staleDeals.slice(0, 10).map((d: any) => (
                  <tr key={d.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 px-2 font-medium">{d.name}</td>
                    <td className="py-2 px-2 text-muted-foreground">{d.clients?.name}</td>
                    <td className="py-2 px-2">{d.stage}</td>
                    <td className="py-2 px-2 text-right font-mono">{formatCurrency(Number(d.value))}</td>
                    <td className="py-2 px-2 text-right font-mono text-warning">{d.daysStale}d</td>
                    <td className="py-2 px-2 text-right font-mono text-muted-foreground">{d.daysOpen}d</td>
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
