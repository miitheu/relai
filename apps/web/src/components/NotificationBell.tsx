import { useState } from 'react';
import { useNotifications, useUnreadCount, useMarkNotificationRead, useMarkAllRead, useDeleteNotification, useClearAllNotifications } from '@/hooks/useNotifications';
import { Bell, X, CheckCheck, AlertCircle, AlertTriangle, Info, TrendingUp, RefreshCw, Database, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const typeIcons: Record<string, any> = {
  stale_opportunity: AlertTriangle,
  trial_ending: Database,
  renewal_due: RefreshCw,
  new_filing: TrendingUp,
  task_overdue: AlertCircle,
};

const severityColors: Record<string, string> = {
  urgent: 'text-destructive',
  warning: 'text-warning',
  info: 'text-info',
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: notifications = [] } = useNotifications();
  const { data: unreadCount = 0 } = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllRead();
  const deleteNotification = useDeleteNotification();
  const clearAll = useClearAllNotifications();
  const navigate = useNavigate();

  const handleClick = (n: any) => {
    if (!n.is_read) markRead.mutate(n.id);
    if (n.link) {
      navigate(n.link);
      setOpen(false);
    }
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteNotification.mutate(id);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 rounded-md hover:bg-muted transition-colors"
      >
        <Bell size={16} className="text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-80 bg-card border border-border rounded-lg shadow-xl z-50 max-h-96 flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="text-sm font-medium">Notifications</span>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button onClick={() => markAllRead.mutate()} className="p-0.5 rounded hover:bg-muted" title="Mark all read">
                    <CheckCheck size={12} className="text-primary" />
                  </button>
                )}
                {notifications.length > 0 && (
                  <button onClick={() => clearAll.mutate()} className="p-0.5 rounded hover:bg-muted" title="Clear all">
                    <Trash2 size={12} className="text-muted-foreground hover:text-destructive" />
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="p-0.5 rounded hover:bg-muted">
                  <X size={12} className="text-muted-foreground" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <div className="py-8 text-center">
                  <Bell size={20} className="text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No notifications</p>
                </div>
              ) : (
                notifications.map((n: any) => {
                  const Icon = typeIcons[n.notification_type] || Info;
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleClick(n)}
                      className={`group w-full text-left px-3 py-2.5 border-b border-border hover:bg-muted/50 transition-colors cursor-pointer ${!n.is_read ? 'bg-primary/5' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        <Icon size={12} className={`mt-0.5 shrink-0 ${severityColors[n.severity] || 'text-muted-foreground'}`} />
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs ${!n.is_read ? 'font-medium' : ''} truncate`}>{n.title}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{n.message}</p>
                          <p className="text-[9px] text-muted-foreground mt-0.5">
                            {new Date(n.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!n.is_read && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                          <button
                            onClick={(e) => handleDelete(e, n.id)}
                            className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity"
                            title="Delete"
                          >
                            <X size={10} className="text-muted-foreground hover:text-destructive" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
