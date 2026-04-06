import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuth } from '@/contexts/AuthContext';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string | null;
  variables: string[] | null;
  dataset_ids: string[];
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useEmailTemplates() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['email-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_templates' as any)
        .select('*')
        .order('name')
        .limit(200);
      if (error) throw error;
      return data as unknown as EmailTemplate[];
    },
  });
}

export function useEmailTemplate(id: string | undefined) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['email-templates', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_templates' as any)
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as unknown as EmailTemplate;
    },
  });
}

export function useCreateEmailTemplate() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      subject: string;
      body: string;
      category?: string;
      variables?: string[];
      dataset_ids?: string[];
      is_active?: boolean;
    }) => {
      const { data, error } = await supabase
        .from('email_templates' as any)
        .insert({ ...input, created_by: user?.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as EmailTemplate;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-templates'] }),
  });
}

export function useUpdateEmailTemplate() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase
        .from('email_templates' as any)
        .update(input as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as EmailTemplate;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-templates'] }),
  });
}

export function useDeleteEmailTemplate() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('email_templates' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-templates'] }),
  });
}
