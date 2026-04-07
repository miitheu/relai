import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { useAuth } from '@/contexts/AuthContext';
import type { Filter } from '@relai/db';

export interface ForecastCategory { id: string; name: string; sort_order: number; color?: string; created_at: string; }
export interface Forecast { id: string; opportunity_id: string; category_id: string; forecast_value: number; forecast_close_date: string | null; notes: string | null; forecasted_by: string | null; created_at: string; updated_at: string; opportunities?: { name: string; client_id: string; value: number; stage: string; expected_close: string | null; clients?: { name: string } }; forecast_categories?: { name: string }; }
export interface ForecastSnapshot { id: string; period_start: string; period_end: string; snapshot_date: string; commit_amount: number; best_case_amount: number; pipeline_amount: number; closed_won_amount: number; created_at: string; }
export interface ForecastFilters { period_start?: string; period_end?: string; category_id?: string; owner_id?: string; }

export function useForecastCategories() {
  const db = useDb();
  return useQuery({
    queryKey: ['forecast_categories'],
    queryFn: async () => {
      const { data, error } = await db.query('forecast_categories', { order: [{ column: 'sort_order' }] });
      if (error) throw new Error(error.message);
      return (data ?? []) as ForecastCategory[];
    },
  });
}

export function useForecasts(_filters?: ForecastFilters) {
  const db = useDb();
  return useQuery({
    queryKey: ['forecasts'],
    queryFn: async () => {
      const { data, error } = await db.query('forecasts', { select: '*, forecast_categories(name)', order: [{ column: 'created_at', ascending: false }], limit: 500 });
      if (error) throw new Error(error.message);
      return (data ?? []) as Forecast[];
    },
  });
}

export function useCreateForecast() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { opportunity_id: string; category_id: string; amount: number; notes?: string }) => {
      const { data, error } = await db.insert('forecasts', { opportunity_id: input.opportunity_id, category_id: input.category_id, forecast_value: input.amount, notes: input.notes || null, forecasted_by: user?.id });
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forecasts'] }),
  });
}

export function useUpdateForecast() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await db.update('forecasts', { id }, input);
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forecasts'] }),
  });
}

export function useForecastSnapshots(periodStart?: string, periodEnd?: string) {
  const db = useDb();
  return useQuery({
    queryKey: ['forecast_snapshots', periodStart, periodEnd],
    enabled: !!periodStart && !!periodEnd,
    queryFn: async () => {
      const filters: Filter[] = [];
      if (periodStart) filters.push({ column: 'period_start', operator: 'gte', value: periodStart });
      if (periodEnd) filters.push({ column: 'period_end', operator: 'lte', value: periodEnd });
      const { data, error } = await db.query('forecast_snapshots', { filters, order: [{ column: 'snapshot_date', ascending: true }] });
      if (error) throw new Error(error.message);
      return (data ?? []) as ForecastSnapshot[];
    },
  });
}
