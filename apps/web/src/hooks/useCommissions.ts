import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// ---------- Types ----------
export interface CommissionPlan {
  id: string;
  name: string;
  description: string | null;
  rate: number;
  tier_min: number | null;
  tier_max: number | null;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommissionLedgerEntry {
  id: string;
  user_id: string;
  opportunity_id: string;
  plan_id: string | null;
  base_amount: number;
  commission_amount: number;
  rate: number;
  status: 'pending' | 'approved' | 'paid';
  period_start: string;
  period_end: string;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { full_name: string; email: string };
  opportunities?: { name: string; value: number; clients?: { name: string } };
}

export interface CommissionLedgerFilters {
  user_id?: string;
  status?: string;
  period_start?: string;
  period_end?: string;
}

// ---------- Commission Plans ----------

export function useCommissionPlans() {
  return useQuery({
    queryKey: ['commission_plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commission_plans' as any)
        .select('*')
        .eq('is_active', true)
        .order('effective_from', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CommissionPlan[];
    },
  });
}

export function useCommissionPlan(id: string | undefined) {
  return useQuery({
    queryKey: ['commission_plans', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase.from('commission_plans' as any) as any)
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as CommissionPlan;
    },
  });
}

export function useCreateCommissionPlan() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { name: string; rate: number; description?: string; tier_min?: number; tier_max?: number; effective_from: string; effective_to?: string }) => {
      const { data, error } = await (supabase.from('commission_plans' as any) as any).insert({ ...input, created_by: user?.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commission_plans'] }),
  });
}

export function useUpdateCommissionPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await (supabase.from('commission_plans' as any) as any).update(input).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commission_plans'] }),
  });
}

// ---------- Commission Ledger ----------

export function useCommissionLedger(filters?: CommissionLedgerFilters) {
  return useQuery({
    queryKey: ['commission_ledger', filters],
    queryFn: async () => {
      let q = (supabase.from('commission_ledger' as any) as any)
        .select('*, profiles(full_name, email), opportunities(name, value, clients(name))')
        .order('created_at', { ascending: false })
        .limit(500);
      if (filters?.user_id) q = q.eq('user_id', filters.user_id);
      if (filters?.status) q = q.eq('status', filters.status);
      if (filters?.period_start) q = q.gte('period_start', filters.period_start);
      if (filters?.period_end) q = q.lte('period_end', filters.period_end);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CommissionLedgerEntry[];
    },
  });
}

export function useCreateCommissionEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { user_id: string; opportunity_id: string; plan_id?: string; base_amount: number; commission_amount: number; rate: number; period_start: string; period_end: string; notes?: string }) => {
      const { data, error } = await (supabase.from('commission_ledger' as any) as any).insert({ ...input, status: 'pending' }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commission_ledger'] }),
  });
}

export function useUpdateCommissionEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await (supabase.from('commission_ledger' as any) as any).update(input).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commission_ledger'] }),
  });
}
