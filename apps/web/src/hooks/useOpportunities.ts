import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { useAuth } from '@/contexts/AuthContext';
import type { Filter } from '@relai/db';

export function useOpportunities(filters?: { client_id?: string; dataset_id?: string; stage?: string }) {
  const db = useDb();
  return useQuery({
    queryKey: ['opportunities', filters],
    queryFn: async () => {
      const f: Filter[] = [];
      if (filters?.client_id) f.push({ column: 'client_id', operator: 'eq', value: filters.client_id });
      if (filters?.dataset_id) f.push({ column: 'dataset_id', operator: 'eq', value: filters.dataset_id });
      if (filters?.stage) f.push({ column: 'stage', operator: 'eq', value: filters.stage });
      const { data, error } = await db.query('opportunities', { select: '*, clients(name), datasets(name), opportunity_products(id, dataset_id, revenue, datasets(name))', filters: f, order: [{ column: 'created_at', ascending: false }], limit: 500 });
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export function useCreateOpportunity() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { name: string; client_id: string; dataset_id?: string; stage?: string; value: number; value_min?: number; value_max?: number; expected_close?: string; probability?: number; notes?: string; owner_id?: string; source?: string; campaign_target_id?: string; campaign_id?: string }) => {
      const payload: any = { ...input, created_by: user?.id, owner_id: input.owner_id || user?.id };
      const { data, error } = await db.insert('opportunities', payload);
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['opportunities'] }),
  });
}

export function useDeleteOpportunity() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.delete('opportunities', { id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['opportunities'] }),
  });
}

export function useUpdateOpportunity() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await db.update('opportunities', { id }, input, { select: '*, clients(name), datasets(name)' });
      if (error) throw new Error(error.message);
      return data[0];
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
