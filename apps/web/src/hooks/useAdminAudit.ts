import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from '@/hooks/useSupabase';

export function useAuditLog() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['admin-audit-log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_audit_log' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useLogAdminAction() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: {
      action: string;
      entity_type?: string;
      entity_id?: string;
      details?: Record<string, any>;
      performed_by: string;
    }) => {
      const { error } = await supabase.from('admin_audit_log' as any).insert(entry as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-audit-log'] }),
  });
}
