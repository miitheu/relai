import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';

export function useDatasets() {
  const db = useDb();
  return useQuery({
    queryKey: ['datasets'],
    queryFn: async () => {
      const { data, error } = await db.query('datasets', { order: [{ column: 'name' }] });
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export function useCreateDataset() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string; coverage?: string; update_frequency?: string; example_use_cases?: string }) => {
      const { data, error } = await db.insert('datasets', input);
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['datasets'] }),
  });
}

export function useUpdateDataset() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { data, error } = await db.update('datasets', { id }, updates);
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['datasets'] }),
  });
}

export function useCacheDatasetStats() {
  const db = useDb();
  return useMutation({
    mutationFn: async ({ datasetId, stats }: { datasetId: string; stats: Record<string, any> }) => {
      const { error } = await db.update('datasets', { id: datasetId }, {
        live_stats_json: stats,
        stats_updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
    },
  });
}
