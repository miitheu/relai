import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuth } from '@/contexts/AuthContext';

export function useNotes(filters?: { client_id?: string; opportunity_id?: string }) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['notes', filters],
    queryFn: async () => {
      let q = supabase.from('notes').select('*, profiles(full_name)').order('created_at', { ascending: false });
      if (filters?.client_id) q = q.eq('client_id', filters.client_id);
      if (filters?.opportunity_id) q = q.eq('opportunity_id', filters.opportunity_id);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateNote() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { content: string; client_id?: string; opportunity_id?: string; contact_id?: string }) => {
      const { data, error } = await supabase.from('notes').insert({ ...input, created_by: user!.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });
}
