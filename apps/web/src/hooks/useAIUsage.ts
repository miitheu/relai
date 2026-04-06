import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AIUsageSummaryItem {
  function_name: string;
  model: string;
  total_tokens: number;
  total_cost: number;
  call_count: number;
  avg_response_ms: number;
  error_count: number;
}

export interface AIUsageLogEntry {
  id: string;
  function_name: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  duration_ms: number;
  status: string;
  error_message: string | null;
  user_id: string | null;
  created_at: string;
}

export function useAIUsageSummary(period?: 'today' | 'week' | 'month') {
  return useQuery({
    queryKey: ['ai-usage-summary', period || 'month'],
    queryFn: async () => {
      const now = new Date();
      let since: string;
      if (period === 'today') {
        since = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      } else if (period === 'week') {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        since = d.toISOString();
      } else {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        since = d.toISOString();
      }

      const { data, error } = await supabase
        .from('ai_usage_log' as any)
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5000);
      if (error) throw error;

      const entries = data as unknown as AIUsageLogEntry[];

      // Aggregate by function_name + model
      const map = new Map<string, AIUsageSummaryItem>();
      let totalTokens = 0;
      let totalCost = 0;
      let totalResponseMs = 0;
      let errorCount = 0;

      for (const e of entries) {
        totalTokens += e.total_tokens || 0;
        totalCost += e.cost_usd || 0;
        totalResponseMs += e.duration_ms || 0;
        if (e.status === 'error') errorCount++;

        const key = `${e.function_name}::${e.model}`;
        const existing = map.get(key);
        if (existing) {
          existing.total_tokens += e.total_tokens || 0;
          existing.total_cost += e.cost_usd || 0;
          existing.call_count += 1;
          existing.avg_response_ms += e.duration_ms || 0;
          if (e.status === 'error') existing.error_count += 1;
        } else {
          map.set(key, {
            function_name: e.function_name,
            model: e.model,
            total_tokens: e.total_tokens || 0,
            total_cost: e.cost_usd || 0,
            call_count: 1,
            avg_response_ms: e.duration_ms || 0,
            error_count: e.status === 'error' ? 1 : 0,
          });
        }
      }

      // Finalize avg
      for (const item of map.values()) {
        item.avg_response_ms = item.call_count > 0 ? Math.round(item.avg_response_ms / item.call_count) : 0;
      }

      return {
        items: Array.from(map.values()).sort((a, b) => b.total_tokens - a.total_tokens),
        totalTokens,
        totalCost,
        avgResponseMs: entries.length > 0 ? Math.round(totalResponseMs / entries.length) : 0,
        errorRate: entries.length > 0 ? (errorCount / entries.length) * 100 : 0,
        totalCalls: entries.length,
      };
    },
  });
}

export function useAIUsageLog(filters?: { function_name?: string; status?: string; limit?: number }) {
  return useQuery({
    queryKey: ['ai-usage-log', filters],
    queryFn: async () => {
      let q = supabase
        .from('ai_usage_log' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(filters?.limit || 100);
      if (filters?.function_name) q = q.eq('function_name', filters.function_name);
      if (filters?.status) q = q.eq('status', filters.status);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as AIUsageLogEntry[];
    },
  });
}
