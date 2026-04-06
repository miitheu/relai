import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuth } from '@/contexts/AuthContext';

export function useResearchSignals(clientId?: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['research_signals', clientId || 'all'],
    queryFn: async () => {
      let q = supabase.from('research_signals').select('*, clients(name), contacts(name), datasets(name)').order('created_at', { ascending: false });
      if (clientId) q = q.eq('client_id', clientId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateSignal() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { client_id?: string; contact_id?: string; topic: string; dataset_id?: string; strength?: string; source_type?: string; notes?: string }) => {
      const { data, error } = await supabase.from('research_signals').insert({ ...input, created_by: user?.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['research_signals'] }),
  });
}
