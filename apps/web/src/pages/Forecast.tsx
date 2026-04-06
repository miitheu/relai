import { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import LoadingState from '@/components/LoadingState';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '@/data/mockData';
import { useCurrencyRerender } from '@/hooks/useCurrencyRerender';
import { useOpportunities } from '@/hooks/useOpportunities';
import { useClients } from '@/hooks/useClients';
import { useForecasts, useForecastCategories, useUpdateForecast, useCreateForecast } from '@/hooks/useForecasts';
import { LineChart as LineChartIcon, TrendingUp, Target, BarChart3, CheckCircle2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { startOfQuarter, endOfQuarter, addQuarters, startOfYear, endOfYear, format, parseISO, isWithinInterval } from 'date-fns';

// ---------- Forecast category defaults (used when DB categories aren't set up yet) ----------
const DEFAULT_CATEGORIES = [
  { id: 'commit', name: 'Commit', color: '#22c55e', sort_order: 1 },
  { id: 'best_case', name: 'Best Case', color: '#3b82f6', sort_order: 2 },
  { id: 'pipeline', name: 'Pipeline', color: '#f97316', sort_order: 3 },
  { id: 'omitted', name: 'Omitted', color: '#9ca3af', sort_order: 4 },
] as const;

type PeriodPreset = 'current_quarter' | 'next_quarter' | 'current_year';

function getPeriodRange(preset: PeriodPreset): { start: Date; end: Date; label: string } {
  const now = new Date();
  switch (preset) {
    case 'current_quarter': {
      const s = startOfQuarter(now);
      const e = endOfQuarter(now);
      return { start: s, end: e, label: `Q${Math.ceil((s.getMonth() + 1) / 3)} ${s.getFullYear()}` };
    }
    case 'next_quarter': {
      const s = startOfQuarter(addQuarters(now, 1));
      const e = endOfQuarter(addQuarters(now, 1));
      return { start: s, end: e, label: `Q${Math.ceil((s.getMonth() + 1) / 3)} ${s.getFullYear()}` };
    }
    case 'current_year': {
      return { start: startOfYear(now), end: endOfYear(now), label: `FY ${now.getFullYear()}` };
    }
  }
}

// Map opportunity stage to a default forecast category
function stageToDefaultCategory(stage: string): string {
  if (stage === 'Closed Won') return 'commit';
  if (['Contract Sent', 'Commercial Discussion'].includes(stage)) return 'best_case';
  if (['Closed Lost', 'Inactive'].includes(stage)) return 'omitted';
  return 'pipeline';
}

export default function Forecast() {
  useCurrencyRerender();
  const { user, role } = useAuth();
  const navigate = useNavigate();

  const [period, setPeriod] = useState<PeriodPreset>('current_quarter');
  const periodRange = getPeriodRange(period);
  const periodStart = format(periodRange.start, 'yyyy-MM-dd');
  const periodEnd = format(periodRange.end, 'yyyy-MM-dd');

  const { data: opportunities = [], isLoading: loadingOpps } = useOpportunities();
  const { data: clients = [] } = useClients();
  const { data: forecasts = [], isLoading: loadingForecasts } = useForecasts({ period_start: periodStart, period_end: periodEnd });
  const { data: dbCategories = [] } = useForecastCategories();
  const createForecast = useCreateForecast();
  const updateForecast = useUpdateForecast();

  const categories = dbCategories.length > 0 ? dbCategories : DEFAULT_CATEGORIES;

  // Build a map of opportunity_id -> forecast for the current period
  const forecastMap = useMemo(() => {
    const m = new Map<string, { id: string; category_id: string }>();
    forecasts.forEach((f: any) => m.set(f.opportunity_id, { id: f.id, category_id: f.category_id }));
    return m;
  }, [forecasts]);

  // Filter opportunities to those with expected close in the selected period
  const periodOpps = useMemo(() => {
    return opportunities.filter((o: any) => {
      if (!o.expected_close) return false;
      try {
        const closeDate = parseISO(o.expected_close);
        return isWithinInterval(closeDate, { start: periodRange.start, end: periodRange.end });
      } catch {
        return false;
      }
    });
  }, [opportunities, periodRange]);

  // Client lookup
  const clientMap = useMemo(() => {
    const m = new Map<string, string>();
    clients.forEach((c: any) => m.set(c.id, c.name));
    return m;
  }, [clients]);

  // Assign each opp a category: use forecast if exists, else derive from stage
  const oppWithCategory = useMemo(() => {
    return periodOpps.map((o: any) => {
      const fc = forecastMap.get(o.id);
      const catId = fc?.category_id || stageToDefaultCategory(o.stage);
      const cat = categories.find((c: any) => c.id === catId) || DEFAULT_CATEGORIES[2]; // default pipeline
      return {
        ...o,
        forecastId: fc?.id,
        categoryId: catId,
        categoryName: cat.name,
        categoryColor: cat.color,
        clientName: o.clients?.name || clientMap.get(o.client_id) || '—',
      };
    });
  }, [periodOpps, forecastMap, categories, clientMap]);

  // KPI calculations
  const kpis = useMemo(() => {
    const commit = oppWithCategory.filter(o => o.categoryName === 'Commit').reduce((s, o) => s + Number(o.value), 0);
    const bestCase = oppWithCategory.filter(o => o.categoryName === 'Best Case').reduce((s, o) => s + Number(o.value), 0);
    const pipeline = oppWithCategory.filter(o => o.categoryName === 'Pipeline').reduce((s, o) => s + Number(o.value), 0);
    const closedWon = opportunities.filter((o: any) => {
      if (o.stage !== 'Closed Won' || !o.expected_close) return false;
      try {
        return isWithinInterval(parseISO(o.expected_close), { start: periodRange.start, end: periodRange.end });
      } catch { return false; }
    }).reduce((s: number, o: any) => s + Number(o.value), 0);
    return { commit, bestCase, pipeline, closedWon };
  }, [oppWithCategory, opportunities, periodRange]);

  // Chart data: group by month, stack by category
  const chartData = useMemo(() => {
    const monthMap = new Map<string, { month: string; Commit: number; 'Best Case': number; Pipeline: number; Omitted: number }>();
    oppWithCategory.forEach(o => {
      if (!o.expected_close) return;
      const monthKey = format(parseISO(o.expected_close), 'MMM yyyy');
      if (!monthMap.has(monthKey)) monthMap.set(monthKey, { month: monthKey, Commit: 0, 'Best Case': 0, Pipeline: 0, Omitted: 0 });
      const entry = monthMap.get(monthKey)!;
      const catName = o.categoryName as keyof typeof entry;
      if (catName in entry && catName !== 'month') {
        (entry as any)[catName] += Number(o.value);
      }
    });
    return Array.from(monthMap.values()).sort((a, b) => {
      const da = new Date(a.month);
      const db = new Date(b.month);
      return da.getTime() - db.getTime();
    });
  }, [oppWithCategory]);

  // Handle category change for an opportunity
  const handleCategoryChange = async (oppId: string, newCategoryId: string) => {
    const existing = forecastMap.get(oppId);
    if (existing) {
      await updateForecast.mutateAsync({ id: existing.id, category_id: newCategoryId });
    } else {
      const opp = periodOpps.find((o: any) => o.id === oppId);
      await createForecast.mutateAsync({
        opportunity_id: oppId,
        category_id: newCategoryId,
        period_start: periodStart,
        period_end: periodEnd,
        amount: Number(opp?.value || 0),
      });
    }
  };

  const isLoading = loadingOpps || loadingForecasts;

  if (isLoading) return <AppLayout><LoadingState /></AppLayout>;

  const kpiCards = [
    { icon: CheckCircle2, label: 'Commit', value: formatCurrency(kpis.commit), accent: 'text-success', color: '#22c55e' },
    { icon: Target, label: 'Best Case', value: formatCurrency(kpis.bestCase), accent: 'text-info', color: '#3b82f6' },
    { icon: BarChart3, label: 'Pipeline', value: formatCurrency(kpis.pipeline), accent: 'text-warning', color: '#f97316' },
    { icon: TrendingUp, label: 'Closed Won', value: formatCurrency(kpis.closedWon), accent: 'text-primary', color: '#8b5cf6' },
  ];

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Forecast</h1>
          <p className="text-sm text-muted-foreground">
            {periodRange.label} · {oppWithCategory.length} opportunities
          </p>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
          {([
            { key: 'current_quarter', label: 'This Quarter' },
            { key: 'next_quarter', label: 'Next Quarter' },
            { key: 'current_year', label: 'This Year' },
          ] as const).map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${period === p.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {kpiCards.map((c, i) => (
          <div key={i} className="data-card py-3 px-4">
            <div className="flex items-center gap-2 mb-1.5">
              <c.icon size={13} className={c.accent} />
              <span className="metric-label">{c.label}</span>
            </div>
            <div className="metric-value">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Stacked Bar Chart */}
      {chartData.length > 0 && (
        <div className="data-card mb-6">
          <h3 className="text-sm font-medium mb-4">Forecast vs Actual by Month</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v: number) => {
                  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
                  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
                  return String(v);
                }} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number, name: string) => [formatCurrency(value), name]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Commit" stackId="forecast" fill="#22c55e" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Best Case" stackId="forecast" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Pipeline" stackId="forecast" fill="#f97316" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Omitted" stackId="forecast" fill="#9ca3af" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Opportunity Table */}
      <div className="data-card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Opportunity</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Client</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Value</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Stage</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Forecast Category</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Close Date</th>
            </tr>
          </thead>
          <tbody>
            {oppWithCategory.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                  No opportunities with expected close dates in this period.
                </td>
              </tr>
            ) : (
              oppWithCategory.map(o => (
                <tr key={o.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <button onClick={() => navigate(`/pipeline/${o.id}`)} className="font-medium text-left hover:text-primary transition-colors">
                      {o.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{o.clientName}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(Number(o.value))}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs">{o.stage}</span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={o.categoryId}
                      onChange={(e) => handleCategoryChange(o.id, e.target.value)}
                      className="text-xs rounded-md border border-border bg-card px-2 py-1 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
                      style={{ color: o.categoryColor }}
                    >
                      {categories.map((c: any) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{o.expected_close || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}
