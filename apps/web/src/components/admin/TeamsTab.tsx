import { useMemo, useState } from 'react';
import { useAdminUsers, useUpdateUserProfile } from '@/hooks/useAdminUsers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Users } from 'lucide-react';

export default function TeamsTab() {
  const { data: users } = useAdminUsers();
  const updateProfile = useUpdateUserProfile();
  const { toast } = useToast();

  const teams = useMemo(() => {
    const map = new Map<string, typeof users>();
    (users || []).forEach(u => {
      const t = u.team || 'Unassigned';
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(u);
    });
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === 'Unassigned') return 1;
      if (b === 'Unassigned') return -1;
      return a.localeCompare(b);
    });
  }, [users]);

  const allTeamNames = useMemo(() => {
    const names = new Set<string>();
    (users || []).forEach(u => { if (u.team) names.add(u.team); });
    return Array.from(names).sort();
  }, [users]);

  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [newTeam, setNewTeam] = useState('');

  const handleTeamChange = async (userId: string, team: string) => {
    try {
      await updateProfile.mutateAsync({ userId, updates: { team: team || null } });
      toast({ title: 'Team updated' });
      setEditingUser(null);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium">Team Management</h3>
        <p className="text-xs text-muted-foreground mt-1">View team composition and reassign users between teams.</p>
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-12">
          <Users size={32} className="mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No teams configured</p>
        </div>
      ) : (
        <div className="space-y-6">
          {teams.map(([teamName, members]) => (
            <div key={teamName} className="border rounded-lg">
              <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
                <h4 className="text-sm font-medium">{teamName}</h4>
                <Badge variant="secondary" className="text-xs">{members!.length}</Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Team</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members!.map(u => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium text-sm">{u.full_name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs capitalize">{u.role.replace('_', ' ')}</Badge></TableCell>
                      <TableCell>
                        <span className={`text-xs ${u.is_active ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {editingUser === u.id ? (
                          <div className="flex items-center gap-2">
                            <Select value={newTeam} onValueChange={setNewTeam}>
                              <SelectTrigger className="h-7 text-xs w-[120px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">Unassigned</SelectItem>
                                {allTeamNames.map(t => (
                                  <SelectItem key={t} value={t}>{t}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleTeamChange(u.user_id, newTeam)}>
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingUser(null)}>
                              ✕
                            </Button>
                          </div>
                        ) : (
                          <button
                            className="text-xs text-primary hover:underline"
                            onClick={() => { setEditingUser(u.id); setNewTeam(u.team || ''); }}
                          >
                            {u.team || 'Unassigned'} — Edit
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
