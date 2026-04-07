import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';

export interface OpportunityProduct {
  id: string;
  opportunity_id: string;
  dataset_id: string;
  revenue: number;
  notes: string | null;
  created_at: string;
  datasets?: { name: string } | null;
}

export function useOpportunityProducts(opportunityId?: string) {
  const db = useDb();
  return useQuery({
    queryKey: ['opportunity-products', opportunityId],
    queryFn: async () => {
      const { data, error } = await db.query('opportunity_products', {
        select: '*, datasets(name)',
        filters: [{ column: 'opportunity_id', operator: 'eq', value: opportunityId! }],
        order: [{ column: 'created_at', ascending: true }],
      });
      if (error) throw new Error(error.message);
      return (data || []) as unknown as OpportunityProduct[];
    },
    enabled: !!opportunityId,
  });
}

export function useAddOpportunityProduct() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ opportunityId, datasetId, revenue, notes }: {
      opportunityId: string;
      datasetId: string;
      revenue: number;
      notes?: string;
    }) => {
      const { data, error } = await db.insert('opportunity_products', {
        opportunity_id: opportunityId,
        dataset_id: datasetId,
        revenue: revenue || 0,
        notes: notes || null,
      });
      if (error) throw new Error(error.message);
      return data[0] as unknown as OpportunityProduct;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['opportunity-products', vars.opportunityId] });
      qc.invalidateQueries({ queryKey: ['opportunities'] });
    },
  });
}

export function useUpdateOpportunityProduct() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, opportunityId, ...updates }: {
      id: string;
      opportunityId: string;
      revenue?: number;
      notes?: string;
    }) => {
      const { data, error } = await db.update('opportunity_products', { id }, updates);
      if (error) throw new Error(error.message);
      return data[0] as unknown as OpportunityProduct;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['opportunity-products', vars.opportunityId] });
      qc.invalidateQueries({ queryKey: ['opportunities'] });
    },
  });
}

export function useRemoveOpportunityProduct() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, opportunityId }: { id: string; opportunityId: string }) => {
      const { error } = await db.delete('opportunity_products', { id });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['opportunity-products', vars.opportunityId] });
      qc.invalidateQueries({ queryKey: ['opportunities'] });
    },
  });
}
