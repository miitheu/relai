import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import type { Filter } from '@relai/db';

export function useWebEnrich() {
  const db = useDb();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<any>(null);

  const mutation = useMutation({
    mutationFn: async (clientId: string) => {
      const { data, error } = await db.invoke('web-enrich', { client_id: clientId });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data, clientId) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ['enrichment-results', clientId] });
      queryClient.invalidateQueries({ queryKey: ['intelligence-runs'] });
    },
  });

  return {
    enrich: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error?.message || null,
    result,
  };
}

export function useEnrichmentResults(clientId: string | undefined, source?: string) {
  const db = useDb();
  return useQuery({
    queryKey: ['enrichment-results', clientId, source],
    queryFn: async () => {
      if (!clientId) return [];
      const filters: Filter[] = [
        { column: 'entity_type', operator: 'eq', value: 'client' },
        { column: 'entity_id', operator: 'eq', value: clientId },
      ];
      if (source) filters.push({ column: 'source', operator: 'eq', value: source });
      const { data, error } = await db.query('enrichment_results', { filters, order: [{ column: 'created_at', ascending: false }] });
      if (error) throw new Error(error.message);
      return data || [];
    },
    enabled: !!clientId,
  });
}
