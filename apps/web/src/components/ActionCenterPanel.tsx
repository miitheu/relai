import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActionCenter, ActionItem, ActionSeverity } from '@/hooks/useActionCenter';
import BallStatusBadge from './BallStatusBadge';
import { X, AlertTriangle, AlertCircle, Info, Clock, TrendingUp, RefreshCw, Database, Building2, MessageSquarePlus, CalendarClock, BellOff, Check, Megaphone } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useInteraction } from '@/contexts/InteractionContext';

interface Props {
  open: boolean;
  onClose: () => void;
}

const severityConfig: Record<ActionSeverity, { icon: any; cls: string }> = {
  urgent: { icon: AlertCircle, cls: 'text-destructive' },
  warning: { icon: AlertTriangle, cls: 'text-warning' },
  info: { icon: Info, cls: 'text-info' },
};

const typeIcons: Record<string, any> = {
  follow_up_overdue: Clock,
  follow_up_due: Clock,
  close_date_approaching: TrendingUp,
  stale_opportunity: AlertTriangle,
  trial_ending_soon: Database,
  trial_expired: Database,
  renewal_due: RefreshCw,
  client_inactive: Building2,
  campaign_outreach: Megaphone,
};

export default function ActionCenterPanel({ open, onClose }: Props) {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { open: openInteraction } = useInteraction();
  const { actions, summary, isLoading, handleSnooze, handleDismiss } = useActionCenter(user?.id, role === 'admin');
  const [filter, setFilter] = useState<'all' | 'urgent' | 'warning' | 'info'>('all');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  if (!open) return null;

  const filtered = filter === 'all' ? actions : actions.filter(a => a.severity === filter);

  const handleClick = (item: ActionItem) => {
    if (expandedItem === item.id) {
      setExpandedItem(null);
    } else {
      setExpandedItem(item.id);
    }
  };

  const handleNavigate = (item: ActionItem) => {
    navigate(item.link);
    onClose();
  };

  const handleLogInteraction = (item: ActionItem) => {
    openInteraction({
      client_id: item.client_id || undefined,
      opportunity_id: item.opportunity_id || undefined,
    });
    onClose();
  };

  const handleScheduleFollowUp = (item: ActionItem) => {
    if (item.opportunity_id) {
      navigate(`/pipeline/${item.opportunity_id}`);
    } else if (item.client_id) {
      navigate(`/clients/${item.client_id}`);
    }
    onClose();
  };

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-card border-l border-border z-50 flex flex-col shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h2 className="text-sm font-semibold">Action Center</h2>
          <p className="text-[11px] text-muted-foreground">
            {summary.total === 0 ? "You're all caught up" : `${summary.total} items need attention`}
          </p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted transition-colors">
          <X size={16} className="text-muted-foreground" />
        </button>
      </div>

      {/* Summary strip */}
      {summary.total > 0 && (
        <div className="flex gap-2 px-4 py-2 border-b border-border bg-muted/30">
          <FilterChip label={`All ${summary.total}`} active={filter === 'all'} onClick={() => setFilter('all')} />
          {summary.urgent > 0 && <FilterChip label={`🔴 ${summary.urgent}`} active={filter === 'urgent'} onClick={() => setFilter('urgent')} />}
          {summary.warning > 0 && <FilterChip label={`🟡 ${summary.warning}`} active={filter === 'warning'} onClick={() => setFilter('warning')} />}
        </div>
      )}

      {/* Items */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 px-6">
            <div className="text-3xl mb-3">✅</div>
            <p className="text-sm font-medium text-foreground">You're all caught up</p>
            <p className="text-xs text-muted-foreground mt-1">No follow-ups due, no trials expiring, no stale deals.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(item => {
              const SevIcon = severityConfig[item.severity].icon;
              const TypeIcon = typeIcons[item.action_type] || Clock;
              const isExpanded = expandedItem === item.id;
              return (
                <div key={item.id}>
                  <button
                    onClick={() => handleClick(item)}
                    className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors group"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 ${severityConfig[item.severity].cls}`}>
                        <TypeIcon size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-medium truncate">{item.title}</p>
                          <BallStatusBadge status={item.ball_status} size="sm" />
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                        {item.due_date && (
                          <p className="text-[10px] text-muted-foreground mt-1 font-mono">{item.due_date}</p>
                        )}
                      </div>
                      <SevIcon size={12} className={`${severityConfig[item.severity].cls} shrink-0 mt-1 opacity-50`} />
                    </div>
                  </button>

                  {/* Quick Actions */}
                  {isExpanded && (
                    <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                      <QuickActionBtn
                        icon={MessageSquarePlus}
                        label="Log Interaction"
                        onClick={() => handleLogInteraction(item)}
                      />
                      <QuickActionBtn
                        icon={CalendarClock}
                        label="Schedule Follow-up"
                        onClick={() => handleScheduleFollowUp(item)}
                      />
                      <QuickActionBtn
                        icon={BellOff}
                        label="Snooze 3d"
                        onClick={() => handleSnooze(item.id, 3)}
                        variant="muted"
                      />
                      <QuickActionBtn
                        icon={BellOff}
                        label="Snooze 7d"
                        onClick={() => handleSnooze(item.id, 7)}
                        variant="muted"
                      />
                      <QuickActionBtn
                        icon={Check}
                        label="Dismiss"
                        onClick={() => handleDismiss(item.id)}
                        variant="muted"
                      />
                      <QuickActionBtn
                        icon={TrendingUp}
                        label="Open"
                        onClick={() => handleNavigate(item)}
                        variant="primary"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
        active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function QuickActionBtn({ icon: Icon, label, onClick, variant = 'default' }: { icon: any; label: string; onClick: () => void; variant?: 'default' | 'muted' | 'primary' }) {
  const cls = variant === 'primary'
    ? 'bg-primary/10 text-primary hover:bg-primary/20'
    : variant === 'muted'
    ? 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80';
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${cls}`}
    >
      <Icon size={10} />
      {label}
    </button>
  );
}
