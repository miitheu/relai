import { useMemo } from 'react';
import { useOpportunities, useRenewals, useProfiles, useActivities, useClients, useDatasets, useContracts, useAllDeliveries } from './useCrmData';
import { getTrialStatus } from '@/lib/trialUtils';

/** For Closed Won deals, use actual_value if available, otherwise fall back to value */
export function getClosedValue(o: any): number {
  if (o.stage === 'Closed Won' && o.actual_value != null) return Number(o.actual_value);
  return Number(o.value);
}

export interface RollupFilters {
  owner?: string;
  stage?: string;
  dataset?: string;
  clientType?: string;
  
  closeDateFrom?: string;
  closeDateTo?: string;
  valueMin?: number;
  valueMax?: number;
  probMin?: number;
  probMax?: number;
  createdFrom?: string;
  createdTo?: string;
  openOnly?: boolean;
  closedOnly?: boolean;
  renewalOnly?: boolean;
  quickFilter?: string;
}

function daysBetween(a: string | Date, b: string | Date) {
  return Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

function getQuarterRange() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const start = new Date(now.getFullYear(), q * 3, 1);
  const end = new Date(now.getFullYear(), q * 3 + 3, 0);
  return { start, end };
}

export function useSalesRollup(filters: RollupFilters) {
  const { data: allOpps = [], isLoading: loadingOpps } = useOpportunities();
  const { data: renewals = [], isLoading: loadingRenewals } = useRenewals();
  const { data: profiles = [], isLoading: loadingProfiles } = useProfiles();
  const { data: activities = [], isLoading: loadingActivities } = useActivities();
  const { data: clients = [], isLoading: loadingClients } = useClients();
  const { data: datasets = [], isLoading: loadingDatasets } = useDatasets();
  const { data: contracts = [], isLoading: loadingContracts } = useContracts();
  const { data: allDeliveries = [], isLoading: loadingDeliveries } = useAllDeliveries();

  const isLoading = loadingOpps || loadingRenewals || loadingProfiles || loadingActivities || loadingClients || loadingDatasets || loadingContracts || loadingDeliveries;

  // Build client lookup
  const clientMap = useMemo(() => {
    const m = new Map<string, any>();
    clients.forEach((c: any) => m.set(c.id, c));
    return m;
  }, [clients]);

  // Filter opportunities
  const filteredOpps = useMemo(() => {
    let opps = [...allOpps];
    const f = filters;
    const now = new Date();
    const qRange = getQuarterRange();

    if (f.owner) opps = opps.filter((o: any) => o.owner_id === f.owner);
    if (f.stage) opps = opps.filter((o: any) => o.stage === f.stage);
    if (f.dataset) opps = opps.filter((o: any) => o.dataset_id === f.dataset);
    if (f.clientType) {
      opps = opps.filter((o: any) => {
        const c = clientMap.get(o.client_id);
        return c?.client_type === f.clientType;
      });
    }
    if (f.closeDateFrom) opps = opps.filter((o: any) => o.expected_close && o.expected_close >= f.closeDateFrom!);
    if (f.closeDateTo) opps = opps.filter((o: any) => o.expected_close && o.expected_close <= f.closeDateTo!);
    if (f.valueMin != null) opps = opps.filter((o: any) => Number(o.value) >= f.valueMin!);
    if (f.valueMax != null) opps = opps.filter((o: any) => Number(o.value) <= f.valueMax!);
    if (f.probMin != null) opps = opps.filter((o: any) => o.probability >= f.probMin!);
    if (f.probMax != null) opps = opps.filter((o: any) => o.probability <= f.probMax!);
    if (f.createdFrom) opps = opps.filter((o: any) => o.created_at >= f.createdFrom!);
    if (f.createdTo) opps = opps.filter((o: any) => o.created_at <= f.createdTo!);
    if (f.openOnly) opps = opps.filter((o: any) => !['Closed Won', 'Closed Lost'].includes(o.stage));
    if (f.closedOnly) opps = opps.filter((o: any) => ['Closed Won', 'Closed Lost'].includes(o.stage));

    // Quick filters
    if (f.quickFilter === 'closing-this-month') {
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      opps = opps.filter((o: any) => o.expected_close && o.expected_close >= monthStart && o.expected_close <= monthEnd && !['Closed Won', 'Closed Lost'].includes(o.stage));
    }
    if (f.quickFilter === 'high-probability') {
      opps = opps.filter((o: any) => o.probability >= 70 && !['Closed Won', 'Closed Lost'].includes(o.stage));
    }
    if (f.quickFilter === 'stale-deals') {
      opps = opps.filter((o: any) => {
        if (['Closed Won', 'Closed Lost'].includes(o.stage)) return false;
        return daysBetween(o.updated_at || o.created_at, now) > 30;
      });
    }
    if (f.quickFilter === 'large-opps') {
      opps = opps.filter((o: any) => Number(o.value) >= 100000 && !['Closed Won', 'Closed Lost'].includes(o.stage));
    }
    if (f.quickFilter === 'closed-won-quarter') {
      opps = opps.filter((o: any) => o.stage === 'Closed Won' && o.updated_at >= qRange.start.toISOString() && o.updated_at <= qRange.end.toISOString());
    }

    return opps;
  }, [allOpps, filters, clientMap]);

  // KPIs
  const kpis = useMemo(() => {
    const now = new Date();
    const qRange = getQuarterRange();
    const open = filteredOpps.filter((o: any) => !['Closed Won', 'Closed Lost'].includes(o.stage));
    // Win rate = closed won / all opps (assuming all were open at start of year)
    const allClosedWon = allOpps.filter((o: any) => o.stage === 'Closed Won');
    const winRateDenominator = allOpps.length;

    const closingThisQ = open.filter((o: any) => {
      if (!o.expected_close) return false;
      const d = new Date(o.expected_close);
      return d >= qRange.start && d <= qRange.end;
    });

    const wonCycleDays = allClosedWon
      .filter((o: any) => o.updated_at && o.created_at)
      .map((o: any) => daysBetween(o.created_at, o.updated_at))
      .filter(d => d > 0);

    const renewalsDue90 = renewals.filter((r: any) => {
      const days = daysBetween(now, r.renewal_date);
      return days >= 0 && days <= 90 && !['Renewed', 'Lost'].includes(r.status);
    });

    return {
      totalPipelineValue: open.reduce((s: number, o: any) => s + Number(o.value), 0),
      weightedPipeline: open.reduce((s: number, o: any) => s + Number(o.value) * (o.probability / 100), 0),
      openCount: open.length,
      closingThisQCount: closingThisQ.length,
      closingThisQValue: closingThisQ.reduce((s: number, o: any) => s + Number(o.value), 0),
      avgDealSize: open.length > 0 ? open.reduce((s: number, o: any) => s + Number(o.value), 0) / open.length : 0,
      winRate: winRateDenominator > 0 ? (allClosedWon.length / winRateDenominator) * 100 : 0,
      avgCycleLength: wonCycleDays.length > 0 ? Math.round(wonCycleDays.reduce((a, b) => a + b, 0) / wonCycleDays.length) : 0,
      renewalsDue90: renewalsDue90.length,
      renewalsDue90Value: renewalsDue90.reduce((s: number, r: any) => s + Number(r.value), 0),
    };
  }, [filteredOpps, allOpps, renewals]);

  const trialKPIs = useMemo(() => {
    const trials = allDeliveries.filter((d: any) => d.delivery_type?.toLowerCase() === 'trial');
    const enriched = trials.map((t: any) => ({
      ...t,
      trialStatus: getTrialStatus(t.status, t.trial_start_date, t.trial_end_date, t.opportunities?.stage)
    }));
    
    // Check owner filter if present
    const filtered = filters.owner ? enriched.filter(t => t.owner_id === filters.owner) : enriched;
    
    const active = filtered.filter(t => t.trialStatus === 'active' || t.trialStatus === 'ending_soon');
    const converted = filtered.filter(t => t.trialStatus === 'converted');
    const conversionRate = filtered.length ? Math.round((converted.length / filtered.length) * 100) : 0;
    
    const convertedRev = converted.reduce((sum, t) => {
      if (t.opportunity_id) {
        const opp = allOpps.find((o: any) => o.id === t.opportunity_id);
        if (opp) return sum + Number(opp.value);
      }
      return sum;
    }, 0);

    return {
      activeCount: active.length,
      convertedCount: converted.length,
      conversionRate,
      totalCount: filtered.length,
      convertedRevenue: convertedRev
    };
  }, [allDeliveries, allOpps, filters]);

  // Stage distribution
  const stageDistribution = useMemo(() => {
    const open = filteredOpps.filter((o: any) => !['Closed Won', 'Closed Lost'].includes(o.stage));
    const map = new Map<string, { count: number; value: number }>();
    open.forEach((o: any) => {
      const cur = map.get(o.stage) || { count: 0, value: 0 };
      map.set(o.stage, { count: cur.count + 1, value: cur.value + Number(o.value) });
    });
    return Array.from(map.entries()).map(([stage, d]) => ({ stage, ...d }));
  }, [filteredOpps]);

  // Pipeline by owner
  const pipelineByOwner = useMemo(() => {
    const open = filteredOpps.filter((o: any) => !['Closed Won', 'Closed Lost'].includes(o.stage));
    const map = new Map<string, { name: string; count: number; value: number; weighted: number }>();
    open.forEach((o: any) => {
      const ownerId = o.owner_id || 'unassigned';
      const p = profiles.find((p: any) => p.user_id === ownerId);
      const cur = map.get(ownerId) || { name: p?.full_name || 'Unassigned', count: 0, value: 0, weighted: 0 };
      map.set(ownerId, {
        ...cur,
        count: cur.count + 1,
        value: cur.value + Number(o.value),
        weighted: cur.weighted + Number(o.value) * (o.probability / 100),
      });
    });
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [filteredOpps, profiles]);

  // Forecast by quarter
  const forecastByMonth = useMemo(() => {
    const open = filteredOpps.filter((o: any) => !['Closed Won', 'Closed Lost'].includes(o.stage) && o.expected_close);
    const map = new Map<string, { month: string; value: number; weighted: number }>();
    open.forEach((o: any) => {
      const d = new Date(o.expected_close);
      const q = Math.floor(d.getMonth() / 3) + 1;
      const key = `${d.getFullYear()} Q${q}`;
      const cur = map.get(key) || { month: key, value: 0, weighted: 0 };
      map.set(key, { ...cur, value: cur.value + Number(o.value), weighted: cur.weighted + Number(o.value) * (o.probability / 100) });
    });
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredOpps]);

  // Deal aging
  const dealAging = useMemo(() => {
    const now = new Date();
    const open = filteredOpps.filter((o: any) => !['Closed Won', 'Closed Lost'].includes(o.stage));
    const buckets = [
      { label: '0–30 days', min: 0, max: 30, count: 0, value: 0 },
      { label: '31–60 days', min: 31, max: 60, count: 0, value: 0 },
      { label: '61–90 days', min: 61, max: 90, count: 0, value: 0 },
      { label: '90+ days', min: 91, max: Infinity, count: 0, value: 0 },
    ];
    open.forEach((o: any) => {
      const age = daysBetween(o.created_at, now);
      const bucket = buckets.find(b => age >= b.min && age <= b.max);
      if (bucket) { bucket.count++; bucket.value += Number(o.value); }
    });
    return buckets;
  }, [filteredOpps]);

  // Pipeline by dataset
  const pipelineByDataset = useMemo(() => {
    const open = filteredOpps.filter((o: any) => !['Closed Won', 'Closed Lost'].includes(o.stage));
    const map = new Map<string, { id: string; name: string; count: number; value: number }>();
    open.forEach((o: any) => {
      const dsId = o.dataset_id || 'none';
      const ds = datasets.find((d: any) => d.id === dsId);
      const cur = map.get(dsId) || { id: dsId, name: ds?.name || 'No Dataset', count: 0, value: 0 };
      map.set(dsId, { ...cur, count: cur.count + 1, value: cur.value + Number(o.value) });
    });
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [filteredOpps, datasets]);

  // Renewals by month
  const renewalsByMonth = useMemo(() => {
    const now = new Date();
    const upcoming = renewals.filter((r: any) => {
      const d = new Date(r.renewal_date);
      return d >= now && !['Renewed', 'Lost'].includes(r.status);
    });
    const map = new Map<string, { month: string; count: number; value: number }>();
    upcoming.forEach((r: any) => {
      const m = r.renewal_date.substring(0, 7);
      const cur = map.get(m) || { month: m, count: 0, value: 0 };
      map.set(m, { ...cur, count: cur.count + 1, value: cur.value + Number(r.value) });
    });
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [renewals]);

  // Rep performance
  const repPerformance = useMemo(() => {
    const now = new Date();
    const qRange = getQuarterRange();
    const reps = new Map<string, any>();

    filteredOpps.forEach((o: any) => {
      const ownerId = o.owner_id || 'unassigned';
      const p = profiles.find((p: any) => p.user_id === ownerId);
      if (!reps.has(ownerId)) {
        reps.set(ownerId, {
          id: ownerId,
          name: p?.full_name || 'Unassigned',
          openValue: 0, weightedValue: 0, oppCount: 0, avgDealSize: 0,
          wonThisQ: 0, wonValueQ: 0, totalClosed: 0, staleCount: 0,
        });
      }
      const r = reps.get(ownerId);
      if (!['Closed Won', 'Closed Lost'].includes(o.stage)) {
        r.openValue += Number(o.value);
        r.weightedValue += Number(o.value) * (o.probability / 100);
        r.oppCount++;
        if (daysBetween(o.updated_at || o.created_at, now) > 30) r.staleCount++;
      }
      if (o.stage === 'Closed Won') {
        r.totalClosed++;
        if (o.updated_at >= qRange.start.toISOString()) { r.wonThisQ++; r.wonValueQ += getClosedValue(o); }
      }
      if (o.stage === 'Closed Lost') r.totalClosed++;
    });

    return Array.from(reps.values()).map(r => ({
      ...r,
      avgDealSize: r.oppCount > 0 ? r.openValue / r.oppCount : 0,
      winRate: r.totalClosed > 0 ? ((r.wonThisQ + (r.totalClosed - r.wonThisQ > 0 ? 0 : 0)) / Math.max(r.totalClosed, 1)) * 100 : 0,
    })).sort((a, b) => b.openValue - a.openValue);
  }, [filteredOpps, profiles]);

  // Stale deals
  const staleDeals = useMemo(() => {
    const now = new Date();
    return filteredOpps.filter((o: any) => {
      if (['Closed Won', 'Closed Lost'].includes(o.stage)) return false;
      return daysBetween(o.updated_at || o.created_at, now) > 30;
    }).map((o: any) => ({
      ...o,
      daysStale: daysBetween(o.updated_at || o.created_at, now),
      daysOpen: daysBetween(o.created_at, now),
    })).sort((a: any, b: any) => b.daysStale - a.daysStale);
  }, [filteredOpps]);

  // Forecast confidence
  const forecastConfidence = useMemo(() => {
    const open = filteredOpps.filter((o: any) => !['Closed Won', 'Closed Lost'].includes(o.stage));
    const high = open.filter((o: any) => o.probability >= 70);
    const medium = open.filter((o: any) => o.probability >= 40 && o.probability < 70);
    const low = open.filter((o: any) => o.probability < 40);
    return {
      high: { count: high.length, value: high.reduce((s: number, o: any) => s + Number(o.value), 0) },
      medium: { count: medium.length, value: medium.reduce((s: number, o: any) => s + Number(o.value), 0) },
      low: { count: low.length, value: low.reduce((s: number, o: any) => s + Number(o.value), 0) },
    };
  }, [filteredOpps]);

  return {
    isLoading,
    filteredOpps,
    kpis,
    trialKPIs,
    stageDistribution,
    pipelineByOwner,
    forecastByMonth,
    dealAging,
    pipelineByDataset,
    renewalsByMonth,
    repPerformance,
    staleDeals,
    forecastConfidence,
    renewals,
    profiles,
    clients,
    datasets,
    contracts,
  };
}
