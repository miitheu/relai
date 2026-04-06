import { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { useOpportunities, useRenewals, useAllDeliveries, useProfiles } from '@/hooks/useCrmData';
import { formatCurrency, getStageColor } from '@/data/mockData';
import { useCurrencyRerender } from '@/hooks/useCurrencyRerender';
import { AlertTriangle, AlertCircle, Clock, Users, Calendar, DollarSign, Target, Database, ArrowUpRight, CheckCircle2, Filter, ChevronDown, ChevronRight } from 'lucide-react';
import { differenceInDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import LoadingState from '@/components/LoadingState';
import { getTrialStatus } from '@/lib/trialUtils';

type IssueSeverity = 'critical' | 'warning' | 'info';
type IssueCategory = 'missing_data' | 'stale_deals' | 'follow_up' | 'stage_problems' | 'trial_renewal';

interface HygieneIssue {
  id: string;
  opp_id: string;
  opp_name: string;
  client_name: string;
  owner_name: string;
  owner_id: string | null;
  category: IssueCategory;
  issue_type: string;
  issue_label: string;
  severity: IssueSeverity;
  suggested_fix: string;
  value: number;
  stage: string;
}

const categoryConfig: Record<IssueCategory, { label: string; icon: any; color: string }> = {
  missing_data: { label: 'Missing Data', icon: AlertCircle, color: 'text-warning' },
  stale_deals: { label: 'Stale Deals', icon: Clock, color: 'text-destructive' },
  follow_up: { label: 'Follow-Up Problems', icon: Calendar, color: 'text-destructive' },
  stage_problems: { label: 'Stage Problems', icon: Target, color: 'text-warning' },
  trial_renewal: { label: 'Trial / Renewal', icon: Database, color: 'text-info' },
};

const severityConfig: Record<IssueSeverity, { label: string; cls: string; bg: string }> = {
  critical: { label: 'Critical', cls: 'text-destructive', bg: 'bg-destructive/10 text-destructive' },
  warning: { label: 'Warning', cls: 'text-warning', bg: 'bg-warning/10 text-warning' },
  info: { label: 'Info', cls: 'text-info', bg: 'bg-info/10 text-info' },
};

export default function PipelineHygiene() {
  useCurrencyRerender();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { data: opportunities = [], isLoading: lo } = useOpportunities();
  const { data: renewals = [], isLoading: lr } = useRenewals();
  const { data: allDeliveries = [], isLoading: ld } = useAllDeliveries();
  const { data: profiles = [] } = useProfiles();
  const [categoryFilter, setCategoryFilter] = useState<IssueCategory | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<IssueSeverity | 'all'>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['missing_data', 'stale_deals', 'follow_up', 'stage_problems', 'trial_renewal']));

  const isLoading = lo || lr || ld;

  const profileMap = useMemo(() => {
    const m = new Map<string, string>();
    profiles.forEach((p: any) => m.set(p.user_id, p.full_name || p.email));
    return m;
  }, [profiles]);

  const issues = useMemo(() => {
    const items: HygieneIssue[] = [];
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const openOpps = opportunities.filter((o: any) => !['Closed Won', 'Closed Lost', 'Inactive'].includes(o.stage));

    openOpps.forEach((o: any) => {
      const ownerName = o.owner_id ? (profileMap.get(o.owner_id) || 'Unknown') : 'Unassigned';
      const base = { opp_id: o.id, opp_name: o.name, client_name: o.clients?.name || '—', owner_name: ownerName, owner_id: o.owner_id, value: Number(o.value), stage: o.stage };

      // Missing Data
      if (!o.expected_close) {
        items.push({ ...base, id: `miss-close-${o.id}`, category: 'missing_data', issue_type: 'no_close_date', issue_label: 'Missing close date', severity: 'warning', suggested_fix: 'Set expected close date' });
      }
      if (Number(o.value) === 0) {
        items.push({ ...base, id: `miss-value-${o.id}`, category: 'missing_data', issue_type: 'no_value', issue_label: 'Missing deal value', severity: 'warning', suggested_fix: 'Set deal value' });
      }
      if (!o.owner_id) {
        items.push({ ...base, id: `miss-owner-${o.id}`, category: 'missing_data', issue_type: 'no_owner', issue_label: 'No owner assigned', severity: 'critical', suggested_fix: 'Assign an owner' });
      }
      if (!o.dataset_id) {
        items.push({ ...base, id: `miss-dataset-${o.id}`, category: 'missing_data', issue_type: 'no_dataset', issue_label: 'No dataset linked', severity: 'info', suggested_fix: 'Link a dataset' });
      }
      if (!o.contact_ids || o.contact_ids.length === 0) {
        items.push({ ...base, id: `miss-contact-${o.id}`, category: 'missing_data', issue_type: 'no_contact', issue_label: 'No contact linked', severity: 'warning', suggested_fix: 'Link a contact' });
      }

      // Stale Deals
      const lastDate = o.last_activity_at || o.updated_at || o.created_at;
      const daysSince = differenceInDays(now, new Date(lastDate));
      if (daysSince > 30) {
        items.push({ ...base, id: `stale-${o.id}`, category: 'stale_deals', issue_type: 'stale', issue_label: `No activity for ${daysSince}d`, severity: daysSince > 60 ? 'critical' : 'warning', suggested_fix: 'Log interaction or update' });
      }

      // Stage stuck
      if (o.stage_entered_at) {
        const daysInStage = differenceInDays(now, new Date(o.stage_entered_at));
        if (daysInStage > 45) {
          items.push({ ...base, id: `stuck-${o.id}`, category: 'stage_problems', issue_type: 'stuck_in_stage', issue_label: `In "${o.stage}" for ${daysInStage}d`, severity: daysInStage > 60 ? 'critical' : 'warning', suggested_fix: 'Advance stage or mark lost' });
        }
      }

      // Follow-up Problems
      if (o.next_action_due_date && o.next_action_due_date < todayStr) {
        const overdueDays = differenceInDays(now, new Date(o.next_action_due_date));
        items.push({ ...base, id: `overdue-${o.id}`, category: 'follow_up', issue_type: 'overdue_action', issue_label: `Follow-up overdue by ${overdueDays}d`, severity: overdueDays > 7 ? 'critical' : 'warning', suggested_fix: 'Complete or reschedule action' });
      }
      if (!o.next_action_description && daysSince > 14) {
        items.push({ ...base, id: `no-action-${o.id}`, category: 'follow_up', issue_type: 'no_next_action', issue_label: 'No next action set', severity: 'warning', suggested_fix: 'Set a next action' });
      }

      // Close date passed
      if (o.expected_close && o.expected_close < todayStr) {
        const overdue = differenceInDays(now, new Date(o.expected_close));
        items.push({ ...base, id: `past-close-${o.id}`, category: 'stage_problems', issue_type: 'past_close_date', issue_label: `Close date passed ${overdue}d ago`, severity: 'critical', suggested_fix: 'Update close date or close deal' });
      }
    });

    // Trial / Renewal issues
    const trials = allDeliveries.filter((d: any) => d.delivery_type?.toLowerCase() === 'trial');
    trials.forEach((t: any) => {
      const status = getTrialStatus(t.status, t.trial_start_date, t.trial_end_date, t.opportunities?.stage);
      if (status === 'expired' && t.opportunity_id) {
        const opp = opportunities.find((o: any) => o.id === t.opportunity_id);
        if (opp && !['Closed Won', 'Closed Lost'].includes(opp.stage)) {
          const ownerName = opp.owner_id ? (profileMap.get(opp.owner_id) || 'Unknown') : 'Unassigned';
          items.push({
            id: `trial-exp-${t.id}`, opp_id: opp.id, opp_name: opp.name, client_name: opp.clients?.name || t.clients?.name || '—',
            owner_name: ownerName, owner_id: opp.owner_id, category: 'trial_renewal', issue_type: 'trial_expired',
            issue_label: 'Trial expired, opp still open', severity: 'critical', suggested_fix: 'Follow up on trial results',
            value: Number(opp.value), stage: opp.stage,
          });
        }
      }
    });

    renewals.forEach((r: any) => {
      if (['Renewed', 'Lost'].includes(r.status)) return;
      const daysTo = differenceInDays(new Date(r.renewal_date), now);
      if (daysTo < 0) {
        items.push({
          id: `ren-overdue-${r.id}`, opp_id: '', opp_name: `Renewal: ${r.clients?.name}`, client_name: r.clients?.name || '—',
          owner_name: r.created_by ? (profileMap.get(r.created_by) || 'Unknown') : 'Unassigned', owner_id: r.created_by,
          category: 'trial_renewal', issue_type: 'renewal_overdue', issue_label: `Renewal overdue by ${Math.abs(daysTo)}d`,
          severity: 'critical', suggested_fix: 'Process or update renewal', value: Number(r.value), stage: r.status,
        });
      }
    });

    // Sort by severity
    const severityOrder: Record<IssueSeverity, number> = { critical: 0, warning: 1, info: 2 };
    items.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.value - a.value);
    return items;
  }, [opportunities, renewals, allDeliveries, profileMap]);

  // Filter
  const filtered = useMemo(() => {
    let f = issues;
    if (categoryFilter !== 'all') f = f.filter(i => i.category === categoryFilter);
    if (severityFilter !== 'all') f = f.filter(i => i.severity === severityFilter);
    if (ownerFilter !== 'all') f = f.filter(i => i.owner_id === ownerFilter);
    return f;
  }, [issues, categoryFilter, severityFilter, ownerFilter]);

  // Summary
  const summary = useMemo(() => {
    const byCat = {} as Record<IssueCategory, number>;
    const bySev = { critical: 0, warning: 0, info: 0 };
    issues.forEach(i => {
      byCat[i.category] = (byCat[i.category] || 0) + 1;
      bySev[i.severity]++;
    });
    return { byCat, bySev, total: issues.length };
  }, [issues]);

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  // Unique owners
  const ownerOptions = useMemo(() => {
    const set = new Set<string>();
    issues.forEach(i => { if (i.owner_id) set.add(i.owner_id); });
    return Array.from(set).map(id => ({ id, name: profileMap.get(id) || 'Unknown' })).sort((a, b) => a.name.localeCompare(b.name));
  }, [issues, profileMap]);

  if (isLoading) return <AppLayout><LoadingState /></AppLayout>;

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Pipeline Hygiene</h1>
          <p className="text-sm text-muted-foreground">
            {summary.total} issues across your pipeline · Clean up data quality problems
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <button onClick={() => { setCategoryFilter('all'); setSeverityFilter('all'); }} className={`data-card py-3 px-4 text-left transition-colors ${categoryFilter === 'all' && severityFilter === 'all' ? 'border-primary/50' : 'hover:border-primary/30'}`}>
          <span className="metric-label">Total Issues</span>
          <p className="text-2xl font-semibold font-mono mt-1">{summary.total}</p>
          <div className="flex gap-2 mt-1.5">
            {summary.bySev.critical > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">{summary.bySev.critical} critical</span>}
            {summary.bySev.warning > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning">{summary.bySev.warning} warning</span>}
          </div>
        </button>
        {(Object.entries(categoryConfig) as [IssueCategory, typeof categoryConfig[IssueCategory]][]).map(([key, cfg]) => {
          const count = summary.byCat[key] || 0;
          const Icon = cfg.icon;
          return (
            <button key={key} onClick={() => { setCategoryFilter(key); setSeverityFilter('all'); }} className={`data-card py-3 px-4 text-left transition-colors ${categoryFilter === key ? 'border-primary/50' : 'hover:border-primary/30'}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <Icon size={13} className={cfg.color} />
                <span className="metric-label">{cfg.label}</span>
              </div>
              <p className="text-2xl font-semibold font-mono">{count}</p>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <Filter size={13} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Severity:</span>
        </div>
        {(['all', 'critical', 'warning', 'info'] as const).map(s => (
          <button key={s} onClick={() => setSeverityFilter(s)} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${severityFilter === s ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
            {s === 'all' ? 'All' : severityConfig[s].label}
          </button>
        ))}
        <div className="w-px h-4 bg-border mx-1" />
        <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} className="bg-card border border-border rounded-md text-xs px-2.5 py-1.5">
          <option value="all">All Owners</option>
          {ownerOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>

      {/* No issues state */}
      {filtered.length === 0 ? (
        <div className="data-card text-center py-16">
          <CheckCircle2 size={32} className="text-success mx-auto mb-3" />
          <p className="text-sm font-medium">Pipeline is clean</p>
          <p className="text-xs text-muted-foreground mt-1">No hygiene issues found matching your filters.</p>
        </div>
      ) : (
        /* Issues grouped by category */
        <div className="space-y-2">
          {(Object.entries(categoryConfig) as [IssueCategory, typeof categoryConfig[IssueCategory]][]).map(([catKey, cfg]) => {
            const catIssues = filtered.filter(i => i.category === catKey);
            if (catIssues.length === 0) return null;
            const isExpanded = expandedCategories.has(catKey);
            const Icon = cfg.icon;

            return (
              <div key={catKey} className="data-card p-0 overflow-hidden">
                <button onClick={() => toggleCategory(catKey)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                  {isExpanded ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                  <Icon size={14} className={cfg.color} />
                  <span className="text-sm font-medium">{cfg.label}</span>
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{catIssues.length}</span>
                  <div className="flex-1" />
                  <div className="flex gap-2">
                    {catIssues.filter(i => i.severity === 'critical').length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">{catIssues.filter(i => i.severity === 'critical').length} critical</span>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/20">
                          <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium w-6"></th>
                          <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Opportunity</th>
                          <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Client</th>
                          <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Owner</th>
                          <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Issue</th>
                          <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Severity</th>
                          <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Value</th>
                          <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Fix</th>
                          <th className="px-4 py-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {catIssues.map(issue => {
                          const sevCfg = severityConfig[issue.severity];
                          return (
                            <tr key={issue.id} className={`border-t border-border hover:bg-muted/30 transition-colors ${issue.severity === 'critical' ? 'bg-destructive/[0.02]' : ''}`}>
                              <td className="px-4 py-2.5">
                                <div className={`w-1.5 h-1.5 rounded-full ${issue.severity === 'critical' ? 'bg-destructive' : issue.severity === 'warning' ? 'bg-warning' : 'bg-info'}`} />
                              </td>
                              <td className="px-4 py-2.5">
                                <p className="text-sm font-medium truncate max-w-[200px]">{issue.opp_name}</p>
                                <span className={`status-badge text-[10px] ${getStageColor(issue.stage)}`}>{issue.stage}</span>
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground text-xs">{issue.client_name}</td>
                              <td className="px-4 py-2.5 text-xs">{issue.owner_name}</td>
                              <td className="px-4 py-2.5">
                                <span className="text-xs">{issue.issue_label}</span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`status-badge text-[10px] ${sevCfg.bg}`}>{sevCfg.label}</span>
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono text-xs">{formatCurrency(issue.value)}</td>
                              <td className="px-4 py-2.5">
                                <span className="text-[10px] text-muted-foreground">{issue.suggested_fix}</span>
                              </td>
                              <td className="px-4 py-2.5">
                                {issue.opp_id && (
                                  <button onClick={() => navigate(`/pipeline/${issue.opp_id}`)} className="p-1 rounded hover:bg-primary/10 text-primary transition-colors" title="Open deal">
                                    <ArrowUpRight size={12} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
