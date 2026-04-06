import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
  return useQuery({
    queryKey: ['opportunity-products', opportunityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('opportunity_products' as any)
        .select('*, datasets(name)')
        .eq('opportunity_id', opportunityId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as OpportunityProduct[];
    },
    enabled: !!opportunityId,
  });
}

export function useAddOpportunityProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ opportunityId, datasetId, revenue, notes }: {
      opportunityId: string;
      datasetId: string;
      revenue: number;
      notes?: string;
    }) => {
      const { data, error } = await supabase
        .from('opportunity_products' as any)
        .insert({
          opportunity_id: opportunityId,
          dataset_id: datasetId,
          revenue: revenue || 0,
          notes: notes || null,
        } as any)
        .select('*, datasets(name)')
        .single();
      if (error) throw error;
      return data as unknown as OpportunityProduct;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['opportunity-products', vars.opportunityId] });
      qc.invalidateQueries({ queryKey: ['opportunities'] });
    },
  });
}

export function useUpdateOpportunityProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, opportunityId, ...updates }: {
      id: string;
      opportunityId: string;
      revenue?: number;
      notes?: string;
    }) => {
      const { data, error } = await supabase
        .from('opportunity_products' as any)
        .update(updates as any)
        .eq('id', id)
        .select('*, datasets(name)')
        .single();
      if (error) throw error;
      return data as unknown as OpportunityProduct;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['opportunity-products', vars.opportunityId] });
      qc.invalidateQueries({ queryKey: ['opportunities'] });
    },
  });
}

export function useRemoveOpportunityProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, opportunityId }: { id: string; opportunityId: string }) => {
      const { error } = await supabase
        .from('opportunity_products' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['opportunity-products', vars.opportunityId] });
      qc.invalidateQueries({ queryKey: ['opportunities'] });
    },
  });
}
