import { useQuery } from '@tanstack/react-query';
import { insightHub } from '@/lib/insightHubClient';

// ─── Types ───────────────────────────────────────────────────────────
export interface FeedTicker {
  ticker_symbol: string;
  company_name: string;
  company_country: string | null;
  exchange_name: string | null;
  number_of_records: number | null;
  datafeed: string;
  gov_contract_rev: number | null;
  total_rev_2023: number | null;
}

export interface UnifiedFeedContract {
  tender_bizportal_id: number;
  tender_title: string | null;
  contracting_entity_name: string | null;
  tender_country: string | null;
  tender_potential_value_of_contract_usd: number | null;
  tender_date_of_award: string | null;
  direct_awardee_name: string | null;
  awardee_parent_name: string | null;
}

export interface GreenFeedContract {
  tender_bizportal_id: number;
  tender_title: string | null;
  contracting_entity_name: string | null;
  tender_country: string | null;
  tender_potential_value_of_contract_usd: number | null;
  tender_date_of_award: string | null;
  direct_awardee_name: string | null;
  awardee_parent_name: string | null;
  green_score: number | null;
}

// ─── Feed Statistics (distinct feeds + company counts) ───────────────
export function useFeedStatistics() {
  return useQuery({
    queryKey: ['insight-hub', 'feed-statistics'],
    queryFn: async () => {
      const { data, error } = await insightHub.rpc('get_feed_statistics' as any);
      if (error) throw error;
      return {
        totalRecords: (data as any).total_records as number,
        uniqueTickers: (data as any).unique_tickers as number,
        countries: (data as any).countries as number,
        feeds: (data as any).feeds as Record<string, number>,
      };
    },
    staleTime: 10 * 60 * 1000,
  });
}

// ─── Feed Tickers (paginated, filterable by feed) ────────────────────
export function useFeedTickers(
  feedName: string,
  page = 1,
  pageSize = 25,
  country?: string,
) {
  return useQuery({
    queryKey: ['insight-hub', 'feed-tickers', feedName, page, pageSize, country],
    queryFn: async () => {
      const offset = (page - 1) * pageSize;
      let query = insightHub
        .from('ticker_lists')
        .select('ticker_symbol, company_name, company_country, exchange_name, number_of_records, datafeed, gov_contract_rev, total_rev_2023')
        .eq('datafeed', feedName);

      if (country && country !== 'all') query = query.eq('company_country', country);

      const orderCol = feedName === 'Unified Feed' ? 'gov_contract_rev' : 'number_of_records';
      const { data, error } = await query
        .order(orderCol, { ascending: false, nullsFirst: false })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;

      // count
      let countQ = insightHub
        .from('ticker_lists')
        .select('*', { count: 'exact', head: true })
        .eq('datafeed', feedName);
      if (country && country !== 'all') countQ = countQ.eq('company_country', country);
      const { count } = await countQ;

      return {
        tickers: (data || []) as FeedTicker[],
        totalCount: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      };
    },
    enabled: !!feedName,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Distinct feed names ─────────────────────────────────────────────
export function useFeedNames() {
  return useQuery({
    queryKey: ['insight-hub', 'feed-names'],
    queryFn: async () => {
      const { data, error } = await insightHub
        .from('ticker_lists')
        .select('datafeed')
        .order('datafeed');
      if (error) throw error;
      const unique = [...new Set((data || []).map((r: any) => r.datafeed))];
      return unique as string[];
    },
    staleTime: 30 * 60 * 1000,
  });
}

// ─── Unified Feed contracts by ticker ────────────────────────────────
export function useUnifiedFeedContracts(ticker: string, limit = 50) {
  return useQuery({
    queryKey: ['insight-hub', 'unified-feed-contracts', ticker, limit],
    queryFn: async () => {
      const { data, error } = await insightHub
        .from('unified_feed')
        .select(
          'tender_bizportal_id, tender_title, contracting_entity_name, tender_country, tender_potential_value_of_contract_usd, tender_date_of_award, direct_awardee_name, awardee_parent_name',
        )
        .or(`awardee_parent_ticker_symbol.eq.${ticker},direct_awardee_ticker_symbol.eq.${ticker}`)
        .order('tender_potential_value_of_contract_usd', { ascending: false, nullsFirst: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as UnifiedFeedContract[];
    },
    enabled: !!ticker,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Green Feed contracts by ticker ──────────────────────────────────
export function useGreenFeedContracts(ticker: string, limit = 50) {
  return useQuery({
    queryKey: ['insight-hub', 'green-feed-contracts', ticker, limit],
    queryFn: async () => {
      const { data, error } = await insightHub
        .from('green_feed')
        .select(
          'tender_bizportal_id, tender_title, contracting_entity_name, tender_country, tender_potential_value_of_contract_usd, tender_date_of_award, direct_awardee_name, awardee_parent_name, green_score',
        )
        .or(`awardee_parent_ticker_symbol.eq.${ticker},direct_awardee_ticker_symbol.eq.${ticker}`)
        .order('green_score', { ascending: false, nullsFirst: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as GreenFeedContract[];
    },
    enabled: !!ticker,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Trade Flows types ───────────────────────────────────────────────
export interface TradeFlowsTicker {
  ticker_symbol: string;
  company_name: string;
  company_country: string | null;
  stock_exchange_name: string | null;
  transactions_as_supplier: number;
  transactions_as_customer: number;
  total_rev_2023: number | null;
}

// ─── Trade Flows Statistics ──────────────────────────────────────────
export function useTradeFlowsStatistics() {
  return useQuery({
    queryKey: ['insight-hub', 'trade-flows-statistics'],
    queryFn: async () => {
      const { data, error } = await insightHub.rpc('get_trade_flows_statistics' as any);
      if (error) throw error;
      return {
        totalRecords: (data as any).total_records as number,
        uniqueTickers: (data as any).unique_tickers as number,
        totalSupplierTransactions: (data as any).total_supplier_transactions as number,
        totalCustomerTransactions: (data as any).total_customer_transactions as number,
        countries: (data as any).countries as number,
      };
    },
    staleTime: 10 * 60 * 1000,
  });
}

// ─── Trade Flows Tickers (paginated) ─────────────────────────────────
export function useTradeFlowsTickers(page = 1, pageSize = 25, country?: string) {
  return useQuery({
    queryKey: ['insight-hub', 'trade-flows-tickers', page, pageSize, country],
    queryFn: async () => {
      const offset = (page - 1) * pageSize;
      let query = insightHub
        .from('trade_flows_ticker_lists')
        .select('ticker_symbol, company_name, company_country, stock_exchange_name, transactions_as_supplier, transactions_as_customer, total_rev_2023');

      if (country && country !== 'all') query = query.eq('company_country', country);

      const { data, error } = await query
        .order('transactions_as_supplier', { ascending: false, nullsFirst: false })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;

      let countQ = insightHub
        .from('trade_flows_ticker_lists')
        .select('*', { count: 'exact', head: true });
      if (country && country !== 'all') countQ = countQ.eq('company_country', country);
      const { count } = await countQ;

      return {
        tickers: (data || []) as TradeFlowsTicker[],
        totalCount: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Trade Flows company search (for client matching) ────────────────
export function useTradeFlowsCompanySearch(searchTerm: string) {
  return useQuery({
    queryKey: ['insight-hub', 'trade-flows-company-search', searchTerm],
    queryFn: async () => {
      const { data, error } = await insightHub
        .from('trade_flows_ticker_lists')
        .select('ticker_symbol, company_name, company_country, stock_exchange_name, transactions_as_supplier, transactions_as_customer, total_rev_2023')
        .ilike('company_name', `%${searchTerm}%`)
        .order('transactions_as_supplier', { ascending: false, nullsFirst: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as TradeFlowsTicker[];
    },
    enabled: searchTerm.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Search tickers by company name (for client matching) ────────────
export function useInsightHubCompanySearch(searchTerm: string) {
  return useQuery({
    queryKey: ['insight-hub', 'company-search', searchTerm],
    queryFn: async () => {
      const { data, error } = await insightHub
        .from('ticker_lists')
        .select('ticker_symbol, company_name, company_country, datafeed, gov_contract_rev, total_rev_2023')
        .ilike('company_name', `%${searchTerm}%`)
        .order('total_rev_2023', { ascending: false, nullsFirst: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as FeedTicker[];
    },
    enabled: searchTerm.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}
