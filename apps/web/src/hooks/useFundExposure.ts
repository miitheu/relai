import { useQuery } from '@tanstack/react-query';
import { useSupabase } from '@/hooks/useSupabase';

export interface FundExposureRow {
  id: string;
  fund_id: string;
  report_date: string;
  security_id: string;
  direct_weight_pct: number;
  implied_etf_weight_pct: number;
  total_weight_pct: number;
  source_breakdown_json: any[];
  security?: {
    id: string;
    ticker: string | null;
    issuer_name: string;
    cusip: string | null;
    is_etf: boolean;
  };
}

export function useFundExposure(fundId: string | undefined) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['fund-exposure', fundId],
    enabled: !!fundId,
    queryFn: async () => {
      // Get latest report_date for this fund
      const { data: latest } = await supabase
        .from('fund_effective_exposure' as any)
        .select('report_date')
        .eq('fund_id', fundId!)
        .order('report_date', { ascending: false })
        .limit(1)
        .single();

      if (!latest) return [];

      const { data, error } = await supabase
        .from('fund_effective_exposure' as any)
        .select('*, security:security_id(id, ticker, issuer_name, cusip, is_etf)')
        .eq('fund_id', fundId!)
        .eq('report_date', (latest as any).report_date)
        .order('total_weight_pct', { ascending: false })
        .limit(500);

      if (error) throw error;
      return (data || []) as unknown as FundExposureRow[];
    },
  });
}

export function useFundReportedHoldings(fundId: string | undefined) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['fund-reported-holdings', fundId],
    enabled: !!fundId,
    queryFn: async () => {
      // Get latest filing
      const { data: latestFiling } = await supabase
        .from('fund_filings' as any)
        .select('id, filing_date')
        .eq('fund_id', fundId!)
        .order('filing_date', { ascending: false })
        .limit(1)
        .single();

      if (!latestFiling) return [];

      const { data, error } = await supabase
        .from('fund_reported_holdings' as any)
        .select('*, security:security_id(id, ticker, issuer_name, is_etf)')
        .eq('filing_id', (latestFiling as any).id)
        .order('weight_pct', { ascending: false })
        .limit(500);

      if (error) throw error;
      return data || [];
    },
  });
}
