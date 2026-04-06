import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Types matching the quotas migration schema
export interface Quota {
  id: string;
  user_id: string;
  territory_id: string | null;
  period_start: string;
  period_end: string;
  quota_type: 'revenue' | 'deals' | 'meetings' | 'pipeline';
  target_value: number;
  currency: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuotaAttainment {
  id: string;
  quota_id: string;
  snapshot_date: string;
  attainment_value: number;
  notes: string | null;
  created_at: string;
}

export interface QuotaFilters {
  user_id?: string;
  period?: string; // e.g., '2026-Q1'
  quota_type?: string;
}

export function useQuotas(filters?: QuotaFilters) {
  return useQuery({
    queryKey: ['quotas', filters || 'all'],
    queryFn: async () => {
      let q = (supabase as any).from('quotas').select('*').order('period_start', { ascending: false }).limit(500);
      if (filters?.user_id) q = q.eq('user_id', filters.user_id);
      if (filters?.quota_type) q = q.eq('quota_type', filters.quota_type);
      if (filters?.period) {
        // Parse period like '2026-Q1' into date range
        const match = filters.period.match(/^(\d{4})-Q([1-4])$/);
        if (match) {
          const year = parseInt(match[1]);
          const quarter = parseInt(match[2]);
          const startMonth = (quarter - 1) * 3 + 1;
          const start = `${year}-${String(startMonth).padStart(2, '0')}-01`;
          const endMonth = quarter * 3;
          const lastDay = new Date(year, endMonth, 0).getDate();
          const end = `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`;
          q = q.gte('period_start', start).lte('period_end', end);
        }
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Quota[];
    },
  });
}

export function useQuota(id: string | undefined) {
  return useQuery({
    queryKey: ['quotas', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('quotas').select('*').eq('id', id!).single();
      if (error) throw error;
      return data as Quota;
    },
  });
}

export function useCreateQuota() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { user_id: string; territory_id?: string; period_start: string; period_end: string; quota_type?: string; target_value: number; currency?: string }) => {
      const { data, error } = await (supabase as any).from('quotas').insert({ ...input, created_by: user?.id }).select().single();
      if (error) throw error;
      return data as Quota;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotas'] }),
  });
}

export function useUpdateQuota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await (supabase as any).from('quotas').update(input).eq('id', id).select().single();
      if (error) throw error;
      return data as Quota;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotas'] }),
  });
}

export function useDeleteQuota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('quotas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotas'] }),
  });
}

export function useQuotaAttainment(quotaId?: string) {
  return useQuery({
    queryKey: ['quota_attainment', quotaId],
    enabled: !!quotaId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('quota_attainment')
        .select('*')
        .eq('quota_id', quotaId!)
        .order('snapshot_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as QuotaAttainment[];
    },
  });
}
