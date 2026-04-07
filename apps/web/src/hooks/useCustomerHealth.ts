import { useQuery } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';

export interface CustomerHealthScore {
  id: string;
  client_id: string;
  overall_score: number;
  engagement_score: number | null;
  product_usage_score: number | null;
  renewal_risk_score: number | null;
  support_health_score: number | null;
  calculated_at: string;
  factors: Record<string, any> | null;
}

export interface CustomerHealthListItem {
  client_id: string;
  client_name: string;
  overall_score: number;
  engagement_score: number | null;
  product_usage_score: number | null;
  renewal_risk_score: number | null;
  support_health_score: number | null;
  calculated_at: string;
}

export function useCustomerHealth(clientId: string | undefined) {
  const db = useDb();
  return useQuery({
    queryKey: ['customer-health', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await db.query('customer_health_scores', {
        filters: [{ column: 'client_id', operator: 'eq', value: clientId! }],
        order: [{ column: 'calculated_at', ascending: false }],
        limit: 30,
      });
      if (error) throw new Error(error.message);
      const scores = data as unknown as CustomerHealthScore[];
      return { latest: scores[0] || null, history: scores };
    },
  });
}

export function useCustomerHealthList() {
  const db = useDb();
  return useQuery({
    queryKey: ['customer-health-list'],
    queryFn: async () => {
      const { data, error } = await db.query('customer_health_scores', {
        select: '*, clients(name)',
        order: [{ column: 'calculated_at', ascending: false }],
        limit: 500,
      });
      if (error) throw new Error(error.message);
      const seen = new Map<string, CustomerHealthListItem>();
      for (const row of data as any[]) {
        if (!seen.has(row.client_id)) {
          seen.set(row.client_id, {
            client_id: row.client_id,
            client_name: row.clients?.name || 'Unknown',
            overall_score: row.overall_score,
            engagement_score: row.engagement_score,
            product_usage_score: row.product_usage_score,
            renewal_risk_score: row.renewal_risk_score,
            support_health_score: row.support_health_score,
            calculated_at: row.calculated_at,
          });
        }
      }
      return Array.from(seen.values());
    },
  });
}
