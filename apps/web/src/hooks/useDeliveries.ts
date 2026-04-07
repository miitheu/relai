import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { useAuth } from '@/contexts/AuthContext';
import type { Filter } from '@relai/db';

export function useDeliveries(filters?: { client_id?: string; opportunity_id?: string; delivery_type?: string }) {
  const db = useDb();
  return useQuery({
    queryKey: ['deliveries', filters || 'all'],
    queryFn: async () => {
      const f: Filter[] = [];
      if (filters?.client_id) f.push({ column: 'client_id', operator: 'eq', value: filters.client_id });
      if (filters?.opportunity_id) f.push({ column: 'opportunity_id', operator: 'eq', value: filters.opportunity_id });
      if (filters?.delivery_type) f.push({ column: 'delivery_type', operator: 'eq', value: filters.delivery_type });
      const { data, error } = await db.query('deliveries', { select: '*, clients(name), datasets(name), opportunities(stage)', filters: f, order: [{ column: 'delivery_date', ascending: false }], limit: 500 });
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export function useAllDeliveries() {
  const db = useDb();
  return useQuery({
    queryKey: ['all_deliveries'],
    queryFn: async () => {
      const { data, error } = await db.query('deliveries', { select: '*, clients(name), datasets(name), opportunities(stage)', order: [{ column: 'delivery_date', ascending: false }], limit: 500 });
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export function useCreateDelivery() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { client_id: string; dataset_id?: string; opportunity_id?: string; delivery_type?: string; delivery_method?: string; delivery_date?: string; trial_start_date?: string; trial_end_date?: string; access_status?: string; owner_id?: string; notes?: string }) => {
      const { data, error } = await db.insert('deliveries', { ...input, created_by: user?.id, owner_id: input.owner_id || user?.id });
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deliveries'] }),
  });
}

export function useUpdateDelivery() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await db.update('deliveries', { id }, input);
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deliveries'] }),
  });
}
