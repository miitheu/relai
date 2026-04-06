import { useState, useMemo } from 'react';
import { useAdminUsers, useReassignOwnership } from '@/hooks/useAdminUsers';
import { useLogAdminAction } from '@/hooks/useAdminAudit';
import { useAuth } from '@/contexts/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowRight, AlertTriangle } from 'lucide-react';
import { useSupabase } from '@/hooks/useSupabase';
import { useQuery } from '@tanstack/react-query';

export default function OwnershipTab() {
  const supabase = useSupabase();
  const { data: users } = useAdminUsers();
  const [fromUser, setFromUser] = useState('');
  const [toUser, setToUser] = useState('');
  const [types, setTypes] = useState<string[]>(['opportunities', 'clients', 'deliveries']);
  const [confirming, setConfirming] = useState(false);
  const reassign = useReassignOwnership();
  const logAction = useLogAdminAction();
  const { user } = useAuth();
  const { toast } = useToast();

  // Fetch impact counts for the selected source user
  const { data: impact } = useQuery({
    queryKey: ['ownership-impact', fromUser],
    enabled: !!fromUser,
    queryFn: async () => {
      const [opps, clients, deliveries] = await Promise.all([
        supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('owner_id', fromUser).not('stage', 'in', '("Closed Won","Closed Lost")'),
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('owner_id', fromUser),
        supabase.from('deliveries').select('id', { count: 'exact', head: true }).eq('owner_id', fromUser),
      ]);
      return {
        opportunities: opps.count || 0,
        clients: clients.count || 0,
        deliveries: deliveries.count || 0,
      };
    },
  });

  const activeUsers = useMemo(() => (users || []).filter(u => u.is_active), [users]);
  const fromProfile = activeUsers.find(u => u.user_id === fromUser);
  const toProfile = activeUsers.find(u => u.user_id === toUser);

  const toggleType = (t: string) => {
    setTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const handleReassign = async () => {
    if (!fromUser || !toUser || types.length === 0) return;
    try {
      await reassign.mutateAsync({ fromUserId: fromUser, toUserId: toUser, types });
      await logAction.mutateAsync({
        action: 'ownership_reassigned',
        entity_type: 'bulk',
        details: { from: fromProfile?.full_name, to: toProfile?.full_name, types },
        performed_by: user!.id,
      });
      toast({ title: 'Ownership reassigned', description: `Records transferred to ${toProfile?.full_name}` });
      setConfirming(false);
      setFromUser('');
      setToUser('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h3 className="text-sm font-medium">Reassign Ownership</h3>
        <p className="text-xs text-muted-foreground mt-1">Transfer opportunities, clients, and deliveries between users.</p>
      </div>

      <div className="grid grid-cols-[1fr,auto,1fr] gap-3 items-end">
        <div className="space-y-1.5">
          <Label className="text-xs">From</Label>
          <Select value={fromUser} onValueChange={v => { setFromUser(v); setConfirming(false); }}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select user" /></SelectTrigger>
            <SelectContent>
              {activeUsers.map(u => (
                <SelectItem key={u.user_id} value={u.user_id}>{u.full_name || u.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ArrowRight size={16} className="text-muted-foreground mb-1" />
        <div className="space-y-1.5">
          <Label className="text-xs">To</Label>
          <Select value={toUser} onValueChange={v => { setToUser(v); setConfirming(false); }}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select user" /></SelectTrigger>
            <SelectContent>
              {activeUsers.filter(u => u.user_id !== fromUser).map(u => (
                <SelectItem key={u.user_id} value={u.user_id}>{u.full_name || u.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {fromUser && impact && (
        <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
          <h4 className="text-sm font-medium">Impact Summary for {fromProfile?.full_name}</h4>
          <div className="space-y-2">
            {[
              { key: 'opportunities', label: 'Open Opportunities', count: impact.opportunities },
              { key: 'clients', label: 'Owned Clients', count: impact.clients },
              { key: 'deliveries', label: 'Deliveries', count: impact.deliveries },
            ].map(item => (
              <label key={item.key} className="flex items-center gap-3 text-sm">
                <Checkbox
                  checked={types.includes(item.key)}
                  onCheckedChange={() => toggleType(item.key)}
                />
                <span>{item.label}</span>
                <span className="ml-auto text-muted-foreground tabular-nums font-medium">{item.count}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {fromUser && toUser && types.length > 0 && !confirming && (
        <Button onClick={() => setConfirming(true)} variant="outline" size="sm">
          Review & Confirm
        </Button>
      )}

      {confirming && (
        <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle size={14} /> Confirm Reassignment
          </div>
          <p className="text-xs text-muted-foreground">
            This will transfer {types.join(', ')} from <strong>{fromProfile?.full_name}</strong> to <strong>{toProfile?.full_name}</strong>. This action cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={handleReassign} disabled={reassign.isPending}>
              {reassign.isPending ? 'Reassigning...' : 'Confirm Reassignment'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
