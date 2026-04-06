import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from '@/hooks/useSupabase';

export interface Contract {
  id: string;
  client_id: string;
  opportunity_id: string | null;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: string | null;
  notes: string | null;
  created_at: string;
  // joined
  opportunity_name?: string;
}

export function useContracts(clientId?: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['contracts', clientId || 'all'],
    enabled: !!clientId,
    queryFn: async () => {
      let q = (supabase.from('contracts' as any) as any)
        .select('*, opportunities:opportunity_id(name)')
        .order('created_at', { ascending: false });
      if (clientId) q = q.eq('client_id', clientId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data || []) as any[]).map((c: any) => ({
        ...c,
        opportunity_name: c.opportunities?.name || null,
      })) as Contract[];
    },
  });
}

export function useUploadContract() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      clientId,
      opportunityId,
      file,
      notes,
    }: {
      clientId: string;
      opportunityId?: string;
      file: File;
      notes?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${clientId}/${Date.now()}_${safeName}`;

      const { error: uploadErr } = await supabase.storage
        .from('contracts')
        .upload(path, file, { upsert: false });
      if (uploadErr) throw uploadErr;

      const { error: insertErr } = await (supabase.from('contracts' as any) as any)
        .insert({
          client_id: clientId,
          opportunity_id: opportunityId || null,
          file_name: file.name,
          file_path: path,
          file_size: file.size,
          mime_type: file.type || 'application/octet-stream',
          uploaded_by: user?.id || null,
          notes: notes || null,
        });
      if (insertErr) throw insertErr;

      // Auto-resolve "upload contract" action item banner if linked to opportunity
      if (opportunityId) {
        const { data: signedUrl } = await supabase.storage
          .from('contracts')
          .createSignedUrl(path, 60 * 60 * 24 * 365);

        await (supabase.from('account_action_items' as any) as any)
          .update({
            status: 'completed',
            resolved_at: new Date().toISOString(),
            resolved_by: user?.id || null,
            file_url: signedUrl?.signedUrl || path,
          })
          .eq('opportunity_id', opportunityId)
          .eq('action_type', 'upload_contract')
          .eq('status', 'pending');
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['account-action-items'] });
    },
  });
}

export function useDeleteContract() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, filePath }: { id: string; filePath: string }) => {
      await supabase.storage.from('contracts').remove([filePath]);
      const { error } = await (supabase.from('contracts' as any) as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts'] });
    },
  });
}

export async function getContractDownloadUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('contracts')
    .createSignedUrl(filePath, 60 * 60); // 1 hour
  if (error) throw error;
  return data.signedUrl;
}
