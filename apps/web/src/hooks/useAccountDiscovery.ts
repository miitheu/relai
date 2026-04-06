import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DiscoverySuggestion {
  id: string;
  run_id: string | null;
  name: string;
  normalized_name: string | null;
  suggested_type: string | null;
  country: string | null;
  estimated_aum: string | null;
  similarity_score: number | null;
  product_fit_score: number | null;
  composite_score: number | null;
  discovery_source: string | null;
  similarity_reason: string | null;
  product_fit_reason: string | null;
  recommended_approach: string | null;
  target_datasets: string[];
  sec_cik: string | null;
  status: string;
  imported_client_id: string | null;
  created_at: string;
  seed_client_id: string | null;
  run_type: string | null;
  run_params: any;
  seed_client?: { name: string } | null;
  strategy_classification: string | null;
  strategy_detail: string | null;
}

export function useSavedDiscoveries() {
  return useQuery({
    queryKey: ['saved-discoveries'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await (supabase
        .from('discovery_suggestions') as any)
        .select('discovery_name, run_type, seed_client_id, seed_client:seed_client_id(name), created_at')
        .eq('created_by', user!.id)
        .not('discovery_name', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      // Group by discovery_name and return unique names with metadata
      const seen = new Map<string, any>();
      for (const row of (data || [])) {
        if (!seen.has(row.discovery_name)) {
          seen.set(row.discovery_name, row);
        }
      }
      return Array.from(seen.values()) as { discovery_name: string; run_type: string; seed_client?: { name: string }; created_at: string }[];
    },
  });
}

export function useDiscoveryByName(name?: string) {
  return useQuery({
    queryKey: ['discovery-by-name', name],
    enabled: !!name,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await (supabase
        .from('discovery_suggestions') as any)
        .select('*, seed_client:seed_client_id(name)')
        .eq('created_by', user!.id)
        .eq('discovery_name', name!)
        .eq('status', 'new')
        .order('composite_score', { ascending: false });
      if (error) throw error;
      return (data || []) as DiscoverySuggestion[];
    },
  });
}

export function useDiscoverySuggestions(options?: { status?: string }) {
  const { data: { user: authUser } = {} } = supabase.auth.getSession() ? { data: { user: null } } : { data: { user: null } };

  return useQuery({
    queryKey: ['discovery-suggestions', options?.status],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      let query = (supabase
        .from('discovery_suggestions') as any)
        .select('*, seed_client:seed_client_id(name)')
        .order('composite_score', { ascending: false });

      if (options?.status) {
        query = query.eq('status', options.status);
      }

      // Filter to current user's discoveries
      if (user?.id) {
        query = query.eq('created_by', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as (DiscoverySuggestion & { seed_client?: { name: string } })[];
    },
  });
}

// ---- Client-side discovery using call_anthropic RPC ----

async function buildContext(params: {
  mode: 'lookalike' | 'sector' | 'combined';
  client_id?: string;
  target_sectors?: string[];
  target_regions?: string[];
}) {
  // Fetch existing clients for dedup + ICP
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, client_type, headquarters_country, aum, relationship_status')
    .limit(200);

  // Fetch closed won opportunities for ICP
  const { data: wonOpps } = await supabase
    .from('opportunities')
    .select('id, name, value, client_id, clients(name, client_type, headquarters_country), datasets(name)')
    .eq('stage', 'Closed Won')
    .order('value', { ascending: false })
    .limit(30);

  // Fetch datasets for product context
  const { data: datasets } = await supabase
    .from('datasets')
    .select('id, name, asset_class, category')
    .limit(50);

  // Source client for lookalike
  let sourceClient = null;
  if (params.client_id) {
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('id', params.client_id)
      .single();
    sourceClient = data;
  }

  // Existing client names for dedup
  const existingNames = (clients || []).map((c: any) => c.name.toLowerCase().trim());

  // Build ICP summary
  const typeCounts: Record<string, number> = {};
  const countryCounts: Record<string, number> = {};
  (wonOpps || []).forEach((o: any) => {
    const type = o.clients?.client_type;
    const country = o.clients?.headquarters_country;
    if (type) typeCounts[type] = (typeCounts[type] || 0) + 1;
    if (country) countryCounts[country] = (countryCounts[country] || 0) + 1;
  });

  const topTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);
  const topCountries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);
  const avgDealSize = wonOpps?.length ? Math.round((wonOpps || []).reduce((s: number, o: any) => s + Number(o.value), 0) / wonOpps.length) : 0;
  const datasetNames = (datasets || []).map((d: any) => d.name);

  return {
    existingNames,
    sourceClient,
    icp: { topTypes, topCountries, avgDealSize, totalClients: clients?.length || 0 },
    datasetNames,
    params,
  };
}

function buildPrompt(ctx: Awaited<ReturnType<typeof buildContext>>) {
  const { icp, sourceClient, datasetNames, params } = ctx;

  let modeInstructions = '';
  if (params.mode === 'lookalike' && sourceClient) {
    modeInstructions = `LOOKALIKE MODE: Find companies similar to "${sourceClient.name}" (type: ${sourceClient.client_type}, country: ${sourceClient.headquarters_country}, AUM: ${sourceClient.aum || 'Unknown'}). Focus on companies with similar profile, strategy, and size.`;
  } else if (params.mode === 'sector') {
    const sectors = params.target_sectors?.join(', ') || icp.topTypes.join(', ');
    const regions = params.target_regions?.join(', ') || icp.topCountries.join(', ');
    modeInstructions = `SECTOR MODE: Discover companies in these sectors: ${sectors}. Target regions: ${regions}. Focus on firms that would be strong buyers of alternative data products.`;
  } else {
    modeInstructions = `COMBINED MODE: Use both client pattern matching and sector analysis. Our best client types: ${icp.topTypes.join(', ')}. Top countries: ${icp.topCountries.join(', ')}. Average deal size: $${icp.avgDealSize.toLocaleString()}.`;
  }

  const system = `You are an expert at identifying prospect companies for an alternative data sales team. You analyze market patterns and find companies that would be ideal customers for financial data products.

Our product portfolio includes: ${datasetNames.slice(0, 15).join(', ')}.

Ideal Client Profile:
- Top client types: ${icp.topTypes.join(', ')}
- Top countries: ${icp.topCountries.join(', ')}
- Average deal size: $${icp.avgDealSize.toLocaleString()}
- Total active clients: ${icp.totalClients}

Return ONLY a JSON array of 15-20 prospect objects. Each object must have:
- name: company name
- type: one of "Hedge Fund", "Asset Manager", "Bank", "Insurance", "Pension Fund", "Sovereign Wealth Fund", "Corporate", "Other"
- country: country name
- estimated_aum: string like "$5B" or "$200M" or "Unknown"
- similarity_score: 0-100 (how similar to our existing clients)
- product_fit_score: 0-100 (how well our products fit their needs)
- discovery_source: "ai_analysis"
- similarity_reason: 1 sentence why they're similar to our clients
- product_fit_reason: 1 sentence why our products fit
- recommended_approach: 1 sentence on how to approach them
- target_datasets: array of 1-3 dataset names from our portfolio that best fit

Return ONLY the JSON array, no markdown formatting or explanation.`;

  return { system, user: modeInstructions };
}

export function useRunAccountDiscovery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      mode: 'lookalike' | 'sector' | 'combined';
      client_id?: string;
      target_sectors?: string[];
      target_regions?: string[];
      max_suggestions?: number;
      sources?: string[];
      discovery_name?: string;
    }) => {
      if (params.mode === 'lookalike' && !params.client_id) throw new Error('client_id is required for lookalike mode');

      // Delete old unsaved (unnamed) suggestions before running new discovery
      const { data: { user: cleanupUser } } = await supabase.auth.getUser();
      if (cleanupUser?.id) {
        await (supabase.from('discovery_suggestions') as any)
          .delete()
          .eq('created_by', cleanupUser.id)
          .is('discovery_name', null)
          .eq('status', 'new');
      }

      // Route to v2 edge function when SEC or web sources are selected
      const useV2 = params.sources && (params.sources.includes('sec_edgar') || params.sources.includes('web_search'));
      const functionName = useV2 ? 'account-discovery-v2' : 'account-discovery';

      const { data, error } = await supabase.functions.invoke(functionName, {
        body: {
          client_id: params.client_id,
          mode: params.mode,
          target_sectors: params.target_sectors,
          target_regions: params.target_regions,
          max_suggestions: params.max_suggestions || 20,
          sources: params.sources,
          discovery_name: params.discovery_name,
        },
      });

      if (error) throw error;

      // v2 stores suggestions server-side, v1 needs client-side storage
      if (useV2) {
        return { count: data?.suggestion_count || data?.suggestions?.length || 0, mode: params.mode };
      }

      const suggestions = data?.suggestions || [];
      if (suggestions.length === 0) return { count: 0, mode: params.mode };

      // Store suggestions in DB
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const rows = suggestions
        .filter((s: any) => !s.already_in_crm)
        .slice(0, params.max_suggestions || 20)
        .map((s: any) => ({
          name: s.name,
          normalized_name: s.name.toLowerCase().trim(),
          suggested_type: s.type || null,
          country: s.country || null,
          estimated_aum: null,
          similarity_score: 0,
          product_fit_score: 0,
          discovery_source: 'ai_lookalike',
          similarity_reason: s.similarity_reason || null,
          product_fit_reason: s.product_fit_reason || null,
          recommended_approach: s.recommended_approach || null,
          target_datasets: [],
          seed_client_id: params.client_id || null,
          run_type: params.mode === 'lookalike' ? 'lookalike' : params.mode === 'sector' ? 'sector' : 'combined',
          run_params: { mode: params.mode, client_id: params.client_id || null, sectors: params.target_sectors || [], regions: params.target_regions || [] },
          discovery_name: params.discovery_name || null,
          status: 'new',
          created_by: authUser?.id || null,
        }));

      if (rows.length > 0) {
        const { error: insertErr } = await (supabase
          .from('discovery_suggestions') as any)
          .insert(rows);
        if (insertErr) throw insertErr;
      }

      return { count: rows.length, mode: params.mode };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discovery-suggestions'] });
    },
  });
}

export function useImportSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (suggestion: DiscoverySuggestion) => {
      const { data: client, error: clientErr } = await supabase
        .from('clients')
        .insert({
          name: suggestion.name,
          normalized_name: suggestion.normalized_name || suggestion.name.toLowerCase().trim(),
          client_type: suggestion.suggested_type || 'Other',
          relationship_status: 'Prospect',
          headquarters_country: suggestion.country,
          aum: suggestion.estimated_aum,
          import_source: `discovery_${suggestion.discovery_source}`,
        })
        .select('id')
        .single();

      if (clientErr) throw clientErr;

      if (suggestion.sec_cik && client) {
        await supabase.from('external_source_mappings').insert({
          client_id: client.id,
          external_source_type: 'sec_adviser',
          external_identifier: suggestion.sec_cik,
          external_entity_name: suggestion.name,
          match_method: 'discovery_import',
          confidence_score: 0.8,
        });
      }

      await (supabase
        .from('discovery_suggestions') as any)
        .update({ status: 'imported', imported_client_id: client.id })
        .eq('id', suggestion.id);

      return { clientId: client.id, name: suggestion.name };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discovery-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useDismissSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { error } = await (supabase
        .from('discovery_suggestions') as any)
        .update({ status: 'dismissed', dismissed_reason: reason || null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discovery-suggestions'] });
    },
  });
}
