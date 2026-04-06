import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from '@/hooks/useSupabase';

export function useWebEnrich() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<any>(null);

  const mutation = useMutation({
    mutationFn: async (clientId: string) => {
      const { data, error } = await supabase.functions.invoke('web-enrich', {
        body: { client_id: clientId },
      });
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
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['enrichment-results', clientId, source],
    queryFn: async () => {
      if (!clientId) return [];
      let query = supabase
        .from('enrichment_results')
        .select('*')
        .eq('entity_type', 'client')
        .eq('entity_id', clientId)
        .order('created_at', { ascending: false });

      if (source) {
        query = query.eq('source', source);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!clientId,
  });
}
