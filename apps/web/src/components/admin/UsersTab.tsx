import { useState } from 'react';
import { useAdminUsers, AdminUser } from '@/hooks/useAdminUsers';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, UserCircle } from 'lucide-react';
import { format } from 'date-fns';
import CreateUserDialog from './CreateUserDialog';
import UserDetailSheet from './UserDetailSheet';

const roleBadgeVariant: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  admin: 'default',
  sales_manager: 'secondary',
  sales_rep: 'outline',
  viewer: 'outline',
};

export default function UsersTab() {
  const { data: users, isLoading } = useAdminUsers();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  const filtered = (users || []).filter(u => {
    if (search) {
      const q = search.toLowerCase();
      if (!u.full_name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
    }
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (statusFilter === 'active' && !u.is_active) return false;
    if (statusFilter === 'inactive' && u.is_active) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[140px] h-9 text-sm">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="sales_manager">Sales Manager</SelectItem>
            <SelectItem value="sales_rep">Sales Rep</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px] h-9 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setShowCreate(true)} className="ml-auto">
          <Plus size={14} /> New User
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Loading users...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <UserCircle size={32} className="mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            {search || roleFilter !== 'all' || statusFilter !== 'all' ? 'No users match your filters' : 'No users found'}
          </p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Opps</TableHead>
                <TableHead className="text-right">Clients</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(u => (
                <TableRow
                  key={u.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedUser(u)}
                >
                  <TableCell className="font-medium">{u.full_name || '—'}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant={roleBadgeVariant[u.role] || 'outline'} className="text-xs capitalize">
                      {u.role.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{u.team || '—'}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center gap-1.5 text-xs ${u.is_active ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{u.open_opportunities}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{u.owned_clients}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{format(new Date(u.created_at), 'MMM d, yyyy')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateUserDialog open={showCreate} onOpenChange={setShowCreate} />
      <UserDetailSheet user={selectedUser} onClose={() => setSelectedUser(null)} />
    </div>
  );
}
