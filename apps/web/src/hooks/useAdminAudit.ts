import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';

export function useAuditLog() {
  const db = useDb();
  return useQuery({
    queryKey: ['admin-audit-log'],
    queryFn: async () => {
      const { data, error } = await db.query('admin_audit_log', { order: [{ column: 'created_at', ascending: false }], limit: 200 });
      if (error) throw new Error(error.message);
      return data as any[];
    },
  });
}

export function useLogAdminAction() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: {
      action: string;
      entity_type?: string;
      entity_id?: string;
      details?: Record<string, any>;
      performed_by: string;
    }) => {
      const { error } = await db.insert('admin_audit_log', entry);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-audit-log'] }),
  });
}
