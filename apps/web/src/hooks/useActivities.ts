import { useQuery } from '@tanstack/react-query';
import { useSupabase } from '@/hooks/useSupabase';

export function useActivities(filters?: { client_id?: string; opportunity_id?: string }) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['activities', filters],
    queryFn: async () => {
      let q = supabase.from('activities').select('*').order('created_at', { ascending: false }).limit(1000);
      if (filters?.client_id) q = q.eq('client_id', filters.client_id);
      if (filters?.opportunity_id) q = q.eq('opportunity_id', filters.opportunity_id);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}
