import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Integration {
  id: string;
  name: string;
  type: string;
  config: Record<string, any> | null;
  status: string;
  last_sync_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyncLogEntry {
  id: string;
  integration_id: string;
  status: string;
  records_synced: number | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export function useIntegrations() {
  return useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integrations' as any)
        .select('*')
        .order('name')
        .limit(100);
      if (error) throw error;
      return data as unknown as Integration[];
    },
  });
}

export function useCreateIntegration() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      type: string;
      config?: Record<string, any>;
      status?: string;
    }) => {
      const { data, error } = await supabase
        .from('integrations' as any)
        .insert({ ...input, created_by: user?.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Integration;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useUpdateIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase
        .from('integrations' as any)
        .update(input as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Integration;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useSyncLog(integrationId?: string) {
  return useQuery({
    queryKey: ['sync-log', integrationId || 'all'],
    queryFn: async () => {
      let q = supabase
        .from('sync_log' as any)
        .select('*')
        .order('started_at', { ascending: false })
        .limit(200);
      if (integrationId) q = q.eq('integration_id', integrationId);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as SyncLogEntry[];
    },
  });
}
