import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useDatasets() {
  return useQuery({
    queryKey: ['datasets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('datasets').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string; coverage?: string; update_frequency?: string; example_use_cases?: string }) => {
      const { data, error } = await supabase.from('datasets').insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['datasets'] }),
  });
}

export function useUpdateDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase.from('datasets').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['datasets'] }),
  });
}

export function useCacheDatasetStats() {
  return useMutation({
    mutationFn: async ({ datasetId, stats }: { datasetId: string; stats: Record<string, any> }) => {
      const { error } = await supabase.from('datasets').update({
        live_stats_json: stats,
        stats_updated_at: new Date().toISOString(),
      }).eq('id', datasetId);
      if (error) throw error;
    },
  });
}
