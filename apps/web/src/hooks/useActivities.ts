import { useQuery } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import type { Filter } from '@relai/db';

export function useActivities(filters?: { client_id?: string; opportunity_id?: string }) {
  const db = useDb();
  return useQuery({
    queryKey: ['activities', filters],
    queryFn: async () => {
      const f: Filter[] = [];
      if (filters?.client_id) f.push({ column: 'client_id', operator: 'eq', value: filters.client_id });
      if (filters?.opportunity_id) f.push({ column: 'opportunity_id', operator: 'eq', value: filters.opportunity_id });
      const { data, error } = await db.query('activities', { filters: f, order: [{ column: 'created_at', ascending: false }], limit: 1000 });
      if (error) throw new Error(error.message);
      return data;
    },
  });
}
