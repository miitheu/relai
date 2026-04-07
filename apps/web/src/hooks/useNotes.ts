import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { useAuth } from '@/contexts/AuthContext';
import type { Filter } from '@relai/db';

export function useNotes(filters?: { client_id?: string; opportunity_id?: string }) {
  const db = useDb();
  return useQuery({
    queryKey: ['notes', filters],
    queryFn: async () => {
      const f: Filter[] = [];
      if (filters?.client_id) f.push({ column: 'client_id', operator: 'eq', value: filters.client_id });
      if (filters?.opportunity_id) f.push({ column: 'opportunity_id', operator: 'eq', value: filters.opportunity_id });
      const { data, error } = await db.query('notes', { select: '*, profiles(full_name)', filters: f, order: [{ column: 'created_at', ascending: false }] });
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export function useCreateNote() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { content: string; client_id?: string; opportunity_id?: string; contact_id?: string }) => {
      const { data, error } = await db.insert('notes', { ...input, created_by: user!.id });
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });
}
