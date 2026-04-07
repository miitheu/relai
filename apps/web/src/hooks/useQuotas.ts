import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { useAuth } from '@/contexts/AuthContext';
import type { Filter } from '@relai/db';

export interface Quota { id: string; user_id: string; territory_id: string | null; period_start: string; period_end: string; quota_type: 'revenue' | 'deals' | 'meetings' | 'pipeline'; target_value: number; currency: string | null; created_by: string | null; created_at: string; updated_at: string; }
export interface QuotaAttainment { id: string; quota_id: string; snapshot_date: string; attainment_value: number; notes: string | null; created_at: string; }
export interface QuotaFilters { user_id?: string; period?: string; quota_type?: string; }

export function useQuotas(filters?: QuotaFilters) {
  const db = useDb();
  return useQuery({
    queryKey: ['quotas', filters || 'all'],
    queryFn: async () => {
      const f: Filter[] = [];
      if (filters?.user_id) f.push({ column: 'user_id', operator: 'eq', value: filters.user_id });
      if (filters?.quota_type) f.push({ column: 'quota_type', operator: 'eq', value: filters.quota_type });
      if (filters?.period) {
        const match = filters.period.match(/^(\d{4})-Q([1-4])$/);
        if (match) {
          const year = parseInt(match[1]);
          const quarter = parseInt(match[2]);
          const startMonth = (quarter - 1) * 3 + 1;
          const start = `${year}-${String(startMonth).padStart(2, '0')}-01`;
          const endMonth = quarter * 3;
          const lastDay = new Date(year, endMonth, 0).getDate();
          const end = `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`;
          f.push({ column: 'period_start', operator: 'gte', value: start });
          f.push({ column: 'period_end', operator: 'lte', value: end });
        }
      }
      const { data, error } = await db.query('quotas', { filters: f, order: [{ column: 'period_start', ascending: false }], limit: 500 });
      if (error) throw new Error(error.message);
      return (data ?? []) as Quota[];
    },
  });
}

export function useQuota(id: string | undefined) {
  const db = useDb();
  return useQuery({
    queryKey: ['quotas', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db.queryOne('quotas', { filters: [{ column: 'id', operator: 'eq', value: id! }] });
      if (error) throw new Error(error.message);
      return data as Quota;
    },
  });
}

export function useCreateQuota() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { user_id: string; territory_id?: string; period_start: string; period_end: string; quota_type?: string; target_value: number; currency?: string }) => {
      const { data, error } = await db.insert('quotas', { ...input, created_by: user?.id });
      if (error) throw new Error(error.message);
      return data[0] as Quota;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotas'] }),
  });
}

export function useUpdateQuota() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await db.update('quotas', { id }, input);
      if (error) throw new Error(error.message);
      return data[0] as Quota;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotas'] }),
  });
}

export function useDeleteQuota() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.delete('quotas', { id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotas'] }),
  });
}

export function useQuotaAttainment(quotaId?: string) {
  const db = useDb();
  return useQuery({
    queryKey: ['quota_attainment', quotaId],
    enabled: !!quotaId,
    queryFn: async () => {
      const { data, error } = await db.query('quota_attainment', { filters: [{ column: 'quota_id', operator: 'eq', value: quotaId! }], order: [{ column: 'snapshot_date', ascending: false }] });
      if (error) throw new Error(error.message);
      return (data ?? []) as QuotaAttainment[];
    },
  });
}
