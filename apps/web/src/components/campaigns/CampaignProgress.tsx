import { useMemo } from 'react';
import { TrendingUp, Clock, ArrowRight, BarChart3 } from 'lucide-react';
import { formatDistanceToNow, differenceInDays, parseISO } from 'date-fns';

const stages = [
  { key: 'not_started', label: 'Not Started', color: 'bg-muted' },
  { key: 'outreach_ready', label: 'Ready', color: 'bg-info/30' },
  { key: 'contacted', label: 'Contacted', color: 'bg-info/50' },
  { key: 'engaged', label: 'Engaged', color: 'bg-primary/40' },
  { key: 'meeting_booked', label: 'Meeting', color: 'bg-primary/60' },
  { key: 'opportunity_opened', label: 'Opportunity', color: 'bg-warning/50' },
  { key: 'trial_active', label: 'Trial', color: 'bg-warning/70' },
  { key: 'commercial_discussion', label: 'Commercial', color: 'bg-success/40' },
  { key: 'won', label: 'Won', color: 'bg-success' },
  { key: 'lost', label: 'Lost', color: 'bg-destructive/50' },
  { key: 'paused', label: 'Paused', color: 'bg-muted' },
];

const funnelStages = ['not_started', 'outreach_ready', 'contacted', 'engaged', 'meeting_booked', 'opportunity_opened', 'trial_active', 'commercial_discussion', 'won'];

export default function CampaignProgress({ campaign, targets }: { campaign: any; targets: any[] }) {
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of stages) c[s.key] = 0;
    for (const t of targets) c[t.status] = (c[t.status] || 0) + 1;
    return c;
  }, [targets]);

  const total = targets.length;
  const contacted = targets.filter(t => !['not_started', 'outreach_ready'].includes(t.status)).length;
  const engaged = targets.filter(t => !['not_started', 'outreach_ready', 'contacted'].includes(t.status)).length;
  const meetings = targets.filter(t => t.meeting_booked_at).length;
  const won = counts.won || 0;
  const lost = counts.lost || 0;

  const conversionRate = total > 0 ? Math.round((won / total) * 100) : 0;
  const contactRate = total > 0 ? Math.round((contacted / total) * 100) : 0;
  const engagementRate = contacted > 0 ? Math.round((engaged / contacted) * 100) : 0;
  const meetingRate = engaged > 0 ? Math.round((meetings / engaged) * 100) : 0;
  const winRate = (won + lost) > 0 ? Math.round((won / (won + lost)) * 100) : 0;

  // Velocity: avg days from creation to contacted, engaged, meeting
  const velocity = useMemo(() => {
    const toContacted: number[] = [];
    const toEngaged: number[] = [];
    const toMeeting: number[] = [];
    const toWon: number[] = [];

    for (const t of targets) {
      const created = parseISO(t.created_at);
      if (t.contacted_at) toContacted.push(differenceInDays(parseISO(t.contacted_at), created));
      if (t.responded_at) toEngaged.push(differenceInDays(parseISO(t.responded_at), created));
      if (t.meeting_booked_at) toMeeting.push(differenceInDays(parseISO(t.meeting_booked_at), created));
    }

    const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null;

    return {
      toContacted: avg(toContacted),
      toEngaged: avg(toEngaged),
      toMeeting: avg(toMeeting),
      toWon: avg(toWon),
    };
  }, [targets]);

  // Stage conversion funnel
  const funnel = useMemo(() => {
    const cumulativeCounts = funnelStages.map((stage, idx) => {
      // Count targets at this stage or beyond
      return targets.filter(t => {
        const tIdx = funnelStages.indexOf(t.status);
        return tIdx >= idx;
      }).length;
    });
    return funnelStages.map((stage, idx) => ({
      stage,
      label: stages.find(s => s.key === stage)?.label || stage,
      count: cumulativeCounts[idx],
      rate: idx > 0 && cumulativeCounts[idx - 1] > 0
        ? Math.round((cumulativeCounts[idx] / cumulativeCounts[idx - 1]) * 100)
        : 100,
    }));
  }, [targets]);

  // Score distribution
  const scoreDistribution = useMemo(() => {
    const buckets = [
      { label: '80-100', min: 80, max: 100, count: 0, color: 'bg-success' },
      { label: '60-79', min: 60, max: 79, count: 0, color: 'bg-warning' },
      { label: '40-59', min: 40, max: 59, count: 0, color: 'bg-info' },
      { label: '0-39', min: 0, max: 39, count: 0, color: 'bg-muted-foreground' },
    ];
    for (const t of targets) {
      const s = t.fit_score || 0;
      for (const b of buckets) {
        if (s >= b.min && s <= b.max) { b.count++; break; }
      }
    }
    return buckets;
  }, [targets]);

  const campaignAge = campaign.started_at
    ? formatDistanceToNow(parseISO(campaign.started_at))
    : campaign.created_at
    ? formatDistanceToNow(parseISO(campaign.created_at))
    : '—';

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: 'Total Targets', value: total },
          { label: 'Contact Rate', value: `${contactRate}%`, sub: `${contacted} contacted` },
          { label: 'Engagement Rate', value: `${engagementRate}%`, sub: `${engaged} engaged` },
          { label: 'Meeting Rate', value: `${meetingRate}%`, sub: `${meetings} meetings` },
          { label: 'Win Rate', value: `${winRate}%`, sub: `${won} won / ${lost} lost` },
          { label: 'Campaign Age', value: campaignAge },
        ].map(k => (
          <div key={k.label} className="data-card text-center">
            <p className="text-lg font-bold font-mono">{k.value}</p>
            <p className="text-[11px] text-muted-foreground">{k.label}</p>
            {k.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{k.sub}</p>}
          </div>
        ))}
      </div>

      {/* Velocity metrics */}
      {(velocity.toContacted !== null || velocity.toEngaged !== null || velocity.toMeeting !== null) && (
        <div className="data-card">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={14} className="text-primary" />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Velocity (avg days)</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-center px-4 py-2 bg-muted/50 rounded-lg">
              <p className="text-sm font-bold font-mono">0</p>
              <p className="text-[10px] text-muted-foreground">Created</p>
            </div>
            {velocity.toContacted !== null && (
              <>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <ArrowRight size={10} />
                  <span className="font-mono">{velocity.toContacted}d</span>
                </div>
                <div className="text-center px-4 py-2 bg-info/10 rounded-lg">
                  <p className="text-sm font-bold font-mono text-info">{contacted}</p>
                  <p className="text-[10px] text-muted-foreground">Contacted</p>
                </div>
              </>
            )}
            {velocity.toEngaged !== null && (
              <>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <ArrowRight size={10} />
                  <span className="font-mono">{velocity.toEngaged}d</span>
                </div>
                <div className="text-center px-4 py-2 bg-primary/10 rounded-lg">
                  <p className="text-sm font-bold font-mono text-primary">{engaged}</p>
                  <p className="text-[10px] text-muted-foreground">Engaged</p>
                </div>
              </>
            )}
            {velocity.toMeeting !== null && (
              <>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <ArrowRight size={10} />
                  <span className="font-mono">{velocity.toMeeting}d</span>
                </div>
                <div className="text-center px-4 py-2 bg-success/10 rounded-lg">
                  <p className="text-sm font-bold font-mono text-success">{meetings}</p>
                  <p className="text-[10px] text-muted-foreground">Meetings</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Stage conversion funnel */}
      {total > 0 && (
        <div className="data-card">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} className="text-primary" />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conversion Funnel</p>
          </div>
          <div className="space-y-1">
            {funnel.filter(f => f.count > 0 || funnelStages.indexOf(f.stage) <= 2).map((f, idx) => (
              <div key={f.stage} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-24">{f.label}</span>
                <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden relative">
                  <div
                    className={`h-full rounded-full transition-all ${stages.find(s => s.key === f.stage)?.color || 'bg-muted'}`}
                    style={{ width: total > 0 ? `${(f.count / total) * 100}%` : '0%' }}
                  />
                  {f.count > 0 && (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-medium">
                      {f.count}
                    </span>
                  )}
                </div>
                <span className="text-xs font-mono w-12 text-right">
                  {idx > 0 ? `${f.rate}%` : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Funnel bar */}
      {total > 0 && (
        <div className="data-card">
          <p className="text-xs font-medium text-muted-foreground mb-2">Pipeline Distribution</p>
          <div className="flex rounded-lg overflow-hidden h-6">
            {stages.filter(s => counts[s.key] > 0).map(s => (
              <div
                key={s.key}
                className={`${s.color} flex items-center justify-center transition-all`}
                style={{ width: `${(counts[s.key] / total) * 100}%` }}
                title={`${s.label}: ${counts[s.key]}`}
              >
                {counts[s.key] > 0 && (
                  <span className="text-[10px] font-medium text-foreground">{counts[s.key]}</span>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            {stages.filter(s => counts[s.key] > 0).map(s => (
              <div key={s.key} className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-sm ${s.color}`} />
                <span className="text-[10px] text-muted-foreground">{s.label} ({counts[s.key]})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Score distribution */}
      {total > 0 && (
        <div className="data-card">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={14} className="text-primary" />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Score Distribution</p>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {scoreDistribution.map(b => (
              <div key={b.label} className="text-center">
                <div className={`h-16 rounded-md ${b.color}/20 flex items-end justify-center pb-1`}>
                  <div
                    className={`w-8 ${b.color} rounded-sm transition-all`}
                    style={{ height: total > 0 ? `${Math.max((b.count / total) * 100, b.count > 0 ? 15 : 0)}%` : '0%' }}
                  />
                </div>
                <p className="text-xs font-mono font-bold mt-1">{b.count}</p>
                <p className="text-[10px] text-muted-foreground">{b.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
