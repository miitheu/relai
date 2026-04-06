import { formatDistanceToNow, format } from 'date-fns';
import { 
  Activity, MessageSquare, Calendar, Mail, Phone, 
  FileText, TrendingUp, Truck, RefreshCw, Users
} from 'lucide-react';

interface ClientTimelineProps {
  activities: any[];
  notes: any[];
  opportunities: any[];
  deliveries: any[];
  renewals: any[];
}

interface TimelineItem {
  id: string;
  type: 'activity' | 'note' | 'opportunity' | 'delivery' | 'renewal';
  icon: React.ElementType;
  title: string;
  description?: string;
  date: Date;
  metadata?: Record<string, any>;
}

export default function ClientTimeline({
  activities,
  notes,
  opportunities,
  deliveries,
  renewals,
}: ClientTimelineProps) {
  // Combine all items into a unified timeline
  const timelineItems: TimelineItem[] = [];
  
  // Activities
  activities.forEach(a => {
    let icon = Activity;
    if (a.activity_type === 'email') icon = Mail;
    if (a.activity_type === 'call') icon = Phone;
    if (a.activity_type === 'meeting') icon = Calendar;
    if (a.activity_type === 'note') icon = FileText;
    
    timelineItems.push({
      id: `activity-${a.id}`,
      type: 'activity',
      icon,
      title: a.activity_type.charAt(0).toUpperCase() + a.activity_type.slice(1),
      description: a.description,
      date: new Date(a.created_at),
    });
  });
  
  // Notes
  notes.forEach(n => {
    timelineItems.push({
      id: `note-${n.id}`,
      type: 'note',
      icon: MessageSquare,
      title: 'Note Added',
      description: n.content,
      date: new Date(n.created_at),
    });
  });
  
  // Opportunity stage changes (from created_at and major events)
  opportunities.forEach(o => {
    timelineItems.push({
      id: `opp-created-${o.id}`,
      type: 'opportunity',
      icon: TrendingUp,
      title: 'Opportunity Created',
      description: `${o.name} - ${o.stage}`,
      date: new Date(o.created_at),
      metadata: { stage: o.stage },
    });
  });
  
  // Deliveries
  deliveries.forEach(d => {
    const isTrial = d.delivery_type?.toLowerCase() === 'trial';
    timelineItems.push({
      id: `delivery-${d.id}`,
      type: 'delivery',
      icon: Truck,
      title: isTrial ? 'Trial Started' : 'Delivery Made',
      description: `${d.datasets?.name || 'Dataset'} via ${d.delivery_method}`,
      date: new Date(d.delivery_date),
      metadata: { type: d.delivery_type },
    });
  });
  
  // Renewals
  renewals.forEach(r => {
    if (r.status === 'Renewed') {
      timelineItems.push({
        id: `renewal-${r.id}`,
        type: 'renewal',
        icon: RefreshCw,
        title: 'Contract Renewed',
        description: `${r.datasets?.name || 'Dataset'}`,
        date: new Date(r.renewal_date),
      });
    }
  });
  
  // Sort by date descending
  timelineItems.sort((a, b) => b.date.getTime() - a.date.getTime());
  
  // Group by date
  const groupedByDate: Record<string, TimelineItem[]> = {};
  timelineItems.forEach(item => {
    const dateKey = format(item.date, 'yyyy-MM-dd');
    if (!groupedByDate[dateKey]) groupedByDate[dateKey] = [];
    groupedByDate[dateKey].push(item);
  });
  
  const dateGroups = Object.entries(groupedByDate).slice(0, 20); // Limit to recent 20 days
  
  const typeColors: Record<string, string> = {
    activity: 'bg-info/10 text-info border-info/20',
    note: 'bg-muted text-muted-foreground border-border',
    opportunity: 'bg-primary/10 text-primary border-primary/20',
    delivery: 'bg-warning/10 text-warning border-warning/20',
    renewal: 'bg-success/10 text-success border-success/20',
  };
  
  if (timelineItems.length === 0) {
    return (
      <div className="text-center py-12">
        <Activity size={32} className="mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground">No activity recorded yet</p>
        <p className="text-xs text-muted-foreground mt-1">Activities, notes, and events will appear here</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {dateGroups.map(([dateKey, items]) => {
        const date = new Date(dateKey);
        const isToday = format(new Date(), 'yyyy-MM-dd') === dateKey;
        const isYesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd') === dateKey;
        
        let dateLabel = format(date, 'EEEE, MMMM d');
        if (isToday) dateLabel = 'Today';
        if (isYesterday) dateLabel = 'Yesterday';
        
        return (
          <div key={dateKey}>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              {dateLabel}
            </h4>
            <div className="space-y-3 border-l-2 border-border pl-4 ml-2">
              {items.map(item => {
                const Icon = item.icon;
                return (
                  <div key={item.id} className="relative">
                    {/* Timeline dot */}
                    <div className={`absolute -left-[22px] w-3 h-3 rounded-full ${
                      item.type === 'activity' ? 'bg-info' :
                      item.type === 'note' ? 'bg-muted-foreground' :
                      item.type === 'opportunity' ? 'bg-primary' :
                      item.type === 'delivery' ? 'bg-warning' :
                      'bg-success'
                    }`} />
                    
                    <div className={`p-3 rounded-lg border ${typeColors[item.type]}`}>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-background border flex items-center justify-center shrink-0">
                          <Icon size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{item.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {format(item.date, 'h:mm a')}
                            </span>
                          </div>
                          {item.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {item.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
