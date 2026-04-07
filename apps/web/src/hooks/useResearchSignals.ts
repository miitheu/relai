import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { useAuth } from '@/contexts/AuthContext';
import type { Filter } from '@relai/db';

export function useResearchSignals(clientId?: string) {
  const db = useDb();
  return useQuery({
    queryKey: ['research_signals', clientId || 'all'],
    queryFn: async () => {
      const filters: Filter[] = [];
      if (clientId) filters.push({ column: 'client_id', operator: 'eq', value: clientId });
      const { data, error } = await db.query('research_signals', { select: '*, clients(name), contacts(name), datasets(name)', filters, order: [{ column: 'created_at', ascending: false }] });
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export function useCreateSignal() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { client_id?: string; contact_id?: string; topic: string; dataset_id?: string; strength?: string; source_type?: string; notes?: string }) => {
      const { data, error } = await db.insert('research_signals', { ...input, created_by: user?.id });
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['research_signals'] }),
  });
}
