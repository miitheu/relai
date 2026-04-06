import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useContacts(clientId?: string) {
  return useQuery({
    queryKey: ['contacts', clientId || 'all'],
    queryFn: async () => {
      let q = supabase.from('contacts').select('*, clients(name)').order('name');
      if (clientId) q = q.eq('client_id', clientId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { client_id: string; name: string; title?: string; email?: string; linkedin?: string; influence_level?: string; relationship_strength?: string; notes?: string }) => {
      const { data, error } = await supabase.from('contacts').insert({ ...input, created_by: user?.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase.from('contacts').update(input).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  });
}
