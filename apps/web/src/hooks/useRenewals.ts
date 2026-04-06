import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useRenewals(clientId?: string) {
  return useQuery({
    queryKey: ['renewals', clientId || 'all'],
    queryFn: async () => {
      let q = supabase.from('renewals').select('*, clients(name), datasets(name)').order('renewal_date').limit(500);
      if (clientId) q = q.eq('client_id', clientId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateRenewal() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { client_id: string; dataset_id?: string; contract_id?: string; renewal_date: string; value: number; probability?: number; status?: string; owner_id?: string }) => {
      const { data, error } = await supabase.from('renewals').insert({
        ...input,
        owner_id: input.owner_id || user?.id,
        created_by: user?.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['renewals'] });
      qc.invalidateQueries({ queryKey: ['opportunities'] });
    },
  });
}

export function useUpdateRenewal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase.from('renewals').update(input).eq('id', id).select('*, clients(name), datasets(name)').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['renewals'] });
      qc.invalidateQueries({ queryKey: ['opportunities'] });
    },
  });
}
