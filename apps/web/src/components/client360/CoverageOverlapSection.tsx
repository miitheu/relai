import { useMemo, useState } from 'react';
import { type FundExposureRow } from '@/hooks/useFundExposure';
import { type RelevantDataset } from '@/hooks/useFundIntelligence';
import { Crosshair, ChevronDown, ChevronRight, ArrowUpDown } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface OverlapRow {
  ticker: string;
  issuerName: string;
  totalWeightPct: number;
  directWeightPct: number;
  impliedEtfWeightPct: number;
  matchingProducts: string[];
}

interface Props {
  exposure: FundExposureRow[];
  relevantDatasets: RelevantDataset[];
}

type SortKey = 'ticker' | 'totalWeightPct' | 'products';

export default function CoverageOverlapSection({ exposure, relevantDatasets }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('totalWeightPct');
  const [sortAsc, setSortAsc] = useState(false);

  const overlapRows = useMemo(() => {
    // Build ticker → product names map from supporting_holdings
    const tickerToProducts = new Map<string, Set<string>>();
    for (const ds of relevantDatasets) {
      if (!ds.supporting_holdings?.length) continue;
      for (const h of ds.supporting_holdings) {
        const norm = h.toUpperCase().trim();
        if (!tickerToProducts.has(norm)) tickerToProducts.set(norm, new Set());
        tickerToProducts.get(norm)!.add(ds.dataset_name);
      }
    }

    if (tickerToProducts.size === 0) return [];

    // Match against exposure rows by ticker
    const rows: OverlapRow[] = [];
    const seen = new Set<string>();

    for (const e of exposure) {
      const ticker = e.security?.ticker?.toUpperCase().trim();
      if (!ticker || seen.has(ticker)) continue;
      const products = tickerToProducts.get(ticker);
      if (!products) continue;
      seen.add(ticker);
      rows.push({
        ticker,
        issuerName: e.security?.issuer_name || '—',
        totalWeightPct: Number(e.total_weight_pct) || 0,
        directWeightPct: Number(e.direct_weight_pct) || 0,
        impliedEtfWeightPct: Number(e.implied_etf_weight_pct) || 0,
        matchingProducts: Array.from(products),
      });
    }

    // Also include supporting holdings NOT found in exposure (weight = 0)
    for (const [ticker, products] of tickerToProducts) {
      if (!seen.has(ticker)) {
        rows.push({
          ticker,
          issuerName: '—',
          totalWeightPct: 0,
          directWeightPct: 0,
          impliedEtfWeightPct: 0,
          matchingProducts: Array.from(products),
        });
      }
    }

    return rows;
  }, [exposure, relevantDatasets]);

  const sorted = useMemo(() => {
    const copy = [...overlapRows];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'ticker') cmp = a.ticker.localeCompare(b.ticker);
      else if (sortKey === 'totalWeightPct') cmp = a.totalWeightPct - b.totalWeightPct;
      else cmp = a.matchingProducts.length - b.matchingProducts.length;
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [overlapRows, sortKey, sortAsc]);

  if (overlapRows.length === 0) return null;

  const totalOverlapWeight = overlapRows.reduce((s, r) => s + r.totalWeightPct, 0);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  return (
    <section className="data-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Crosshair size={14} className="text-success" />
        <h3 className="text-sm font-semibold">Coverage Overlap</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">
          {overlapRows.length} tickers · {totalOverlapWeight.toFixed(1)}% combined weight
        </span>
      </button>

      {expanded && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th
                  className="text-left py-1.5 pr-3 cursor-pointer select-none"
                  onClick={() => handleSort('ticker')}
                >
                  <span className="flex items-center gap-1">
                    Ticker <ArrowUpDown size={10} />
                  </span>
                </th>
                <th className="text-left py-1.5 pr-3">Issuer</th>
                <th className="text-right py-1.5 pr-3">Direct %</th>
                <th className="text-right py-1.5 pr-3">ETF %</th>
                <th
                  className="text-right py-1.5 pr-3 cursor-pointer select-none"
                  onClick={() => handleSort('totalWeightPct')}
                >
                  <span className="flex items-center gap-1 justify-end">
                    Total % <ArrowUpDown size={10} />
                  </span>
                </th>
                <th
                  className="text-left py-1.5 cursor-pointer select-none"
                  onClick={() => handleSort('products')}
                >
                  <span className="flex items-center gap-1">
                    Matching Products <ArrowUpDown size={10} />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              <TooltipProvider>
                {sorted.map((row) => (
                  <tr key={row.ticker} className="border-b border-border/50">
                    <td className="py-1.5 pr-3 font-mono font-semibold text-foreground">
                      {row.ticker}
                    </td>
                    <td className="py-1.5 pr-3 text-muted-foreground max-w-[180px] truncate">
                      {row.issuerName}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono">
                      {row.directWeightPct > 0 ? `${row.directWeightPct.toFixed(2)}%` : '—'}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono text-info">
                      {row.impliedEtfWeightPct > 0 ? `${row.impliedEtfWeightPct.toFixed(2)}%` : '—'}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono font-semibold">
                      {row.totalWeightPct > 0 ? `${row.totalWeightPct.toFixed(2)}%` : '—'}
                    </td>
                    <td className="py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {row.matchingProducts.map((p) => (
                          <Tooltip key={p}>
                            <TooltipTrigger asChild>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-success/10 text-success font-medium truncate max-w-[120px]">
                                {p}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p className="text-xs">{p}</p>
                            </TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </TooltipProvider>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
