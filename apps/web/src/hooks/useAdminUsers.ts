import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';

export interface AdminUser { id: string; user_id: string; email: string; full_name: string; team: string | null; is_active: boolean; created_at: string; updated_at: string; role: string; open_opportunities: number; owned_clients: number; }

export function useAdminUsers() {
  const db = useDb();
  return useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const [profilesRes, rolesRes, oppsRes, clientsRes] = await Promise.all([
        db.query('profiles', { order: [{ column: 'full_name' }] }),
        db.query('user_roles', {}),
        db.query('opportunities', { select: 'owner_id, stage', not: [{ column: 'owner_id', operator: 'is', value: null }] }),
        db.query('clients', { select: 'owner_id', not: [{ column: 'owner_id', operator: 'is', value: null }] }),
      ]);
      if (profilesRes.error) throw new Error(profilesRes.error.message);
      if (rolesRes.error) throw new Error(rolesRes.error.message);
      const roleMap = new Map(rolesRes.data?.map((r: any) => [r.user_id, r.role]) || []);
      const oppCounts = new Map<string, number>();
      oppsRes.data?.forEach((o: any) => {
        if (o.owner_id && !['Closed Won', 'Closed Lost'].includes(o.stage)) oppCounts.set(o.owner_id, (oppCounts.get(o.owner_id) || 0) + 1);
      });
      const clientCounts = new Map<string, number>();
      clientsRes.data?.forEach((c: any) => { if (c.owner_id) clientCounts.set(c.owner_id, (clientCounts.get(c.owner_id) || 0) + 1); });
      return profilesRes.data.map((p: any) => ({ ...p, role: roleMap.get(p.user_id) || 'sales_rep', open_opportunities: oppCounts.get(p.user_id) || 0, owned_clients: clientCounts.get(p.user_id) || 0 })) as AdminUser[];
    },
  });
}

export function useUpdateUserRole() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = await db.update('user_roles', { user_id: userId }, { role });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}

export function useUpdateUserProfile() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, updates }: { userId: string; updates: Record<string, any> }) => {
      const { error } = await db.update('profiles', { user_id: userId }, updates);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}

export function useCreateUser() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { email: string; password: string; full_name: string; team?: string; role?: string }) => {
      const { data: result, error } = await db.invoke('admin-create-user', { action: 'create_user', ...data });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}

export function useToggleUserStatus() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const { data: result, error } = await db.invoke('admin-create-user', { action: 'toggle_user_status', user_id: userId, is_active: isActive });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}

export function useReassignOwnership() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ fromUserId, toUserId, types }: { fromUserId: string; toUserId: string; types: string[] }) => {
      if (types.includes('opportunities')) {
        // Need to find all matching opps and update each
        const { data: opps } = await db.query('opportunities', { select: 'id', filters: [{ column: 'owner_id', operator: 'eq', value: fromUserId }] });
        for (const opp of opps || []) {
          await db.update('opportunities', { id: opp.id }, { owner_id: toUserId });
        }
      }
      if (types.includes('clients')) {
        const { data: clients } = await db.query('clients', { select: 'id', filters: [{ column: 'owner_id', operator: 'eq', value: fromUserId }] });
        for (const client of clients || []) {
          await db.update('clients', { id: client.id }, { owner_id: toUserId });
        }
      }
      if (types.includes('deliveries')) {
        const { data: deliveries } = await db.query('deliveries', { select: 'id', filters: [{ column: 'owner_id', operator: 'eq', value: fromUserId }] });
        for (const del of deliveries || []) {
          await db.update('deliveries', { id: del.id }, { owner_id: toUserId });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['opportunities'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['deliveries'] });
    },
  });
}
