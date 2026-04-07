import { useQuery } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';

export function useProfiles() {
  const db = useDb();
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await db.query('profiles', { filters: [{ column: 'is_active', operator: 'eq', value: true }], order: [{ column: 'full_name' }] });
      if (error) throw new Error(error.message);
      return data;
    },
  });
}
