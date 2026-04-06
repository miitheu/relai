import { useMemo, useCallback } from 'react';
import { useOpportunities, useRenewals, useAllDeliveries, useProfiles, useClients, useActivities } from './useCrmData';
import { getTrialStatus, getDaysRemaining } from '@/lib/trialUtils';
import { useDismissals, useSnoozeReminder, useDismissReminder, useUnsnoozeReminder } from '@/hooks/useReminderActions';
import { isKeySnoozed } from '@/lib/reminderUtils';
import { ICEBOX_STAGES } from '@/data/mockData';
import { useInvoices, type Invoice } from './useInvoices';
import { useAllAccountActionItems } from './useAccountActionItems';
import { useUserCampaignTargets } from './useCampaigns';

export type ActionSeverity = 'info' | 'warning' | 'urgent';
export type BallStatus = 'our_court' | 'their_court' | 'neutral' | 'unknown' | 'closed_won' | 'closed_lost';

export interface ActionItem {
  id: string;
  action_type: string;
  title: string;
  description: string;
  due_date: string | null;
  severity: ActionSeverity;
  owner_id: string | null;
  related_entity_type: 'opportunity' | 'renewal' | 'trial' | 'contract' | 'client' | 'invoice' | 'campaign_target';
  related_entity_id: string;
  client_id: string | null;
  client_name: string | null;
  opportunity_id: string | null;
  dataset_name: string | null;
  ball_status: BallStatus;
  days_overdue: number;
  link: string;
}

function daysBetween(a: string | Date, b: string | Date) {
  return Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

export function useActionCenter(ownerFilter?: string, isAdmin?: boolean) {
  const { data: opportunities = [], isLoading: lo } = useOpportunities();
  const { data: renewals = [], isLoading: lr } = useRenewals();
  const { data: allDeliveries = [], isLoading: ld } = useAllDeliveries();
  const { data: profiles = [] } = useProfiles();
  const { data: clients = [], isLoading: lc } = useClients();
  const { data: activities = [] } = useActivities();
  const { data: invoices = [] } = useInvoices();
  const { data: accountActions = [] } = useAllAccountActionItems();
  const { data: campaignTargets = [] } = useUserCampaignTargets();
  const { data: dismissals = [] } = useDismissals();
  const snoozeMutation = useSnoozeReminder();
  const dismissMutation = useDismissReminder();
  const unsnoozeMutation = useUnsnoozeReminder();
  const isLoading = lo || lr || ld || lc;

  const handleSnooze = useCallback((id: string, days: number) => {
    snoozeMutation.mutate({ actionKey: id, days });
  }, [snoozeMutation]);

  const handleDismiss = useCallback((id: string) => {
    dismissMutation.mutate(id);
  }, [dismissMutation]);

  const handleUnsnooze = useCallback((id: string) => {
    unsnoozeMutation.mutate(id);
  }, [unsnoozeMutation]);

  const actions = useMemo(() => {
    const items: ActionItem[] = [];
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // --- Opportunities ---
    const openOpps = opportunities.filter((o: any) => !['Closed Won', 'Closed Lost', ...(ICEBOX_STAGES as readonly string[])].includes(o.stage));

    // Build a map of latest activity per client
    const lastActivityByClient: Record<string, string> = {};
    activities.forEach((a: any) => {
      if (a.client_id) {
        if (!lastActivityByClient[a.client_id] || a.created_at > lastActivityByClient[a.client_id]) {
          lastActivityByClient[a.client_id] = a.created_at;
        }
      }
    });

    openOpps.forEach((o: any) => {
      if (ownerFilter && o.owner_id !== ownerFilter) return;

      const ballStatus: BallStatus = o.ball_status || 'unknown';

      // Next action overdue
      if (o.next_action_due_date && o.next_action_due_date < todayStr) {
        const overdue = daysBetween(o.next_action_due_date, now);
        items.push({
          id: `opp-action-${o.id}`,
          action_type: 'follow_up_overdue',
          title: o.next_action_description || 'Follow-up overdue',
          description: `${o.name} · ${o.clients?.name || ''}`,
          due_date: o.next_action_due_date,
          severity: overdue > 7 ? 'urgent' : 'warning',
          owner_id: o.owner_id,
          related_entity_type: 'opportunity',
          related_entity_id: o.id,
          client_id: o.client_id,
          client_name: o.clients?.name || null,
          opportunity_id: o.id,
          dataset_name: o.datasets?.name || null,
          ball_status: ballStatus,
          days_overdue: overdue,
          link: `/pipeline/${o.id}`,
        });
      }

      // Next action due today
      if (o.next_action_due_date && o.next_action_due_date === todayStr) {
        items.push({
          id: `opp-due-${o.id}`,
          action_type: 'follow_up_due',
          title: o.next_action_description || 'Follow-up due today',
          description: `${o.name} · ${o.clients?.name || ''}`,
          due_date: o.next_action_due_date,
          severity: 'warning',
          owner_id: o.owner_id,
          related_entity_type: 'opportunity',
          related_entity_id: o.id,
          client_id: o.client_id,
          client_name: o.clients?.name || null,
          opportunity_id: o.id,
          dataset_name: o.datasets?.name || null,
          ball_status: ballStatus,
          days_overdue: 0,
          link: `/pipeline/${o.id}`,
        });
      }

      // Close date approaching (within 14 days)
      if (o.expected_close) {
        const daysToClose = daysBetween(now, o.expected_close);
        if (daysToClose >= 0 && daysToClose <= 14) {
          items.push({
            id: `opp-close-${o.id}`,
            action_type: 'close_date_approaching',
            title: `Closing in ${daysToClose}d`,
            description: `${o.name} · ${o.clients?.name || ''}`,
            due_date: o.expected_close,
            severity: daysToClose <= 3 ? 'urgent' : 'warning',
            owner_id: o.owner_id,
            related_entity_type: 'opportunity',
            related_entity_id: o.id,
            client_id: o.client_id,
            client_name: o.clients?.name || null,
            opportunity_id: o.id,
            dataset_name: o.datasets?.name || null,
            ball_status: ballStatus,
            days_overdue: 0,
            link: `/pipeline/${o.id}`,
          });
        }
        if (daysToClose < 0) {
          items.push({
            id: `opp-overdue-close-${o.id}`,
            action_type: 'close_date_approaching',
            title: `Close date passed ${Math.abs(daysToClose)}d ago`,
            description: `${o.name} · ${o.clients?.name || ''}`,
            due_date: o.expected_close,
            severity: 'urgent',
            owner_id: o.owner_id,
            related_entity_type: 'opportunity',
            related_entity_id: o.id,
            client_id: o.client_id,
            client_name: o.clients?.name || null,
            opportunity_id: o.id,
            dataset_name: o.datasets?.name || null,
            ball_status: ballStatus,
            days_overdue: Math.abs(daysToClose),
            link: `/pipeline/${o.id}`,
          });
        }
      }

      // Stale opportunity — use last_activity_at from DB when available
      const lastDate = o.last_activity_at || o.updated_at || o.created_at;
      const daysSinceActivity = daysBetween(lastDate, now);
      if (daysSinceActivity >= 14 && !o.next_action_due_date) {
        items.push({
          id: `opp-stale-${o.id}`,
          action_type: 'stale_opportunity',
          title: `No activity for ${daysSinceActivity}d`,
          description: `${o.name} · ${o.clients?.name || ''}`,
          due_date: null,
          severity: daysSinceActivity > 30 ? 'urgent' : 'warning',
          owner_id: o.owner_id,
          related_entity_type: 'opportunity',
          related_entity_id: o.id,
          client_id: o.client_id,
          client_name: o.clients?.name || null,
          opportunity_id: o.id,
          dataset_name: o.datasets?.name || null,
          ball_status: ballStatus,
          days_overdue: daysSinceActivity - 14,
          link: `/pipeline/${o.id}`,
        });
      }
    });

    // --- Trials ---
    const trials = allDeliveries.filter((d: any) => d.delivery_type?.toLowerCase() === 'trial');
    trials.forEach((t: any) => {
      if (ownerFilter && t.owner_id !== ownerFilter) return;
      const status = getTrialStatus(t.status, t.trial_start_date, t.trial_end_date, t.opportunities?.stage);
      const daysLeft = getDaysRemaining(t.trial_end_date);

      if (status === 'ending_soon' && daysLeft !== null) {
        items.push({
          id: `trial-ending-${t.id}`,
          action_type: 'trial_ending_soon',
          title: `Trial ending in ${daysLeft}d`,
          description: `${t.clients?.name || ''} · ${t.datasets?.name || ''}`,
          due_date: t.trial_end_date,
          severity: daysLeft <= 2 ? 'urgent' : 'warning',
          owner_id: t.owner_id,
          related_entity_type: 'trial',
          related_entity_id: t.id,
          client_id: t.client_id,
          client_name: t.clients?.name || null,
          opportunity_id: t.opportunity_id,
          dataset_name: t.datasets?.name || null,
          ball_status: 'our_court',
          days_overdue: 0,
          link: t.opportunity_id ? `/pipeline/${t.opportunity_id}` : `/clients/${t.client_id}`,
        });
      }

      if (status === 'expired') {
        items.push({
          id: `trial-expired-${t.id}`,
          action_type: 'trial_expired',
          title: 'Trial expired — follow up',
          description: `${t.clients?.name || ''} · ${t.datasets?.name || ''}`,
          due_date: t.trial_end_date,
          severity: 'urgent',
          owner_id: t.owner_id,
          related_entity_type: 'trial',
          related_entity_id: t.id,
          client_id: t.client_id,
          client_name: t.clients?.name || null,
          opportunity_id: t.opportunity_id,
          dataset_name: t.datasets?.name || null,
          ball_status: 'our_court',
          days_overdue: daysLeft !== null ? Math.abs(daysLeft) : 0,
          link: t.opportunity_id ? `/pipeline/${t.opportunity_id}` : `/clients/${t.client_id}`,
        });
      }
    });

    // --- Renewals ---
    renewals.forEach((r: any) => {
      if (ownerFilter && r.created_by !== ownerFilter) return;
      if (['Renewed', 'Lost'].includes(r.status)) return;
      const daysToRenewal = daysBetween(now, r.renewal_date);
      if (daysToRenewal < 0) {
        items.push({
          id: `renewal-overdue-${r.id}`,
          action_type: 'renewal_due',
          title: `Renewal overdue by ${Math.abs(daysToRenewal)}d`,
          description: `${r.clients?.name || ''} · ${r.datasets?.name || ''}`,
          due_date: r.renewal_date,
          severity: 'urgent',
          owner_id: r.created_by,
          related_entity_type: 'renewal',
          related_entity_id: r.id,
          client_id: r.client_id,
          client_name: r.clients?.name || null,
          opportunity_id: null,
          dataset_name: r.datasets?.name || null,
          ball_status: 'our_court',
          days_overdue: Math.abs(daysToRenewal),
          link: '/renewals',
        });
      } else if (daysToRenewal <= 45) {
        items.push({
          id: `renewal-soon-${r.id}`,
          action_type: 'renewal_due',
          title: `Renewal in ${daysToRenewal}d`,
          description: `${r.clients?.name || ''} · ${r.datasets?.name || ''}`,
          due_date: r.renewal_date,
          severity: daysToRenewal <= 14 ? 'urgent' : daysToRenewal <= 30 ? 'warning' : 'info',
          owner_id: r.created_by,
          related_entity_type: 'renewal',
          related_entity_id: r.id,
          client_id: r.client_id,
          client_name: r.clients?.name || null,
          opportunity_id: null,
          dataset_name: r.datasets?.name || null,
          ball_status: 'our_court',
          days_overdue: 0,
          link: '/renewals',
        });
      }
    });

    // --- Client Inactivity (60 days) ---
    const activeClients = clients.filter((c: any) => c.relationship_status === 'Active Client');
    activeClients.forEach((c: any) => {
      if (ownerFilter && c.owner_id !== ownerFilter) return;
      const lastActivity = lastActivityByClient[c.id];
      const lastDate = lastActivity || c.updated_at || c.created_at;
      const daysSince = daysBetween(lastDate, now);
      if (daysSince >= 60) {
        items.push({
          id: `client-inactive-${c.id}`,
          action_type: 'client_inactive',
          title: `No contact for ${daysSince}d`,
          description: c.name,
          due_date: null,
          severity: daysSince > 90 ? 'urgent' : 'warning',
          owner_id: c.owner_id,
          related_entity_type: 'client',
          related_entity_id: c.id,
          client_id: c.id,
          client_name: c.name,
          opportunity_id: null,
          dataset_name: null,
          ball_status: 'our_court',
          days_overdue: daysSince - 60,
          link: `/clients/${c.id}`,
        });
      }
    });

    // --- Account Action Items (upload contract, document loss reason) ---
    // Admins see all pending contract/loss-reason items regardless of owner
    accountActions.forEach((aa: any) => {
      const actionOwner = aa.opportunities?.owner_id || null;
      if (ownerFilter && actionOwner !== ownerFilter && !isAdmin) return;
      const daysSinceCreated = daysBetween(aa.created_at, now);

      items.push({
        id: `account-action-${aa.id}`,
        action_type: aa.action_type === 'upload_contract' ? 'upload_contract' : 'document_loss_reason',
        title: aa.title,
        description: `${aa.opportunities?.name || ''} · ${aa.clients?.name || ''}`,
        due_date: null,
        severity: daysSinceCreated > 7 ? 'urgent' : 'warning',
        owner_id: actionOwner,
        related_entity_type: 'contract',
        related_entity_id: aa.id,
        client_id: aa.client_id,
        client_name: aa.clients?.name || null,
        opportunity_id: aa.opportunity_id,
        dataset_name: null,
        ball_status: 'our_court',
        days_overdue: daysSinceCreated,
        link: `/clients/${aa.client_id}`,
      });
    });

    // --- Overdue Invoices (unpaid for 5+ days past due) ---
    // Admins see all overdue invoices regardless of owner
    invoices.forEach((inv: Invoice) => {
      if (inv.status !== 'unpaid' || !inv.due_date) return;
      const daysLate = daysBetween(inv.due_date, now);
      if (daysLate < 5) return;
      const invoiceOwner = inv.opportunities?.owner_id || null;
      if (ownerFilter && invoiceOwner !== ownerFilter && !isAdmin) return;

      // Find client name from opportunities join or clients list
      const clientMatch = clients.find((c: any) => c.id === inv.client_id);
      const clientName = clientMatch?.name || null;

      items.push({
        id: `invoice-overdue-${inv.id}`,
        action_type: 'invoice_overdue',
        title: `Invoice unpaid — ${daysLate}d past due`,
        description: `${inv.invoice_number || 'Invoice'} · ${clientName || ''} · ${inv.amount ? new Intl.NumberFormat('en-US', { style: 'currency', currency: inv.currency }).format(inv.amount) : ''}`,
        due_date: inv.due_date,
        severity: daysLate > 14 ? 'urgent' : 'warning',
        owner_id: invoiceOwner,
        related_entity_type: 'invoice',
        related_entity_id: inv.id,
        client_id: inv.client_id,
        client_name: clientName,
        opportunity_id: inv.opportunity_id,
        dataset_name: null,
        ball_status: 'our_court',
        days_overdue: daysLate,
        link: `/clients/${inv.client_id}`,
      });
    });

    // Campaign outreach actions
    (campaignTargets || []).forEach((t: any) => {
      const clientName = t.clients?.name || t.prospect_name || 'Unknown';
      const campaignName = t.campaigns?.name || 'Campaign';
      const daysWaiting = t.created_at ? daysBetween(t.created_at, now) : 0;
      items.push({
        id: `campaign-outreach-${t.id}`,
        action_type: 'campaign_outreach',
        title: `Reach out to ${clientName}`,
        description: `${campaignName}${t.fit_score ? ` · ${t.fit_score}% fit` : ''}${t.recommended_approach ? ` · ${t.recommended_approach.slice(0, 80)}` : ''}`,
        due_date: null,
        severity: daysWaiting > 7 ? 'warning' as ActionSeverity : 'info' as ActionSeverity,
        owner_id: t.owner_id,
        related_entity_type: 'campaign_target',
        related_entity_id: t.id,
        client_id: t.client_id,
        client_name: clientName,
        opportunity_id: t.opportunity_id,
        dataset_name: null,
        ball_status: 'our_court' as BallStatus,
        days_overdue: daysWaiting,
        link: `/campaigns/${t.campaign_id}`,
      });
    });

    // Sort: urgent first, then warning, then info; within same severity by days_overdue desc
    const severityOrder: Record<ActionSeverity, number> = { urgent: 0, warning: 1, info: 2 };
    items.sort((a, b) => {
      const sd = severityOrder[a.severity] - severityOrder[b.severity];
      if (sd !== 0) return sd;
      return b.days_overdue - a.days_overdue;
    });

    // Filter out snoozed/dismissed items using DB data
    return items.filter(item => !isKeySnoozed(dismissals, item.id));
  }, [opportunities, renewals, allDeliveries, clients, activities, invoices, accountActions, campaignTargets, ownerFilter, dismissals]);

  // Summary counts
  const summary = useMemo(() => {
    const urgent = actions.filter(a => a.severity === 'urgent').length;
    const warning = actions.filter(a => a.severity === 'warning').length;
    const overdue = actions.filter(a => a.action_type.includes('overdue') || a.days_overdue > 0).length;
    const ourCourt = actions.filter(a => a.ball_status === 'our_court').length;
    const theirCourt = actions.filter(a => a.ball_status === 'their_court').length;
    return { total: actions.length, urgent, warning, overdue, ourCourt, theirCourt };
  }, [actions]);

  return { actions, summary, isLoading, profiles, handleSnooze, handleDismiss, handleUnsnooze };
}

export function getBallStatusLabel(status: BallStatus): string {
  switch (status) {
    case 'our_court': return 'Our Move';
    case 'their_court': return 'Their Move';
    case 'neutral': return 'Open Loop';
    case 'closed_won': return 'Game Set Match';
    case 'closed_lost': return 'Game Over';
    case 'unknown': return '—';
  }
}

export function getBallStatusColor(status: BallStatus): string {
  switch (status) {
    case 'our_court': return 'bg-success/10 text-success';
    case 'their_court': return 'bg-info/10 text-info';
    case 'neutral': return 'bg-muted text-muted-foreground';
    case 'closed_won': return 'bg-success/15 text-success';
    case 'closed_lost': return 'bg-destructive/10 text-destructive';
    case 'unknown': return 'bg-muted text-muted-foreground';
  }
}

export function getBallStatusIcon(status: BallStatus): string {
  switch (status) {
    case 'our_court': return '🟢';
    case 'their_court': return '🔵';
    case 'neutral': return '⚪';
    case 'closed_won': return '🏆';
    case 'closed_lost': return '🔴';
    case 'unknown': return '⚫';
  }
}
