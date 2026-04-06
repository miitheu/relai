import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*').eq('is_merged', false).order('name').limit(500);
      if (error) throw error;
      return data;
    },
  });
}

export function useClientsPaginated(page = 0, pageSize = 50) {
  return useQuery({
    queryKey: ['clients', 'paginated', page, pageSize],
    queryFn: async () => {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await supabase
        .from('clients')
        .select('*', { count: 'exact' })
        .eq('is_merged', false)
        .order('name')
        .range(from, to);
      if (error) throw error;
      return { data: data ?? [], count: count ?? 0, page, pageSize };
    },
  });
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: ['clients', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*').eq('id', id!).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { name: string; client_type: string; headquarters_country?: string; aum?: string; strategy_focus?: string; relationship_status?: string; notes?: string }) => {
      const { data, error } = await supabase.from('clients').insert({ ...input, created_by: user?.id, owner_id: user?.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase.from('clients').update(input).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });
}
