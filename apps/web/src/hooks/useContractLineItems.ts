import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuth } from '@/contexts/AuthContext';

// ---------- Types ----------
export interface ContractLineItem {
  id: string;
  contract_id: string;
  dataset_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
  datasets?: { name: string };
}

export interface ContractAmendment {
  id: string;
  contract_id: string;
  amendment_number: number;
  description: string;
  effective_date: string;
  old_value: number | null;
  new_value: number | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- Line Items ----------

export function useContractLineItems(contractId?: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['contract_line_items', contractId],
    enabled: !!contractId,
    queryFn: async () => {
      const { data, error } = await (supabase.from('contract_line_items' as any) as any)
        .select('*, datasets(name)')
        .eq('contract_id', contractId!)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as ContractLineItem[];
    },
  });
}

export function useCreateContractLineItem() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { contract_id: string; dataset_id?: string; description: string; quantity: number; unit_price: number; total_price: number; start_date?: string; end_date?: string }) => {
      const { data, error } = await (supabase.from('contract_line_items' as any) as any).insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contract_line_items'] }),
  });
}

export function useUpdateContractLineItem() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await (supabase.from('contract_line_items' as any) as any).update(input).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contract_line_items'] }),
  });
}

export function useDeleteContractLineItem() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('contract_line_items' as any) as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contract_line_items'] }),
  });
}

// ---------- Amendments ----------

export function useContractAmendments(contractId?: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['contract_amendments', contractId],
    enabled: !!contractId,
    queryFn: async () => {
      const { data, error } = await (supabase.from('contract_amendments' as any) as any)
        .select('*')
        .eq('contract_id', contractId!)
        .order('amendment_number');
      if (error) throw error;
      return (data ?? []) as ContractAmendment[];
    },
  });
}

export function useCreateContractAmendment() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { contract_id: string; amendment_number: number; description: string; effective_date: string; old_value?: number; new_value?: number; status?: string }) => {
      const { data, error } = await (supabase.from('contract_amendments' as any) as any).insert({ ...input, created_by: user?.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contract_amendments'] }),
  });
}
