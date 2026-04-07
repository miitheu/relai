import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { useAuth } from '@/contexts/AuthContext';
import type { Filter } from '@relai/db';

export interface CommissionPlan { id: string; name: string; description: string | null; rate: number; tier_min: number | null; tier_max: number | null; effective_from: string; effective_to: string | null; is_active: boolean; created_by: string | null; created_at: string; updated_at: string; }
export interface CommissionLedgerEntry { id: string; user_id: string; opportunity_id: string; plan_id: string | null; base_amount: number; commission_amount: number; rate: number; status: 'pending' | 'approved' | 'paid'; period_start: string; period_end: string; approved_by: string | null; approved_at: string | null; paid_at: string | null; notes: string | null; created_at: string; updated_at: string; profiles?: { full_name: string; email: string }; opportunities?: { name: string; value: number; clients?: { name: string } }; }
export interface CommissionLedgerFilters { user_id?: string; status?: string; period_start?: string; period_end?: string; }

export function useCommissionPlans() {
  const db = useDb();
  return useQuery({
    queryKey: ['commission_plans'],
    queryFn: async () => {
      const { data, error } = await db.query('commission_plans', { filters: [{ column: 'is_active', operator: 'eq', value: true }], order: [{ column: 'effective_from', ascending: false }] });
      if (error) throw new Error(error.message);
      return (data ?? []) as CommissionPlan[];
    },
  });
}

export function useCommissionPlan(id: string | undefined) {
  const db = useDb();
  return useQuery({
    queryKey: ['commission_plans', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db.queryOne('commission_plans', { filters: [{ column: 'id', operator: 'eq', value: id! }] });
      if (error) throw new Error(error.message);
      return data as CommissionPlan;
    },
  });
}

export function useCreateCommissionPlan() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { name: string; rate: number; description?: string; tier_min?: number; tier_max?: number; effective_from: string; effective_to?: string }) => {
      const { data, error } = await db.insert('commission_plans', { ...input, created_by: user?.id });
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commission_plans'] }),
  });
}

export function useUpdateCommissionPlan() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await db.update('commission_plans', { id }, input);
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commission_plans'] }),
  });
}

export function useCommissionLedger(filters?: CommissionLedgerFilters) {
  const db = useDb();
  return useQuery({
    queryKey: ['commission_ledger', filters],
    queryFn: async () => {
      const f: Filter[] = [];
      if (filters?.user_id) f.push({ column: 'user_id', operator: 'eq', value: filters.user_id });
      if (filters?.status) f.push({ column: 'status', operator: 'eq', value: filters.status });
      if (filters?.period_start) f.push({ column: 'period_start', operator: 'gte', value: filters.period_start });
      if (filters?.period_end) f.push({ column: 'period_end', operator: 'lte', value: filters.period_end });
      const { data, error } = await db.query('commission_ledger', { select: '*, profiles(full_name, email), opportunities(name, value, clients(name))', filters: f, order: [{ column: 'created_at', ascending: false }], limit: 500 });
      if (error) throw new Error(error.message);
      return (data ?? []) as CommissionLedgerEntry[];
    },
  });
}

export function useCreateCommissionEntry() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { user_id: string; opportunity_id: string; plan_id?: string; base_amount: number; commission_amount: number; rate: number; period_start: string; period_end: string; notes?: string }) => {
      const { data, error } = await db.insert('commission_ledger', { ...input, status: 'pending' });
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commission_ledger'] }),
  });
}

export function useUpdateCommissionEntry() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await db.update('commission_ledger', { id }, input);
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commission_ledger'] }),
  });
}
