import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AdminUser {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  team: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  role: string;
  open_opportunities: number;
  owned_clients: number;
}

export function useAdminUsers() {
  return useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const [profilesRes, rolesRes, oppsRes, clientsRes] = await Promise.all([
        supabase.from('profiles').select('*').order('full_name'),
        supabase.from('user_roles').select('*'),
        supabase.from('opportunities').select('owner_id, stage').not('owner_id', 'is', null),
        supabase.from('clients').select('owner_id').not('owner_id', 'is', null),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;

      const roleMap = new Map(rolesRes.data?.map(r => [r.user_id, r.role]) || []);

      const oppCounts = new Map<string, number>();
      oppsRes.data?.forEach(o => {
        if (o.owner_id && !['Closed Won', 'Closed Lost'].includes(o.stage)) {
          oppCounts.set(o.owner_id, (oppCounts.get(o.owner_id) || 0) + 1);
        }
      });

      const clientCounts = new Map<string, number>();
      clientsRes.data?.forEach(c => {
        if (c.owner_id) {
          clientCounts.set(c.owner_id, (clientCounts.get(c.owner_id) || 0) + 1);
        }
      });

      return profilesRes.data.map(p => ({
        ...p,
        role: roleMap.get(p.user_id) || 'sales_rep',
        open_opportunities: oppCounts.get(p.user_id) || 0,
        owned_clients: clientCounts.get(p.user_id) || 0,
      })) as AdminUser[];
    },
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = await supabase
        .from('user_roles')
        .update({ role } as any)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}

export function useUpdateUserProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, updates }: { userId: string; updates: Record<string, any> }) => {
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { email: string; password: string; full_name: string; team?: string; role?: string }) => {
      const { data: result, error } = await supabase.functions.invoke('admin-create-user', {
        body: { action: 'create_user', ...data },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}

export function useToggleUserStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const { data: result, error } = await supabase.functions.invoke('admin-create-user', {
        body: { action: 'toggle_user_status', user_id: userId, is_active: isActive },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}

export function useReassignOwnership() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ fromUserId, toUserId, types }: { fromUserId: string; toUserId: string; types: string[] }) => {
      if (types.includes('opportunities')) {
        const { error } = await supabase.from('opportunities').update({ owner_id: toUserId }).eq('owner_id', fromUserId);
        if (error) throw error;
      }
      if (types.includes('clients')) {
        const { error } = await supabase.from('clients').update({ owner_id: toUserId }).eq('owner_id', fromUserId);
        if (error) throw error;
      }
      if (types.includes('deliveries')) {
        const { error } = await supabase.from('deliveries').update({ owner_id: toUserId }).eq('owner_id', fromUserId);
        if (error) throw error;
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
