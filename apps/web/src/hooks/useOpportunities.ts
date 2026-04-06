import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuth } from '@/contexts/AuthContext';

export function useOpportunities(filters?: { client_id?: string; dataset_id?: string; stage?: string }) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['opportunities', filters],
    queryFn: async () => {
      let q = supabase.from('opportunities').select('*, clients(name), datasets(name), opportunity_products(id, dataset_id, revenue, datasets(name))').order('created_at', { ascending: false }).limit(500);
      if (filters?.client_id) q = q.eq('client_id', filters.client_id);
      if (filters?.dataset_id) q = q.eq('dataset_id', filters.dataset_id);
      if (filters?.stage) q = q.eq('stage', filters.stage);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateOpportunity() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { name: string; client_id: string; dataset_id?: string; stage?: string; value: number; value_min?: number; value_max?: number; expected_close?: string; probability?: number; notes?: string; owner_id?: string; source?: string; campaign_target_id?: string; campaign_id?: string }) => {
      const payload: any = { ...input, created_by: user?.id, owner_id: input.owner_id || user?.id };
      const { data, error } = await supabase.from('opportunities').insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['opportunities'] }),
  });
}

export function useDeleteOpportunity() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('opportunities').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['opportunities'] }),
  });
}

export function useUpdateOpportunity() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase.from('opportunities').update(input).eq('id', id).select('*, clients(name), datasets(name)').single();
      if (error) throw error;
      return data;
    },
    onMutate: async ({ id, ...input }) => {
      await qc.cancelQueries({ queryKey: ['opportunities'] });
      const previous = qc.getQueriesData({ queryKey: ['opportunities'] });
      qc.setQueriesData({ queryKey: ['opportunities'] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((o: any) => (o.id === id ? { ...o, ...input } : o));
      });
      return { previous };
    },
    onError: (_err, _vars, context: any) => {
      if (context?.previous) {
        context.previous.forEach(([key, data]: [any, any]) => qc.setQueryData(key, data));
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['opportunities'] }),
  });
}
