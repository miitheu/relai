import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useDb } from '@relai/db/react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { Filter } from '@relai/db';

export interface GmailConnection { connected: boolean; email_address?: string; sync_enabled?: boolean; last_sync_at?: string; is_active?: boolean; }

export function useGmailConnection() {
  const db = useDb();
  return useQuery({
    queryKey: ['gmail-connection'],
    queryFn: async () => {
      const { data, error } = await db.invoke('gmail-auth', { mode: 'status' });
      if (error) throw error;
      return data as GmailConnection;
    },
  });
}

export function useConnectGmail() {
  const db = useDb();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await db.invoke('gmail-auth', { mode: 'get_auth_url' });
      if (error) throw error;
      return data.url as string;
    },
    onSuccess: (url) => { window.open(url, 'gmail-auth', 'width=500,height=600,left=200,top=200'); },
    onError: (err: any) => { toast({ title: 'Failed to connect Gmail', description: err.message, variant: 'destructive' }); },
  });
}

export function useExchangeGmailCode() {
  const db = useDb();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ code, state }: { code: string; state?: string | null }) => {
      const { data, error } = await db.invoke('gmail-auth', { mode: 'exchange_code', code, state });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gmail-connection'] }); toast({ title: 'Gmail connected successfully' }); },
    onError: (err: any) => { toast({ title: 'Failed to connect Gmail', description: err.message, variant: 'destructive' }); },
  });
}

export function useDisconnectGmail() {
  const db = useDb();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await db.invoke('gmail-auth', { mode: 'disconnect' });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gmail-connection'] }); toast({ title: 'Gmail disconnected' }); },
  });
}

export interface UnmatchedAddress { address: string; email_count: number; sample_subjects: string[]; suggested_client_id: string | null; suggested_client_name: string | null; }
export interface SyncResult { synced: number; matched: number; blocked: number; total_processed: number; total_from_gmail: number; skipped_no_contact: number; dry_run: boolean; crm_contacts_with_email: number; matched_addresses: { address: string; email_count: number }[]; unmatched_addresses: UnmatchedAddress[]; }

export function useSyncGmail() {
  const db = useDb();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (options?: { dry_run?: boolean; full_rescan?: boolean }) => {
      const { data, error } = await db.invoke('gmail-sync', { dry_run: options?.dry_run || false, full_rescan: options?.full_rescan || false });
      if (error) { if (data?.error) throw new Error(data.error); throw error; }
      if (data?.error) throw new Error(data.error);
      return data as SyncResult;
    },
    onSuccess: (data) => {
      if (!data.dry_run) { qc.invalidateQueries({ queryKey: ['emails'] }); qc.invalidateQueries({ queryKey: ['gmail-connection'] }); }
      if (data.dry_run) toast({ title: `Dry run: ${data.total_processed} emails scanned`, description: `${data.matched} matched, ${data.skipped_no_contact} unmatched` });
      else toast({ title: `Synced ${data.synced} emails`, description: `${data.matched} matched to contacts` });
    },
    onError: (err: any) => { toast({ title: 'Sync failed', description: err.message, variant: 'destructive' }); },
  });
}

export function useEmails(filters?: { client_id?: string; opportunity_id?: string; contact_id?: string }) {
  const db = useDb();
  return useQuery({
    queryKey: ['emails', filters],
    enabled: !!(filters?.client_id || filters?.opportunity_id || filters?.contact_id),
    queryFn: async () => {
      const f: Filter[] = [];
      if (filters?.client_id) f.push({ column: 'client_id', operator: 'eq', value: filters.client_id });
      if (filters?.opportunity_id) f.push({ column: 'opportunity_id', operator: 'eq', value: filters.opportunity_id });
      if (filters?.contact_id) f.push({ column: 'contact_id', operator: 'eq', value: filters.contact_id });
      // Try emails_visible view first, fall back to emails table
      let result = await db.query('emails_visible', { filters: f, order: [{ column: 'email_date', ascending: false }] });
      if (result.error && (result.error as any).code === '42P01') {
        result = await db.query('emails', { filters: f, order: [{ column: 'email_date', ascending: false }] });
      }
      if (result.error) throw new Error(result.error.message);
      return result.data || [];
    },
  });
}

export function useUpdateEmailVisibility() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, visibility }: { id: string; visibility: 'public' | 'private' | 'summary_only' }) => {
      const { error } = await db.update('emails', { id }, { visibility });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emails'] }),
  });
}

export function useBlockedDomains() {
  const db = useDb();
  return useQuery({
    queryKey: ['gmail-blocked-domains'],
    queryFn: async () => {
      const { data } = await db.queryOne('integration_configs', { select: 'config_json', filters: [{ column: 'integration_type', operator: 'eq', value: 'email' }, { column: 'is_active', operator: 'eq', value: true }] });
      return ((data as any)?.config_json?.blocked_domains || []) as string[];
    },
  });
}

export function useUpdateBlockedDomains() {
  const db = useDb();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (domains: string[]) => {
      const { data: config } = await db.queryOne('integration_configs', { select: 'id, config_json', filters: [{ column: 'integration_type', operator: 'eq', value: 'email' }, { column: 'is_active', operator: 'eq', value: true }] });
      if (!config) throw new Error('Gmail not connected');
      const updatedJson = { ...(config as any).config_json, blocked_domains: domains };
      const { error } = await db.update('integration_configs', { id: (config as any).id }, { config_json: updatedJson });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gmail-blocked-domains'] }); toast({ title: 'Blocked domains updated' }); },
    onError: (err: any) => { toast({ title: 'Failed to update blocked domains', description: err.message, variant: 'destructive' }); },
  });
}

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function useAutoGmailSync() {
  const { data: connection } = useGmailConnection();
  const syncGmail = useSyncGmail();
  const triggered = useRef(false);
  useEffect(() => {
    if (triggered.current) return;
    if (!connection?.connected) return;
    const lastSync = connection.last_sync_at ? new Date(connection.last_sync_at).getTime() : 0;
    if (Date.now() - lastSync > SYNC_INTERVAL_MS) {
      triggered.current = true;
      syncGmail.mutate({ full_rescan: true });
    }
  }, [connection?.connected, connection?.last_sync_at]); // eslint-disable-line react-hooks/exhaustive-deps
}
