import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useDeliveries(filters?: { client_id?: string; opportunity_id?: string; delivery_type?: string }) {
  return useQuery({
    queryKey: ['deliveries', filters || 'all'],
    queryFn: async () => {
      let q = supabase.from('deliveries').select('*, clients(name), datasets(name), opportunities(stage)').order('delivery_date', { ascending: false }).limit(500);
      if (filters?.client_id) q = q.eq('client_id', filters.client_id);
      if (filters?.opportunity_id) q = q.eq('opportunity_id', filters.opportunity_id);
      if (filters?.delivery_type) q = q.eq('delivery_type', filters.delivery_type);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useAllDeliveries() {
  return useQuery({
    queryKey: ['all_deliveries'],
    queryFn: async () => {
      const { data, error } = await supabase.from('deliveries').select('*, clients(name), datasets(name), opportunities(stage)').order('delivery_date', { ascending: false }).limit(500);
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateDelivery() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { client_id: string; dataset_id?: string; opportunity_id?: string; delivery_type?: string; delivery_method?: string; delivery_date?: string; trial_start_date?: string; trial_end_date?: string; access_status?: string; owner_id?: string; notes?: string }) => {
      const { data, error } = await supabase.from('deliveries').insert({ ...input, created_by: user?.id, owner_id: input.owner_id || user?.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deliveries'] }),
  });
}

export function useUpdateDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase.from('deliveries').update(input).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deliveries'] }),
  });
}
