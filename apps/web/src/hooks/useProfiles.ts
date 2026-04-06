import { useQuery } from '@tanstack/react-query';
import { useSupabase } from '@/hooks/useSupabase';

export function useProfiles() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('is_active', true).order('full_name');
      if (error) throw error;
      return data;
    },
  });
}
