import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
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
  const db = useDb();
  return useQuery({
    queryKey: ['email-templates'],
    queryFn: async () => {
      const { data, error } = await db.query('email_templates', { order: [{ column: 'name' }], limit: 200 });
      if (error) throw new Error(error.message);
      return data as unknown as EmailTemplate[];
    },
  });
}

export function useEmailTemplate(id: string | undefined) {
  const db = useDb();
  return useQuery({
    queryKey: ['email-templates', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db.queryOne('email_templates', { filters: [{ column: 'id', operator: 'eq', value: id! }] });
      if (error) throw new Error(error.message);
      return data as unknown as EmailTemplate;
    },
  });
}

export function useCreateEmailTemplate() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { name: string; subject: string; body: string; category?: string; variables?: string[]; dataset_ids?: string[]; is_active?: boolean; }) => {
      const { data, error } = await db.insert('email_templates', { ...input, created_by: user?.id });
      if (error) throw new Error(error.message);
      return data[0] as unknown as EmailTemplate;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-templates'] }),
  });
}

export function useUpdateEmailTemplate() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await db.update('email_templates', { id }, input);
      if (error) throw new Error(error.message);
      return data[0] as unknown as EmailTemplate;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-templates'] }),
  });
}

export function useDeleteEmailTemplate() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.delete('email_templates', { id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-templates'] }),
  });
}
