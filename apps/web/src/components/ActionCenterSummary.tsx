import { useNavigate } from 'react-router-dom';
import { useActionCenter, ActionItem, ActionSeverity } from '@/hooks/useActionCenter';
import BallStatusBadge from './BallStatusBadge';
import { AlertCircle, AlertTriangle, Clock, TrendingUp, RefreshCw, Database, ArrowUpRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const typeIcons: Record<string, any> = {
  follow_up_overdue: Clock,
  follow_up_due: Clock,
  close_date_approaching: TrendingUp,
  stale_opportunity: AlertTriangle,
  trial_ending_soon: Database,
  trial_expired: Database,
  renewal_due: RefreshCw,
  client_inactive: AlertTriangle,
};

const severityColors: Record<ActionSeverity, string> = {
  urgent: 'text-destructive',
  warning: 'text-warning',
  info: 'text-info',
};

export default function ActionCenterSummary({ onOpenPanel }: { onOpenPanel: () => void }) {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { actions, summary, isLoading } = useActionCenter(user?.id, role === 'admin');

  if (isLoading) return null;

  const topItems = actions.slice(0, 6);

  const typeBreakdown = actions.reduce((acc, a) => {
    const label = getTypeLabel(a.action_type);
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (summary.total === 0) {
    return (
      <div className="data-card">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">✅</span>
          <h3 className="text-sm font-medium">Action Center</h3>
        </div>
        <p className="text-xs text-muted-foreground">You're all caught up. No items need attention.</p>
      </div>
    );
  }

  return (
    <div className="data-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertCircle size={14} className={summary.urgent > 0 ? 'text-destructive' : 'text-warning'} />
          <h3 className="text-sm font-medium">Action Center</h3>
          <span className={`status-badge ${summary.urgent > 0 ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}`}>
            {summary.total}
          </span>
        </div>
        <button onClick={onOpenPanel} className="text-xs text-primary hover:underline flex items-center gap-1">
          View all <ArrowUpRight size={12} />
        </button>
      </div>

      {/* Breakdown chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {Object.entries(typeBreakdown).map(([label, count]) => (
          <span key={label} className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground">
            {count} {label}
          </span>
        ))}
      </div>

      {/* Top items */}
      <div className="space-y-1">
        {topItems.map(item => {
          const TypeIcon = typeIcons[item.action_type] || Clock;
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.link)}
              className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors group"
            >
              <TypeIcon size={12} className={severityColors[item.severity]} />
              <span className="text-xs truncate flex-1">{item.title}</span>
              <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">{item.client_name}</span>
              <BallStatusBadge status={item.ball_status} size="sm" showIcon={false} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function getTypeLabel(type: string): string {
  const map: Record<string, string> = {
    follow_up_overdue: 'overdue',
    follow_up_due: 'due today',
    close_date_approaching: 'closing soon',
    stale_opportunity: 'stale deals',
    trial_ending_soon: 'trials ending',
    trial_expired: 'trials expired',
    renewal_due: 'renewals',
    client_inactive: 'inactive clients',
  };
  return map[type] || type;
}
