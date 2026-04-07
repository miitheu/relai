import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { useAuth } from '@/contexts/AuthContext';
import type { Filter } from '@relai/db';

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
  const db = useDb();
  return useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const { data, error } = await db.query('integrations', { order: [{ column: 'name' }], limit: 100 });
      if (error) throw new Error(error.message);
      return data as unknown as Integration[];
    },
  });
}

export function useCreateIntegration() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { name: string; type: string; config?: Record<string, any>; status?: string; }) => {
      const { data, error } = await db.insert('integrations', { ...input, created_by: user?.id });
      if (error) throw new Error(error.message);
      return data[0] as unknown as Integration;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useUpdateIntegration() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await db.update('integrations', { id }, input);
      if (error) throw new Error(error.message);
      return data[0] as unknown as Integration;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useSyncLog(integrationId?: string) {
  const db = useDb();
  return useQuery({
    queryKey: ['sync-log', integrationId || 'all'],
    queryFn: async () => {
      const filters: Filter[] = [];
      if (integrationId) filters.push({ column: 'integration_id', operator: 'eq', value: integrationId });
      const { data, error } = await db.query('sync_log', { filters, order: [{ column: 'started_at', ascending: false }], limit: 200 });
      if (error) throw new Error(error.message);
      return data as unknown as SyncLogEntry[];
    },
  });
}
