import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { useAuth } from '@/contexts/AuthContext';

export function useClients() {
  const db = useDb();
  return useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await db.query('clients', { filters: [{ column: 'is_merged', operator: 'eq', value: false }], order: [{ column: 'name' }], limit: 500 });
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export function useClientsPaginated(page = 0, pageSize = 50) {
  const db = useDb();
  return useQuery({
    queryKey: ['clients', 'paginated', page, pageSize],
    queryFn: async () => {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await db.query('clients', { count: 'exact', filters: [{ column: 'is_merged', operator: 'eq', value: false }], order: [{ column: 'name' }], range: [from, to] });
      if (error) throw new Error(error.message);
      return { data: data ?? [], count: count ?? 0, page, pageSize };
    },
  });
}

export function useClient(id: string | undefined) {
  const db = useDb();
  return useQuery({
    queryKey: ['clients', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db.queryOne('clients', { filters: [{ column: 'id', operator: 'eq', value: id! }] });
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export function useCreateClient() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { name: string; client_type: string; headquarters_country?: string; aum?: string; strategy_focus?: string; relationship_status?: string; notes?: string }) => {
      const { data, error } = await db.insert('clients', { ...input, created_by: user?.id, owner_id: user?.id });
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });
}

export function useUpdateClient() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await db.update('clients', { id }, input);
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });
}
