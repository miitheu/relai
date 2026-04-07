import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import type { Filter } from '@relai/db';

export interface Contract { id: string; client_id: string; opportunity_id: string | null; file_name: string; file_path: string; file_size: number | null; mime_type: string | null; uploaded_by: string | null; notes: string | null; created_at: string; opportunity_name?: string; }

export function useContracts(clientId?: string) {
  const db = useDb();
  return useQuery({
    queryKey: ['contracts', clientId || 'all'],
    enabled: !!clientId,
    queryFn: async () => {
      const filters: Filter[] = [];
      if (clientId) filters.push({ column: 'client_id', operator: 'eq', value: clientId });
      const { data, error } = await db.query('contracts', { select: '*, opportunities:opportunity_id(name)', filters, order: [{ column: 'created_at', ascending: false }] });
      if (error) throw new Error(error.message);
      return ((data || []) as any[]).map((c: any) => ({ ...c, opportunity_name: c.opportunities?.name || null })) as Contract[];
    },
  });
}

export function useUploadContract() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, opportunityId, file, notes }: { clientId: string; opportunityId?: string; file: File; notes?: string; }) => {
      const user = await db.getCurrentUser();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${clientId}/${Date.now()}_${safeName}`;

      await db.uploadFile!('contracts', path, file);

      const { error: insertErr } = await db.insert('contracts', {
        client_id: clientId, opportunity_id: opportunityId || null,
        file_name: file.name, file_path: path, file_size: file.size,
        mime_type: file.type || 'application/octet-stream',
        uploaded_by: user?.id || null, notes: notes || null,
      });
      if (insertErr) throw new Error(insertErr.message);

      if (opportunityId) {
        const signedResult = await db.getSignedUrl!('contracts', path, 60 * 60 * 24 * 365);
        const signedUrl = (signedResult as any)?.signedUrl || path;
        await db.update('account_action_items', { opportunity_id: opportunityId, action_type: 'upload_contract', status: 'pending' }, {
          status: 'completed', resolved_at: new Date().toISOString(), resolved_by: user?.id || null, file_url: signedUrl,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['account-action-items'] });
    },
  });
}

export function useDeleteContract() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, filePath }: { id: string; filePath: string }) => {
      await db.removeFiles!('contracts', [filePath]);
      const { error } = await db.delete('contracts', { id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contracts'] }); },
  });
}

export async function getContractDownloadUrl(db: ReturnType<typeof useDb>, filePath: string): Promise<string> {
  const result = await db.getSignedUrl!('contracts', filePath, 60 * 60);
  return (result as any).signedUrl;
}
