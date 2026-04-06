import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuth } from '@/contexts/AuthContext';

// Types matching the territories migration schema
export interface Territory {
  id: string;
  name: string;
  description: string | null;
  region: string | null;
  segment: string | null;
  parent_territory_id: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TerritoryAssignment {
  id: string;
  territory_id: string;
  user_id: string;
  client_id: string | null;
  assigned_at: string;
  assigned_by: string | null;
}

export function useTerritories() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['territories'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('territories').select('*').order('name');
      if (error) throw error;
      return (data ?? []) as Territory[];
    },
  });
}

export function useTerritory(id: string | undefined) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['territories', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('territories').select('*').eq('id', id!).single();
      if (error) throw error;
      return data as Territory;
    },
  });
}

export function useCreateTerritory() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string; region?: string; segment?: string; parent_territory_id?: string }) => {
      const { data, error } = await (supabase as any).from('territories').insert({ ...input, created_by: user?.id }).select().single();
      if (error) throw error;
      return data as Territory;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['territories'] }),
  });
}

export function useUpdateTerritory() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await (supabase as any).from('territories').update(input).eq('id', id).select().single();
      if (error) throw error;
      return data as Territory;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['territories'] }),
  });
}

export function useDeleteTerritory() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('territories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['territories'] }),
  });
}

export function useTerritoryAssignments(territoryId?: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['territory_assignments', territoryId || 'all'],
    queryFn: async () => {
      let q = (supabase as any).from('territory_assignments').select('*').order('assigned_at', { ascending: false });
      if (territoryId) q = q.eq('territory_id', territoryId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TerritoryAssignment[];
    },
  });
}

export function useAssignTerritory() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { territory_id: string; user_id: string; client_id?: string }) => {
      const { data, error } = await (supabase as any).from('territory_assignments').insert({ ...input, assigned_by: user?.id }).select().single();
      if (error) throw error;
      return data as TerritoryAssignment;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['territory_assignments'] });
      qc.invalidateQueries({ queryKey: ['territory_assignments', vars.territory_id] });
    },
  });
}

export function useUnassignTerritory() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('territory_assignments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['territory_assignments'] }),
  });
}
