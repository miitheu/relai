import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { AdminUser, useUpdateUserRole, useUpdateUserProfile, useToggleUserStatus } from '@/hooks/useAdminUsers';
import { useLogAdminAction } from '@/hooks/useAdminAudit';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { AlertTriangle } from 'lucide-react';

interface Props {
  user: AdminUser | null;
  onClose: () => void;
}

export default function UserDetailSheet({ user, onClose }: Props) {
  const [role, setRole] = useState('');
  const [team, setTeam] = useState('');
  const [fullName, setFullName] = useState('');
  const updateRole = useUpdateUserRole();
  const updateProfile = useUpdateUserProfile();
  const toggleStatus = useToggleUserStatus();
  const logAction = useLogAdminAction();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      setRole(user.role);
      setTeam(user.team || '');
      setFullName(user.full_name);
    }
  }, [user]);

  if (!user) return null;

  const isSelf = currentUser?.id === user.user_id;

  const handleSave = async () => {
    try {
      const promises: Promise<any>[] = [];
      if (role !== user.role) {
        promises.push(updateRole.mutateAsync({ userId: user.user_id, role }));
        promises.push(logAction.mutateAsync({
          action: 'role_changed',
          entity_type: 'user',
          entity_id: user.user_id,
          details: { from: user.role, to: role },
          performed_by: currentUser!.id,
        }));
      }
      if (team !== (user.team || '') || fullName !== user.full_name) {
        promises.push(updateProfile.mutateAsync({
          userId: user.user_id,
          updates: { team: team || null, full_name: fullName },
        }));
      }
      await Promise.all(promises);
      toast({ title: 'User updated' });
      onClose();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleToggleStatus = async () => {
    try {
      await toggleStatus.mutateAsync({ userId: user.user_id, isActive: !user.is_active });
      toast({ title: user.is_active ? 'User deactivated' : 'User activated' });
      onClose();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const isPending = updateRole.isPending || updateProfile.isPending || toggleStatus.isPending;

  return (
    <Sheet open={!!user} onOpenChange={() => onClose()}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>User Details</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Info section */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input value={fullName} onChange={e => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={user.email} disabled className="bg-muted/50" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={role} onValueChange={setRole} disabled={isSelf}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="sales_manager">Sales Manager</SelectItem>
                    <SelectItem value="sales_rep">Sales Rep</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Team</Label>
                <Input value={team} onChange={e => setTeam(e.target.value)} placeholder="e.g. Sales" />
              </div>
            </div>
          </div>

          <Separator />

          {/* Ownership summary */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Ownership Summary</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="p-3 rounded-md bg-muted/50">
                <div className="text-lg font-semibold tabular-nums">{user.open_opportunities}</div>
                <div className="text-xs text-muted-foreground">Open Opportunities</div>
              </div>
              <div className="p-3 rounded-md bg-muted/50">
                <div className="text-lg font-semibold tabular-nums">{user.owned_clients}</div>
                <div className="text-xs text-muted-foreground">Owned Clients</div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Meta */}
          <div className="space-y-1 text-xs text-muted-foreground">
            <div>Created: {format(new Date(user.created_at), 'MMM d, yyyy HH:mm')}</div>
            <div>Status: <Badge variant={user.is_active ? 'outline' : 'destructive'} className="text-xs ml-1">{user.is_active ? 'Active' : 'Inactive'}</Badge></div>
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button onClick={handleSave} disabled={isPending} size="sm">
              {isPending ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          </div>

          {!isSelf && (
            <div className="pt-2">
              <Button
                variant={user.is_active ? 'destructive' : 'outline'}
                size="sm"
                onClick={handleToggleStatus}
                disabled={isPending}
                className="w-full"
              >
                <AlertTriangle size={14} />
                {user.is_active ? 'Deactivate User' : 'Activate User'}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
