import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuth } from '@/contexts/AuthContext';

export function useTasks(filters?: { client_id?: string; opportunity_id?: string; status?: string }) {
  const supabase = useSupabase();
  const { user } = useAuth();
  return useQuery({
    queryKey: ['tasks', user?.id, filters],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from('tasks').select('*, clients(name), opportunities(name)').eq('user_id', user!.id).order('due_date', { ascending: true, nullsFirst: false });
      if (filters?.client_id) q = q.eq('client_id', filters.client_id);
      if (filters?.opportunity_id) q = q.eq('opportunity_id', filters.opportunity_id);
      if (filters?.status) q = q.eq('status', filters.status);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateTask() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { title: string; description?: string; due_date?: string; priority?: string; client_id?: string; opportunity_id?: string; campaign_target_id?: string }) => {
      const { data, error } = await supabase.from('tasks').insert({ ...input, user_id: user!.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useUpdateTask() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      if (input.status === 'done' && !input.completed_at) input.completed_at = new Date().toISOString();
      const { data, error } = await supabase.from('tasks').update(input).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useDeleteTask() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
