import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { useAuth } from '@/contexts/AuthContext';
import type { Filter } from '@relai/db';

export function useContacts(clientId?: string) {
  const db = useDb();
  return useQuery({
    queryKey: ['contacts', clientId || 'all'],
    queryFn: async () => {
      const filters: Filter[] = [];
      if (clientId) filters.push({ column: 'client_id', operator: 'eq', value: clientId });
      const { data, error } = await db.query('contacts', { select: '*, clients(name)', filters, order: [{ column: 'name' }] });
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export function useCreateContact() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { client_id: string; name: string; title?: string; email?: string; linkedin?: string; influence_level?: string; relationship_strength?: string; notes?: string }) => {
      const { data, error } = await db.insert('contacts', { ...input, created_by: user?.id });
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  });
}

export function useUpdateContact() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await db.update('contacts', { id }, input);
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  });
}
