import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface GmailConnection {
  connected: boolean;
  email_address?: string;
  sync_enabled?: boolean;
  last_sync_at?: string;
  is_active?: boolean;
}

export function useGmailConnection() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['gmail-connection'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('gmail-auth', {
        body: { mode: 'status' },
      });
      if (error) throw error;
      return data as GmailConnection;
    },
  });
}

export function useConnectGmail() {
  const supabase = useSupabase();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('gmail-auth', {
        body: { mode: 'get_auth_url' },
      });
      if (error) throw error;
      return data.url as string;
    },
    onSuccess: (url) => {
      // Open OAuth popup
      window.open(url, 'gmail-auth', 'width=500,height=600,left=200,top=200');
    },
    onError: (err: any) => {
      toast({ title: 'Failed to connect Gmail', description: err.message, variant: 'destructive' });
    },
  });
}

export function useExchangeGmailCode() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ code, state }: { code: string; state?: string | null }) => {
      const { data, error } = await supabase.functions.invoke('gmail-auth', {
        body: { mode: 'exchange_code', code, state },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gmail-connection'] });
      toast({ title: 'Gmail connected successfully' });
    },
    onError: (err: any) => {
      toast({ title: 'Failed to connect Gmail', description: err.message, variant: 'destructive' });
    },
  });
}

export function useDisconnectGmail() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('gmail-auth', {
        body: { mode: 'disconnect' },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gmail-connection'] });
      toast({ title: 'Gmail disconnected' });
    },
  });
}

export interface UnmatchedAddress {
  address: string;
  email_count: number;
  sample_subjects: string[];
  suggested_client_id: string | null;
  suggested_client_name: string | null;
}

export interface SyncResult {
  synced: number;
  matched: number;
  blocked: number;
  total_processed: number;
  total_from_gmail: number;
  skipped_no_contact: number;
  dry_run: boolean;
  crm_contacts_with_email: number;
  matched_addresses: { address: string; email_count: number }[];
  unmatched_addresses: UnmatchedAddress[];
}

export function useSyncGmail() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (options?: { dry_run?: boolean; full_rescan?: boolean }) => {
      const { data, error } = await supabase.functions.invoke('gmail-sync', {
        body: { dry_run: options?.dry_run || false, full_rescan: options?.full_rescan || false },
      });
      if (error) {
        if (data?.error) throw new Error(data.error);
        throw error;
      }
      if (data?.error) throw new Error(data.error);
      return data as SyncResult;
    },
    onSuccess: (data) => {
      if (!data.dry_run) {
        qc.invalidateQueries({ queryKey: ['emails'] });
        qc.invalidateQueries({ queryKey: ['gmail-connection'] });
      }
      if (data.dry_run) {
        toast({ title: `Dry run: ${data.total_processed} emails scanned`, description: `${data.matched} matched, ${data.skipped_no_contact} unmatched` });
      } else {
        toast({ title: `Synced ${data.synced} emails`, description: `${data.matched} matched to contacts` });
      }
    },
    onError: (err: any) => {
      toast({ title: 'Sync failed', description: err.message, variant: 'destructive' });
    },
  });
}

export function useEmails(filters?: { client_id?: string; opportunity_id?: string; contact_id?: string }) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['emails', filters],
    enabled: !!(filters?.client_id || filters?.opportunity_id || filters?.contact_id),
    queryFn: async () => {
      // Use the secure view that enforces visibility server-side
      let q = supabase.from('emails_visible' as any).select('*').order('email_date', { ascending: false });
      if (filters?.client_id) q = q.eq('client_id', filters.client_id);
      if (filters?.opportunity_id) q = q.eq('opportunity_id', filters.opportunity_id);
      if (filters?.contact_id) q = q.eq('contact_id', filters.contact_id);
      const { data, error } = await q;
      // Fall back to emails table if view doesn't exist yet
      if (error?.code === '42P01') {
        let fallback = supabase.from('emails').select('*').order('email_date', { ascending: false });
        if (filters?.client_id) fallback = fallback.eq('client_id', filters.client_id);
        if (filters?.opportunity_id) fallback = fallback.eq('opportunity_id', filters.opportunity_id);
        if (filters?.contact_id) fallback = fallback.eq('contact_id', filters.contact_id);
        const { data: fbData, error: fbErr } = await fallback;
        if (fbErr) throw fbErr;
        return fbData || [];
      }
      if (error) throw error;
      return data || [];
    },
  });
}

export function useUpdateEmailVisibility() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, visibility }: { id: string; visibility: 'public' | 'private' | 'summary_only' }) => {
      const { error } = await supabase.from('emails').update({ visibility } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emails'] }),
  });
}

export function useBlockedDomains() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['gmail-blocked-domains'],
    queryFn: async () => {
      const { data } = await (supabase.from('integration_configs') as any)
        .select('config_json')
        .eq('integration_type', 'email')
        .eq('is_active', true)
        .limit(1)
        .single();
      return (data?.config_json?.blocked_domains || []) as string[];
    },
  });
}

export function useUpdateBlockedDomains() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (domains: string[]) => {
      // Load current config, update blocked_domains
      const { data: config } = await (supabase.from('integration_configs') as any)
        .select('id, config_json')
        .eq('integration_type', 'email')
        .eq('is_active', true)
        .limit(1)
        .single();
      if (!config) throw new Error('Gmail not connected');
      const updatedJson = { ...config.config_json, blocked_domains: domains };
      const { error } = await (supabase.from('integration_configs') as any)
        .update({ config_json: updatedJson })
        .eq('id', config.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gmail-blocked-domains'] });
      toast({ title: 'Blocked domains updated' });
    },
    onError: (err: any) => {
      toast({ title: 'Failed to update blocked domains', description: err.message, variant: 'destructive' });
    },
  });
}

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Auto-syncs Gmail once per day when the app is open.
 * Checks last_sync_at — if older than 24h, triggers a background sync.
 * Call this once at the app root (e.g. Dashboard).
 */
export function useAutoGmailSync() {
  const { data: connection } = useGmailConnection();
  const syncGmail = useSyncGmail();
  const triggered = useRef(false);

  useEffect(() => {
    if (triggered.current) return;
    if (!connection?.connected) return;

    const lastSync = connection.last_sync_at ? new Date(connection.last_sync_at).getTime() : 0;
    const elapsed = Date.now() - lastSync;

    if (elapsed > SYNC_INTERVAL_MS) {
      triggered.current = true;
      syncGmail.mutate({ full_rescan: true });
    }
  }, [connection?.connected, connection?.last_sync_at]); // eslint-disable-line react-hooks/exhaustive-deps
}
