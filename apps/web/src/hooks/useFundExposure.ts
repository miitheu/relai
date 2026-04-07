import { useQuery } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';

export interface FundExposureRow { id: string; fund_id: string; report_date: string; security_id: string; direct_weight_pct: number; implied_etf_weight_pct: number; total_weight_pct: number; source_breakdown_json: any[]; security?: { id: string; ticker: string | null; issuer_name: string; cusip: string | null; is_etf: boolean; }; }

export function useFundExposure(fundId: string | undefined) {
  const db = useDb();
  return useQuery({
    queryKey: ['fund-exposure', fundId],
    enabled: !!fundId,
    queryFn: async () => {
      const { data: latestArr } = await db.query('fund_effective_exposure', { select: 'report_date', filters: [{ column: 'fund_id', operator: 'eq', value: fundId! }], order: [{ column: 'report_date', ascending: false }], limit: 1 });
      const latest = latestArr?.[0];
      if (!latest) return [];
      const { data, error } = await db.query('fund_effective_exposure', { select: '*, security:security_id(id, ticker, issuer_name, cusip, is_etf)', filters: [{ column: 'fund_id', operator: 'eq', value: fundId! }, { column: 'report_date', operator: 'eq', value: (latest as any).report_date }], order: [{ column: 'total_weight_pct', ascending: false }], limit: 500 });
      if (error) throw new Error(error.message);
      return (data || []) as unknown as FundExposureRow[];
    },
  });
}

export function useFundReportedHoldings(fundId: string | undefined) {
  const db = useDb();
  return useQuery({
    queryKey: ['fund-reported-holdings', fundId],
    enabled: !!fundId,
    queryFn: async () => {
      const { data: filingArr } = await db.query('fund_filings', { select: 'id, filing_date', filters: [{ column: 'fund_id', operator: 'eq', value: fundId! }], order: [{ column: 'filing_date', ascending: false }], limit: 1 });
      const latestFiling = filingArr?.[0];
      if (!latestFiling) return [];
      const { data, error } = await db.query('fund_reported_holdings', { select: '*, security:security_id(id, ticker, issuer_name, is_etf)', filters: [{ column: 'filing_id', operator: 'eq', value: (latestFiling as any).id }], order: [{ column: 'weight_pct', ascending: false }], limit: 500 });
      if (error) throw new Error(error.message);
      return data || [];
    },
  });
}
