import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { useAuth } from '@/contexts/AuthContext';

export interface ContractLineItem { id: string; contract_id: string; dataset_id: string | null; description: string; quantity: number; unit_price: number; total_price: number; start_date: string | null; end_date: string | null; created_at: string; updated_at: string; datasets?: { name: string }; }
export interface ContractAmendment { id: string; contract_id: string; amendment_number: number; description: string; effective_date: string; old_value: number | null; new_value: number | null; status: string; created_by: string | null; created_at: string; updated_at: string; }

export function useContractLineItems(contractId?: string) {
  const db = useDb();
  return useQuery({
    queryKey: ['contract_line_items', contractId],
    enabled: !!contractId,
    queryFn: async () => {
      const { data, error } = await db.query('contract_line_items', { select: '*, datasets(name)', filters: [{ column: 'contract_id', operator: 'eq', value: contractId! }], order: [{ column: 'created_at' }] });
      if (error) throw new Error(error.message);
      return (data ?? []) as ContractLineItem[];
    },
  });
}

export function useCreateContractLineItem() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { contract_id: string; dataset_id?: string; description: string; quantity: number; unit_price: number; total_price: number; start_date?: string; end_date?: string }) => {
      const { data, error } = await db.insert('contract_line_items', input);
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contract_line_items'] }),
  });
}

export function useUpdateContractLineItem() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await db.update('contract_line_items', { id }, input);
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contract_line_items'] }),
  });
}

export function useDeleteContractLineItem() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.delete('contract_line_items', { id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contract_line_items'] }),
  });
}

export function useContractAmendments(contractId?: string) {
  const db = useDb();
  return useQuery({
    queryKey: ['contract_amendments', contractId],
    enabled: !!contractId,
    queryFn: async () => {
      const { data, error } = await db.query('contract_amendments', { filters: [{ column: 'contract_id', operator: 'eq', value: contractId! }], order: [{ column: 'amendment_number' }] });
      if (error) throw new Error(error.message);
      return (data ?? []) as ContractAmendment[];
    },
  });
}

export function useCreateContractAmendment() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { contract_id: string; amendment_number: number; description: string; effective_date: string; old_value?: number; new_value?: number; status?: string }) => {
      const { data, error } = await db.insert('contract_amendments', { ...input, created_by: user?.id });
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contract_amendments'] }),
  });
}
