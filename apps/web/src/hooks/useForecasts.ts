import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuth } from '@/contexts/AuthContext';

// ---------- Types ----------
export interface ForecastCategory {
  id: string;
  name: string;
  sort_order: number;
  color?: string;
  created_at: string;
}

export interface Forecast {
  id: string;
  opportunity_id: string;
  category_id: string;
  forecast_value: number;
  forecast_close_date: string | null;
  notes: string | null;
  forecasted_by: string | null;
  created_at: string;
  updated_at: string;
  opportunities?: { name: string; client_id: string; value: number; stage: string; expected_close: string | null; clients?: { name: string } };
  forecast_categories?: { name: string };
}

export interface ForecastSnapshot {
  id: string;
  period_start: string;
  period_end: string;
  snapshot_date: string;
  commit_amount: number;
  best_case_amount: number;
  pipeline_amount: number;
  closed_won_amount: number;
  created_at: string;
}

export interface ForecastFilters {
  period_start?: string;
  period_end?: string;
  category_id?: string;
  owner_id?: string;
}

// ---------- Queries ----------

export function useForecastCategories() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['forecast_categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('forecast_categories' as any)
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as ForecastCategory[];
    },
  });
}

export function useForecasts(_filters?: ForecastFilters) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['forecasts'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('forecasts' as any) as any)
        .select('*, forecast_categories(name)')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Forecast[];
    },
  });
}

// ---------- Mutations ----------

export function useCreateForecast() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { opportunity_id: string; category_id: string; amount: number; notes?: string }) => {
      const { data, error } = await (supabase.from('forecasts' as any) as any).insert({
        opportunity_id: input.opportunity_id,
        category_id: input.category_id,
        forecast_value: input.amount,
        notes: input.notes || null,
        forecasted_by: user?.id,
      }).select('*, forecast_categories(name)').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forecasts'] }),
  });
}

export function useUpdateForecast() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await (supabase.from('forecasts' as any) as any).update(input).eq('id', id).select('*, forecast_categories(name)').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forecasts'] }),
  });
}

export function useForecastSnapshots(periodStart?: string, periodEnd?: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['forecast_snapshots', periodStart, periodEnd],
    enabled: !!periodStart && !!periodEnd,
    queryFn: async () => {
      let q = (supabase.from('forecast_snapshots' as any) as any)
        .select('*')
        .order('snapshot_date', { ascending: true });
      if (periodStart) q = q.gte('period_start', periodStart);
      if (periodEnd) q = q.lte('period_end', periodEnd);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ForecastSnapshot[];
    },
  });
}
