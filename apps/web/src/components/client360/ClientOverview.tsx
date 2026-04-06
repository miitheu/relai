import { formatCurrency } from '@/data/mockData';
import { useCurrencyRerender } from '@/hooks/useCurrencyRerender';
import { TrendingUp, Users, Radar, Truck, RefreshCw, Calendar, Target, Activity } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ClientOverviewProps {
  client: any;
  contacts: any[];
  opportunities: any[];
  signals: any[];
  deliveries: any[];
  renewals: any[];
  activities: any[];
}

export default function ClientOverview({
  client,
  contacts,
  opportunities,
  signals,
  deliveries,
  renewals,
  activities,
}: ClientOverviewProps) {
  useCurrencyRerender();
  const activeOpps = opportunities.filter((o: any) => !['Closed Won', 'Closed Lost'].includes(o.stage));
  const pipelineValue = activeOpps.reduce((s: number, o: any) => s + Number(o.value), 0);
  const activeTrials = deliveries.filter((d: any) => d.delivery_type?.toLowerCase() === 'trial' && d.status === 'active');
  const upcomingRenewals = renewals.filter((r: any) => r.status === 'Upcoming' || r.status === 'Negotiation');
  
  const lastActivity = activities[0];
  const lastInteraction = lastActivity ? formatDistanceToNow(new Date(lastActivity.created_at), { addSuffix: true }) : 'Never';
  
  // Calculate ball status distribution
  const ballStatusCounts = activeOpps.reduce((acc: any, o: any) => {
    const status = o.ball_status || 'unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  
  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Pipeline Value"
          value={formatCurrency(pipelineValue)}
          icon={TrendingUp}
          subtext={`${activeOpps.length} active deals`}
          color="primary"
        />
        <MetricCard
          label="Contacts"
          value={contacts.length.toString()}
          icon={Users}
          subtext={`${contacts.filter(c => c.relationship_strength === 'Strong').length} strong relationships`}
          color="info"
        />
        <MetricCard
          label="Active Trials"
          value={activeTrials.length.toString()}
          icon={Truck}
          subtext={activeTrials.length > 0 ? 'Datasets being evaluated' : 'No active trials'}
          color="warning"
        />
        <MetricCard
          label="Renewals"
          value={upcomingRenewals.length.toString()}
          icon={RefreshCw}
          subtext={upcomingRenewals.length > 0 ? 'Upcoming or in negotiation' : 'No pending renewals'}
          color="success"
        />
      </div>
      
      {/* Secondary Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="data-card">
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={14} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Last Activity</span>
          </div>
          <p className="text-sm font-medium">{lastInteraction}</p>
          {lastActivity && (
            <p className="text-xs text-muted-foreground mt-1 truncate">{lastActivity.description}</p>
          )}
        </div>
        
        <div className="data-card">
          <div className="flex items-center gap-2 mb-2">
            <Radar size={14} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Research Signals</span>
          </div>
          <p className="text-sm font-medium">{signals.length} signals</p>
          <p className="text-xs text-muted-foreground mt-1">
            {signals.filter(s => s.strength === 'High').length} high priority
          </p>
        </div>
        
        <div className="data-card">
          <div className="flex items-center gap-2 mb-2">
            <Target size={14} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Ball Status</span>
          </div>
          <div className="flex gap-2">
            {ballStatusCounts.our_court > 0 && (
              <span className="text-xs bg-success/10 text-success px-1.5 py-0.5 rounded">
                {ballStatusCounts.our_court} ours
              </span>
            )}
            {ballStatusCounts.their_court > 0 && (
              <span className="text-xs bg-warning/10 text-warning px-1.5 py-0.5 rounded">
                {ballStatusCounts.their_court} theirs
              </span>
            )}
            {ballStatusCounts.unknown > 0 && (
              <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                {ballStatusCounts.unknown} unknown
              </span>
            )}
          </div>
        </div>
        
        <div className="data-card">
          <div className="flex items-center gap-2 mb-2">
            <Activity size={14} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Relationship Health</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${
              client.relationship_status === 'Active Client' ? 'text-success' :
              client.relationship_status === 'Strategic' ? 'text-primary' :
              client.relationship_status === 'Prospect' ? 'text-info' :
              'text-muted-foreground'
            }`}>
              {client.relationship_status}
            </span>
          </div>
        </div>
      </div>
      
      {/* Recent Activity Feed */}
      <div className="data-card">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Activity size={14} /> Recent Activity
        </h3>
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent activity</p>
        ) : (
          <div className="space-y-3">
            {activities.slice(0, 5).map((activity: any) => (
              <div key={activity.id} className="flex gap-3 text-sm">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Activity size={12} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{activity.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                    <span className="mx-1">·</span>
                    <span className="capitalize">{activity.activity_type}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ 
  label, 
  value, 
  icon: Icon, 
  subtext, 
  color 
}: { 
  label: string; 
  value: string; 
  icon: React.ElementType; 
  subtext: string; 
  color: 'primary' | 'success' | 'warning' | 'info';
}) {
  const colorClasses = {
    primary: 'text-primary bg-primary/10',
    success: 'text-success bg-success/10',
    warning: 'text-warning bg-warning/10',
    info: 'text-info bg-info/10',
  };
  
  return (
    <div className="data-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
        <div className={`w-6 h-6 rounded flex items-center justify-center ${colorClasses[color]}`}>
          <Icon size={12} />
        </div>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{subtext}</p>
    </div>
  );
}
