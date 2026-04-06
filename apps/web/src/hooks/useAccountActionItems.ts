import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
  return useQuery({
    queryKey: ['account-action-items', 'all-pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_action_items' as any)
        .select('*, clients:client_id(name), opportunities:opportunity_id(name, owner_id)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as (AccountActionItem & { clients?: { name: string } | null; opportunities?: { name: string; owner_id: string } | null })[];
    },
  });
}

export function useAccountActionItems(clientId: string | undefined) {
  return useQuery({
    queryKey: ['account-action-items', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from('account_action_items' as any)
        .select('*')
        .eq('client_id', clientId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as AccountActionItem[];
    },
    enabled: !!clientId,
  });
}

export function useResolveActionItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      resolution_note,
      file_url,
    }: {
      id: string;
      resolution_note?: string;
      file_url?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('account_action_items' as any)
        .update({
          status: 'completed',
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id || null,
          resolution_note: resolution_note || null,
          file_url: file_url || null,
        } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['account-action-items'] });
    },
  });
}

export function useDismissActionItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('account_action_items' as any)
        .update({
          status: 'dismissed',
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id || null,
        } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['account-action-items'] });
    },
  });
}

export async function uploadContract(file: File, opportunityId: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'pdf';
  const path = `${opportunityId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('contracts')
    .upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('contracts').getPublicUrl(path);
  return data.publicUrl;
}
