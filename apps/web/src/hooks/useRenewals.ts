import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { useAuth } from '@/contexts/AuthContext';
import type { Filter } from '@relai/db';

export function useRenewals(clientId?: string) {
  const db = useDb();
  return useQuery({
    queryKey: ['renewals', clientId || 'all'],
    queryFn: async () => {
      const filters: Filter[] = [];
      if (clientId) filters.push({ column: 'client_id', operator: 'eq', value: clientId });
      const { data, error } = await db.query('renewals', { select: '*, clients(name), datasets(name)', filters, order: [{ column: 'renewal_date' }], limit: 500 });
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export function useCreateRenewal() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { client_id: string; dataset_id?: string; contract_id?: string; renewal_date: string; value: number; probability?: number; status?: string; owner_id?: string }) => {
      const { data, error } = await db.insert('renewals', { ...input, owner_id: input.owner_id || user?.id, created_by: user?.id });
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['renewals'] });
      qc.invalidateQueries({ queryKey: ['opportunities'] });
    },
  });
}

export function useUpdateRenewal() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await db.update('renewals', { id }, input, { select: '*, clients(name), datasets(name)' });
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['renewals'] });
      qc.invalidateQueries({ queryKey: ['opportunities'] });
    },
  });
}
