import AppLayout from '@/components/AppLayout';
import { useClients, useOpportunities, useRenewals, useAllDeliveries } from '@/hooks/useCrmData';
import { formatCurrency, ICEBOX_STAGES, stageOrder, getStageColor } from '@/data/mockData';
import { useCurrencyRerender } from '@/hooks/useCurrencyRerender';
import { TrendingUp, RefreshCw, Clock, CheckCircle2, Brain, AlertTriangle, ArrowRight, Sparkles, ChevronDown, BarChart3, DollarSign, Target, Flame, Megaphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState, useMemo, useEffect } from 'react';
import LoadingState from '@/components/LoadingState';
import { useQuickCreate } from '@/contexts/QuickCreateContext';
import { getTrialStatus, getDaysRemaining } from '@/lib/trialUtils';
import ActionCenterSummary from '@/components/ActionCenterSummary';
import ActionCenterPanel from '@/components/ActionCenterPanel';
import { useAllIntelligenceRuns } from '@/hooks/useFundIntelligence';
import { useUserCampaignTargets } from '@/hooks/useCampaigns';
import DailyBrief from '@/components/DailyBrief';
import { supabase } from '@/integrations/supabase/client';
import { useDiscoverySuggestions } from '@/hooks/useAccountDiscovery';
import { useAutoGmailSync } from '@/hooks/useGmailIntegration';

export default function Dashboard() {
  useCurrencyRerender();
  useAutoGmailSync(); // Triggers daily Gmail sync if connected and overdue
  const navigate = useNavigate();
  const { open: openOpp } = useQuickCreate();
  const { data: clients = [], isLoading: loadingClients } = useClients();
  const { data: opportunities = [], isLoading: loadingOpps } = useOpportunities();
  const { data: renewals = [], isLoading: loadingRenewals } = useRenewals();
  const { data: allDeliveries = [], isLoading: loadingDeliveries } = useAllDeliveries();
  const { data: intelligenceRuns = [] } = useAllIntelligenceRuns();
  const { data: discoverySuggestions = [] } = useDiscoverySuggestions({ status: 'new' });
  const { data: campaignOutreach = [] } = useUserCampaignTargets();
  const [panelOpen, setPanelOpen] = useState(false);
  const [outreachOpen, setOutreachOpen] = useState(true);

  // Intelligence data for alerts and priority queue
  const [fitScores, setFitScores] = useState<Record<string, { topScore: number; topProduct: string | null }>>({});
  const [lastActivityMap, setLastActivityMap] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const [fitsRes, activitiesRes] = await Promise.all([
        supabase
          .from('product_fit_analyses' as any)
          .select('client_id, fit_score, datasets(name)')
          .eq('is_latest', true)
          .order('fit_score', { ascending: false }),
        supabase
          .from('activities')
          .select('client_id, created_at')
          .order('created_at', { ascending: false }),
      ]);

      const fMap: Record<string, { topScore: number; topProduct: string | null }> = {};
      (fitsRes.data || []).forEach((f: any) => {
        if (!fMap[f.client_id]) fMap[f.client_id] = { topScore: f.fit_score || 0, topProduct: f.datasets?.name || null };
      });
      setFitScores(fMap);

      const aMap: Record<string, string> = {};
      (activitiesRes.data || []).forEach((a: any) => {
        if (a.client_id && !aMap[a.client_id]) aMap[a.client_id] = a.created_at;
      });
      setLastActivityMap(aMap);
    })();
  }, []);

  const isLoading = loadingClients || loadingOpps || loadingRenewals || loadingDeliveries;

  const currentYear = new Date().getFullYear();
  const isCurrentYear = (dateStr: string | null | undefined) => dateStr ? new Date(dateStr).getFullYear() === currentYear : false;

  const activeOpps = opportunities.filter((o: any) => !['Closed Won', 'Closed Lost'].includes(o.stage) && !(ICEBOX_STAGES as readonly string[]).includes(o.stage));
  const currentYearActiveOpps = activeOpps.filter((o: any) => isCurrentYear(o.expected_close) || isCurrentYear(o.created_at));
  const totalPipeline = currentYearActiveOpps.reduce((sum: number, o: any) => sum + Number(o.value) * (o.probability / 100), 0);
  const closedWon = opportunities.filter((o: any) => o.stage === 'Closed Won' && isCurrentYear(o.actual_close_date || o.expected_close || o.updated_at));
  const closedWonValue = closedWon.reduce((sum: number, o: any) => sum + (o.actual_value != null ? Number(o.actual_value) : Number(o.value)), 0);

  const upcomingRenewals = renewals.filter((r: any) => ['Upcoming', 'Negotiation'].includes(r.status) && isCurrentYear(r.renewal_date));
  const renewalValue = upcomingRenewals.reduce((sum: number, r: any) => sum + Number(r.value), 0);

  const urgentRenewals = renewals.filter((r: any) => {
    const days = Math.ceil((new Date(r.renewal_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days <= 30 && days > 0 && ['Upcoming', 'Negotiation'].includes(r.status);
  });

  const trials = allDeliveries.filter((d: any) => d.delivery_type?.toLowerCase() === 'trial' && (isCurrentYear(d.trial_end_date) || isCurrentYear(d.trial_start_date)));
  const enrichedTrials = trials.map((t: any) => ({
    ...t,
    trialStatus: getTrialStatus(t.status, t.trial_start_date, t.trial_end_date, t.opportunities?.stage),
    daysRemaining: getDaysRemaining(t.trial_end_date)
  }));
  const endingSoonTrials = enrichedTrials.filter((t: any) => t.trialStatus === 'ending_soon');

  // Intelligence coverage stat
  const clientsWithIntel = new Set(intelligenceRuns.map((r: any) => r.client_id)).size;
  const intelCoverage = clients.length > 0 ? Math.round((clientsWithIntel / clients.length) * 100) : 0;

  // Top Deals — 3 most advanced active opportunities (furthest stage + highest value)
  const topDeals = useMemo(() => {
    const activeStageIndices = stageOrder.filter(s => !['Closed Won', 'Closed Lost'].includes(s));
    return [...activeOpps]
      .sort((a: any, b: any) => {
        const aIdx = activeStageIndices.indexOf(a.stage);
        const bIdx = activeStageIndices.indexOf(b.stage);
        if (bIdx !== aIdx) return bIdx - aIdx; // furthest stage first
        return Number(b.value) - Number(a.value); // then by value
      })
      .slice(0, 3);
  }, [activeOpps]);

  // Priority Queue — top accounts ranked by composite score
  const priorityQueue = useMemo(() => {
    return clients
      .map((c: any) => {
        const fit = fitScores[c.id];
        const fitScore = fit?.topScore || 0;
        const lastAct = lastActivityMap[c.id];
        const daysSinceActivity = lastAct ? Math.floor((Date.now() - new Date(lastAct).getTime()) / (1000 * 60 * 60 * 24)) : 999;
        const recencyScore = Math.max(0, 100 - daysSinceActivity * 2); // decays over ~50 days
        const compositeScore = fitScore * 0.6 + (100 - recencyScore) * 0.4; // higher = more urgent (high fit + stale = priority)

        let reason = '';
        if (fitScore >= 60 && daysSinceActivity > 30) reason = `High fit (${fitScore}) + inactive ${daysSinceActivity}d`;
        else if (fitScore >= 60) reason = `High fit score: ${fitScore} (${fit?.topProduct || 'product'})`;
        else if (daysSinceActivity > 30) reason = `No activity in ${daysSinceActivity} days`;
        else reason = `Fit: ${fitScore}, last active ${daysSinceActivity}d ago`;

        return { id: c.id, name: c.name, type: c.client_type, fitScore, daysSinceActivity, compositeScore, reason, topProduct: fit?.topProduct };
      })
      .filter(c => c.fitScore > 0 || c.daysSinceActivity < 999) // only those with some signal
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .slice(0, 10);
  }, [clients, fitScores, lastActivityMap]);

  // Pipeline snapshot: stage breakdown
  const pipelineByStage = useMemo(() => {
    const activeStages = stageOrder.filter(s => !['Closed Won', 'Closed Lost'].includes(s));
    return activeStages.map(stage => {
      const opps = currentYearActiveOpps.filter((o: any) => o.stage === stage);
      const value = opps.reduce((s: number, o: any) => s + Number(o.value), 0);
      return { stage, count: opps.length, value };
    }).filter(s => s.count > 0);
  }, [currentYearActiveOpps]);

  const totalUnweightedPipeline = currentYearActiveOpps.reduce((s: number, o: any) => s + Number(o.value), 0);
  const maxStageValue = Math.max(...pipelineByStage.map(s => s.value), 1);

  // Revenue snapshot: closed won by quarter
  const revenueByQuarter = useMemo(() => {
    const quarters = [
      { label: 'Q1', months: [0, 1, 2] },
      { label: 'Q2', months: [3, 4, 5] },
      { label: 'Q3', months: [6, 7, 8] },
      { label: 'Q4', months: [9, 10, 11] },
    ];
    return quarters.map(q => {
      const qOpps = closedWon.filter((o: any) => {
        const d = new Date(o.actual_close_date || o.expected_close || o.updated_at);
        return q.months.includes(d.getMonth());
      });
      return { ...q, value: qOpps.reduce((s: number, o: any) => s + (o.actual_value != null ? Number(o.actual_value) : Number(o.value)), 0), count: qOpps.length };
    });
  }, [closedWon]);

  const maxQuarterValue = Math.max(...revenueByQuarter.map(q => q.value), 1);
  const currentQuarterIdx = Math.floor(new Date().getMonth() / 3);

  // Forecast: weighted pipeline by close month (next 6 months)
  const forecastByMonth = useMemo(() => {
    const now = new Date();
    const months: { label: string; value: number; count: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const m = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const label = m.toLocaleDateString('en-US', { month: 'short' });
      const yr = m.getFullYear();
      const mo = m.getMonth();
      const opps = currentYearActiveOpps.filter((o: any) => {
        if (!o.expected_close) return false;
        const d = new Date(o.expected_close);
        return d.getFullYear() === yr && d.getMonth() === mo;
      });
      const weighted = opps.reduce((s: number, o: any) => s + Number(o.value) * (o.probability / 100), 0);
      months.push({ label, value: weighted, count: opps.length });
    }
    return months;
  }, [currentYearActiveOpps]);

  const maxForecastValue = Math.max(...forecastByMonth.map(m => m.value), 1);
  const totalForecast = forecastByMonth.reduce((s, m) => s + m.value, 0);

  const [priorityOpen, setPriorityOpen] = useState(false);
  const [suggestedOpen, setSuggestedOpen] = useState(false);

  if (isLoading) return <AppLayout><LoadingState /></AppLayout>;

  return (
    <AppLayout>
      {/* KPI strip — 4 cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <MetricCard icon={TrendingUp} label="Weighted Pipeline" value={formatCurrency(totalPipeline)} sub={`${currentYearActiveOpps.length} active deals`} accent="primary" onClick={() => navigate('/pipeline')} />
        <MetricCard icon={TrendingUp} label="Net New" value={formatCurrency(closedWonValue)} sub={`${closedWon.length} closed won`} accent="success" onClick={() => navigate('/pipeline')} />
        <MetricCard icon={RefreshCw} label="Upcoming Renewals" value={formatCurrency(renewalValue)} sub={`${upcomingRenewals.length} upcoming`} accent="warning" onClick={() => navigate('/renewals')} />
        <MetricCard icon={Brain} label="Intel Coverage" value={`${intelCoverage}%`} sub={`${clientsWithIntel} of ${clients.length} accounts`} accent="info" onClick={() => navigate('/clients')} />
      </div>

      {/* Daily Brief — auto-generates */}
      <DailyBrief autoGenerate />

      {/* Pipeline, Revenue & Forecast Snapshot */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* Pipeline by Stage */}
        <div className="data-card">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 size={14} className="text-primary" />
            <h3 className="text-sm font-medium">Pipeline by Stage</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">{formatCurrency(totalUnweightedPipeline)} total unweighted</p>
          {pipelineByStage.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No active deals</p>
          ) : (
            <div className="space-y-2">
              {pipelineByStage.map(s => (
                <div key={s.stage}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="text-muted-foreground truncate">{s.stage}</span>
                    <span className="font-mono font-medium shrink-0 ml-2">{formatCurrency(s.value)}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${(s.value / maxStageValue) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => navigate('/pipeline')} className="text-xs text-primary hover:underline mt-3 flex items-center gap-1">
            View pipeline <ArrowRight size={11} />
          </button>
        </div>

        {/* Revenue YTD by Quarter */}
        <div className="data-card">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign size={14} className="text-success" />
            <h3 className="text-sm font-medium">Revenue {currentYear}</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">{formatCurrency(closedWonValue)} closed won YTD</p>
          <div className="flex items-end gap-2 h-24">
            {revenueByQuarter.map((q, i) => (
              <div key={q.label} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col items-center justify-end h-16">
                  {q.value > 0 && (
                    <span className="text-[9px] font-mono text-muted-foreground mb-0.5">{formatCurrency(q.value)}</span>
                  )}
                  <div
                    className={`w-full rounded-t transition-all ${i <= currentQuarterIdx ? 'bg-success' : 'bg-muted'}`}
                    style={{ height: `${Math.max((q.value / maxQuarterValue) * 100, q.value > 0 ? 8 : 2)}%` }}
                  />
                </div>
                <span className={`text-[10px] ${i === currentQuarterIdx ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                  {q.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Forecast — weighted by close month */}
        <div className="data-card">
          <div className="flex items-center gap-2 mb-1">
            <Target size={14} className="text-info" />
            <h3 className="text-sm font-medium">Forecast</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">{formatCurrency(totalForecast)} weighted next 6 months</p>
          <div className="flex items-end gap-1.5 h-24">
            {forecastByMonth.map((m, i) => (
              <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col items-center justify-end h-16">
                  {m.value > 0 && (
                    <span className="text-[9px] font-mono text-muted-foreground mb-0.5">{formatCurrency(m.value)}</span>
                  )}
                  <div
                    className={`w-full rounded-t transition-all ${i === 0 ? 'bg-info' : 'bg-info/50'}`}
                    style={{ height: `${Math.max((m.value / maxForecastValue) * 100, m.value > 0 ? 8 : 2)}%` }}
                  />
                </div>
                <span className={`text-[10px] ${i === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                  {m.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Deals + Action Center */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* Top Deals — most advanced opportunities */}
        <div className="data-card col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Flame size={14} className="text-primary" />
            <h3 className="text-sm font-medium">Top Deals</h3>
            <span className="ml-auto text-xs text-muted-foreground">{activeOpps.length} active</span>
          </div>
          {topDeals.length === 0 ? (
            <div className="flex items-center gap-2 py-6 justify-center">
              <CheckCircle2 size={14} className="text-muted-foreground" />
              <p className="text-xs text-muted-foreground">No active deals in your pipeline</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topDeals.map((opp: any, i: number) => {
                const weighted = Number(opp.value) * (opp.probability / 100);
                const stageIdx = stageOrder.indexOf(opp.stage);
                const stageTotal = stageOrder.filter(s => !['Closed Won', 'Closed Lost'].includes(s)).length;
                const progress = stageTotal > 0 ? ((stageIdx + 1) / stageTotal) * 100 : 0;
                return (
                  <div
                    key={opp.id}
                    className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer hover:border-primary/30 hover:bg-muted/20 transition-colors"
                    onClick={() => navigate(`/pipeline/${opp.id}`)}
                  >
                    <span className="text-lg font-semibold text-muted-foreground/40 w-6 text-center shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium truncate">{opp.name}</span>
                        <span className={`status-badge text-[10px] ${getStageColor(opp.stage)}`}>{opp.stage}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="truncate">{opp.clients?.name}</span>
                        {opp.datasets?.name && <span className="truncate">· {opp.datasets.name}</span>}
                        {opp.expected_close && <span>· Close {opp.expected_close}</span>}
                      </div>
                      {/* Stage progress bar */}
                      <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-sm font-mono font-medium">{formatCurrency(Number(opp.value))}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{opp.probability}% · {formatCurrency(weighted)}</p>
                    </div>
                    <ArrowRight size={12} className="text-muted-foreground shrink-0" />
                  </div>
                );
              })}
            </div>
          )}
          <button onClick={() => navigate('/pipeline')} className="text-xs text-primary hover:underline mt-3 flex items-center gap-1">
            View full pipeline <ArrowRight size={11} />
          </button>
        </div>

        <ActionCenterSummary onOpenPanel={() => setPanelOpen(true)} />
      </div>

      {/* Secondary: Urgent Renewals + Trials Ending */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Urgent Renewals */}
        <div className="data-card">
          <div className="flex items-center gap-2 mb-4">
            <RefreshCw size={14} className="text-warning" />
            <h3 className="text-sm font-medium">Urgent Renewals</h3>
            <span className="ml-auto text-[10px] text-muted-foreground">{urgentRenewals.length} due in 30d</span>
          </div>
          {urgentRenewals.length === 0 ? (
            <div className="flex items-center gap-2 py-4 justify-center">
              <CheckCircle2 size={14} className="text-success" />
              <p className="text-xs text-muted-foreground">No urgent renewals</p>
            </div>
          ) : (
            <div className="space-y-3">
              {urgentRenewals.slice(0, 4).map((r: any) => {
                const days = Math.ceil((new Date(r.renewal_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={r.id} className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.clients?.name}</p>
                      <p className="text-xs text-muted-foreground">{r.datasets?.name}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-sm font-mono">{formatCurrency(Number(r.value))}</p>
                      <p className={`text-xs ${days <= 7 ? 'text-destructive font-medium' : 'text-warning'}`}>{days}d</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Trials Ending Soon */}
        <div className="data-card">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={14} className="text-warning" />
            <h3 className="text-sm font-medium">Trials Ending Soon</h3>
            <span className="ml-auto text-[10px] text-muted-foreground">Next 7 days</span>
          </div>
          {endingSoonTrials.length === 0 ? (
            <div className="flex items-center gap-2 py-4 justify-center">
              <CheckCircle2 size={14} className="text-success" />
              <p className="text-xs text-muted-foreground">No trials ending soon</p>
            </div>
          ) : (
            <div className="space-y-3">
              {endingSoonTrials.slice(0, 5).map((t: any) => (
                <div key={t.id} className="flex items-center justify-between cursor-pointer hover:bg-muted/30 -mx-2 px-2 py-1 rounded">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.clients?.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{t.datasets?.name}</p>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <span className={`status-badge ${t.daysRemaining <= 2 ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}`}>{t.daysRemaining}d left</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Campaign Outreach — pending targets */}
      {campaignOutreach.length > 0 && (
        <div className="data-card mb-4">
          <button
            onClick={() => setOutreachOpen(!outreachOpen)}
            className="flex items-center justify-between w-full"
          >
            <div className="flex items-center gap-2">
              <ChevronDown size={14} className={`text-muted-foreground transition-transform ${outreachOpen ? '' : '-rotate-90'}`} />
              <Megaphone size={14} className="text-primary" />
              <h3 className="text-sm font-medium">Campaign Outreach</h3>
              <span className="text-[10px] text-muted-foreground">({campaignOutreach.length} pending)</span>
            </div>
            <span className="text-xs text-primary hover:underline" onClick={(e) => { e.stopPropagation(); navigate('/campaigns'); }}>View campaigns</span>
          </button>
          {outreachOpen && (
            <div className="space-y-1 mt-4">
              {campaignOutreach.slice(0, 8).map((t: any) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 py-2.5 border-b border-border last:border-0 cursor-pointer hover:bg-muted/30 -mx-2 px-2 rounded transition-colors"
                  onClick={() => navigate(t.client_id ? `/clients/${t.client_id}` : `/campaigns/${t.campaign_id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{t.clients?.name || t.prospect_name || 'Unknown'}</span>
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{t.status === 'not_started' ? 'Not started' : 'Ready'}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{t.campaigns?.name || 'Campaign'}</p>
                  </div>
                  {t.fit_score > 0 && (
                    <span className={`text-xs font-mono font-medium ${
                      t.fit_score >= 70 ? 'text-success' : t.fit_score >= 40 ? 'text-warning' : 'text-muted-foreground'
                    }`}>
                      {t.fit_score}
                    </span>
                  )}
                  <ArrowRight size={12} className="text-muted-foreground shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Priority Queue — collapsed */}
      {priorityQueue.length > 0 && (
        <div className="data-card mb-4">
          <button
            onClick={() => setPriorityOpen(!priorityOpen)}
            className="flex items-center justify-between w-full"
          >
            <div className="flex items-center gap-2">
              <ChevronDown size={14} className={`text-muted-foreground transition-transform ${priorityOpen ? '' : '-rotate-90'}`} />
              <AlertTriangle size={14} className="text-primary" />
              <h3 className="text-sm font-medium">Priority Queue</h3>
              <span className="text-[10px] text-muted-foreground">({priorityQueue.length})</span>
            </div>
            <span className="text-xs text-primary hover:underline">View all accounts</span>
          </button>
          {priorityOpen && (
            <div className="space-y-1 mt-4">
              {priorityQueue.map((account, i) => (
                <div
                  key={account.id}
                  className="flex items-center gap-3 py-2.5 border-b border-border last:border-0 cursor-pointer hover:bg-muted/30 -mx-2 px-2 rounded transition-colors"
                  onClick={() => navigate(`/clients/${account.id}`)}
                >
                  <span className="text-[10px] text-muted-foreground font-mono w-4 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{account.name}</span>
                      <span className="text-[10px] text-muted-foreground">{account.type}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{account.reason}</p>
                  </div>
                  {account.fitScore > 0 && (
                    <span className={`text-xs font-mono font-medium ${
                      account.fitScore >= 70 ? 'text-success' : account.fitScore >= 40 ? 'text-warning' : 'text-muted-foreground'
                    }`}>
                      {account.fitScore}
                    </span>
                  )}
                  <ArrowRight size={12} className="text-muted-foreground shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Suggested Accounts — collapsed */}
      {discoverySuggestions.length > 0 && (
        <div className="data-card">
          <button
            onClick={() => setSuggestedOpen(!suggestedOpen)}
            className="flex items-center justify-between w-full"
          >
            <div className="flex items-center gap-2">
              <ChevronDown size={14} className={`text-muted-foreground transition-transform ${suggestedOpen ? '' : '-rotate-90'}`} />
              <Sparkles size={14} className="text-primary" />
              <h3 className="text-sm font-medium">Suggested Accounts</h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{discoverySuggestions.length} new</span>
            </div>
            <span className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight size={11} />
            </span>
          </button>
          {suggestedOpen && (
            <div className="space-y-2 mt-4">
              {discoverySuggestions.slice(0, 5).map((s) => (
                <div key={s.id} className="flex items-center justify-between py-1.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.suggested_type} · {s.country || '—'}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${(s.product_fit_score || 0) >= 70 ? 'bg-success/10 text-success' : (s.product_fit_score || 0) >= 40 ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground'}`}>
                      {s.product_fit_score ?? 0}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ActionCenterPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </AppLayout>
  );
}

function MetricCard({ icon: Icon, label, value, sub, accent, onClick }: { icon: any; label: string; value: string; sub: string; accent: string; onClick?: () => void }) {
  const colorMap: Record<string, string> = { primary: 'text-primary', success: 'text-success', warning: 'text-warning', info: 'text-info' };
  return (
    <div className="data-card cursor-pointer hover:border-primary/30 transition-colors flex flex-col" onClick={onClick}>
      <div className="flex items-start gap-2 min-h-[2.5rem]">
        <Icon size={14} className={`${colorMap[accent] || 'text-primary'} mt-0.5 shrink-0`} />
        <span className="metric-label">{label}</span>
      </div>
      <div className="metric-value mt-auto">{value}</div>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}
