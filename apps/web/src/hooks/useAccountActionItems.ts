import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';

export interface AccountActionItem {
  id: string;
  client_id: string;
  opportunity_id: string | null;
  action_type: 'upload_contract' | 'document_loss_reason';
  title: string;
  description: string | null;
  status: 'pending' | 'completed' | 'dismissed';
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  file_url: string | null;
  created_at: string;
}

export function useAllAccountActionItems() {
  const db = useDb();
  return useQuery({
    queryKey: ['account-action-items', 'all-pending'],
    queryFn: async () => {
      const { data, error } = await db.query('account_action_items', {
        select: '*, clients:client_id(name), opportunities:opportunity_id(name, owner_id)',
        filters: [{ column: 'status', operator: 'eq', value: 'pending' }],
        order: [{ column: 'created_at', ascending: false }],
      });
      if (error) throw new Error(error.message);
      return (data || []) as unknown as (AccountActionItem & { clients?: { name: string } | null; opportunities?: { name: string; owner_id: string } | null })[];
    },
  });
}

export function useAccountActionItems(clientId: string | undefined) {
  const db = useDb();
  return useQuery({
    queryKey: ['account-action-items', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await db.query('account_action_items', {
        filters: [
          { column: 'client_id', operator: 'eq', value: clientId },
          { column: 'status', operator: 'eq', value: 'pending' },
        ],
        order: [{ column: 'created_at', ascending: false }],
      });
      if (error) throw new Error(error.message);
      return (data || []) as unknown as AccountActionItem[];
    },
    enabled: !!clientId,
  });
}

export function useResolveActionItem() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, resolution_note, file_url }: { id: string; resolution_note?: string; file_url?: string; }) => {
      const user = await db.getCurrentUser();
      const { error } = await db.update('account_action_items', { id }, {
        status: 'completed',
        resolved_at: new Date().toISOString(),
        resolved_by: user?.id || null,
        resolution_note: resolution_note || null,
        file_url: file_url || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['account-action-items'] });
    },
  });
}

export function useDismissActionItem() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const user = await db.getCurrentUser();
      const { error } = await db.update('account_action_items', { id }, {
        status: 'dismissed',
        resolved_at: new Date().toISOString(),
        resolved_by: user?.id || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['account-action-items'] });
    },
  });
}

export async function uploadContract(db: ReturnType<typeof useDb>, file: File, opportunityId: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'pdf';
  const path = `${opportunityId}/${Date.now()}.${ext}`;
  const uploadResult = await db.uploadFile!('contracts', path, file);
  if (uploadResult && 'error' in uploadResult && uploadResult.error) throw uploadResult.error;
  const urlResult = await db.getFileUrl!('contracts', path);
  return (urlResult as any)?.publicUrl || path;
}
