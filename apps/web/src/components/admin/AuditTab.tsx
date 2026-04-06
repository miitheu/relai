import { useAuditLog } from '@/hooks/useAdminAudit';
import { useAdminUsers } from '@/hooks/useAdminUsers';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ClipboardList } from 'lucide-react';

const actionLabels: Record<string, string> = {
  user_created: 'User Created',
  user_activated: 'User Activated',
  user_deactivated: 'User Deactivated',
  role_changed: 'Role Changed',
  ownership_reassigned: 'Ownership Reassigned',
  config_changed: 'Config Changed',
};

export default function AuditTab() {
  const { data: logs, isLoading } = useAuditLog();
  const { data: users } = useAdminUsers();

  const getUserName = (id: string) => {
    const u = users?.find(u => u.user_id === id);
    return u?.full_name || u?.email || id?.slice(0, 8);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium">Audit Log</h3>
        <p className="text-xs text-muted-foreground mt-1">Recent administrative actions.</p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Loading audit log...</div>
      ) : !logs?.length ? (
        <div className="text-center py-12">
          <ClipboardList size={32} className="mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No audit entries yet</p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Performed By</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {actionLabels[log.action] || log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">
                    {log.details ? formatDetails(log.action, log.details) : '—'}
                  </TableCell>
                  <TableCell className="text-sm">{getUserName(log.performed_by)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(log.created_at), 'MMM d, yyyy HH:mm')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function formatDetails(action: string, details: any): string {
  if (!details) return '—';
  switch (action) {
    case 'user_created':
      return `${details.full_name} (${details.email}) as ${details.role}`;
    case 'role_changed':
      return `${details.from} → ${details.to}`;
    case 'ownership_reassigned':
      return `${details.from} → ${details.to} (${details.types?.join(', ')})`;
    case 'user_activated':
    case 'user_deactivated':
      return `Status set to ${details.is_active ? 'active' : 'inactive'}`;
    default:
      return JSON.stringify(details).slice(0, 80);
  }
}
