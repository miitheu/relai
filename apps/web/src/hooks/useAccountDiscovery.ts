import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';

export interface DiscoverySuggestion {
  id: string; run_id: string | null; name: string; normalized_name: string | null; suggested_type: string | null; country: string | null; estimated_aum: string | null; similarity_score: number | null; product_fit_score: number | null; composite_score: number | null; discovery_source: string | null; similarity_reason: string | null; product_fit_reason: string | null; recommended_approach: string | null; target_datasets: string[]; sec_cik: string | null; status: string; imported_client_id: string | null; created_at: string; seed_client_id: string | null; run_type: string | null; run_params: any; seed_client?: { name: string } | null; strategy_classification: string | null; strategy_detail: string | null;
}

export function useSavedDiscoveries() {
  const db = useDb();
  return useQuery({
    queryKey: ['saved-discoveries'],
    queryFn: async () => {
      const user = await db.getCurrentUser();
      const { data, error } = await db.query('discovery_suggestions', {
        select: 'discovery_name, run_type, seed_client_id, seed_client:seed_client_id(name), created_at',
        filters: [{ column: 'created_by', operator: 'eq', value: user!.id }],
        not: [{ column: 'discovery_name', operator: 'is', value: null }],
        order: [{ column: 'created_at', ascending: false }],
      });
      if (error) throw new Error(error.message);
      const seen = new Map<string, any>();
      for (const row of (data || [])) { if (!seen.has(row.discovery_name)) seen.set(row.discovery_name, row); }
      return Array.from(seen.values()) as { discovery_name: string; run_type: string; seed_client?: { name: string }; created_at: string }[];
    },
  });
}

export function useDiscoveryByName(name?: string) {
  const db = useDb();
  return useQuery({
    queryKey: ['discovery-by-name', name], enabled: !!name,
    queryFn: async () => {
      const user = await db.getCurrentUser();
      const { data, error } = await db.query('discovery_suggestions', {
        select: '*, seed_client:seed_client_id(name)',
        filters: [{ column: 'created_by', operator: 'eq', value: user!.id }, { column: 'discovery_name', operator: 'eq', value: name! }, { column: 'status', operator: 'eq', value: 'new' }],
        order: [{ column: 'composite_score', ascending: false }],
      });
      if (error) throw new Error(error.message);
      return (data || []) as DiscoverySuggestion[];
    },
  });
}

export function useDiscoverySuggestions(options?: { status?: string }) {
  const db = useDb();
  return useQuery({
    queryKey: ['discovery-suggestions', options?.status],
    queryFn: async () => {
      const user = await db.getCurrentUser();
      const filters: any[] = [];
      if (options?.status) filters.push({ column: 'status', operator: 'eq', value: options.status });
      if (user?.id) filters.push({ column: 'created_by', operator: 'eq', value: user.id });
      const { data, error } = await db.query('discovery_suggestions', {
        select: '*, seed_client:seed_client_id(name)', filters,
        order: [{ column: 'composite_score', ascending: false }],
      });
      if (error) throw new Error(error.message);
      return (data || []) as (DiscoverySuggestion & { seed_client?: { name: string } })[];
    },
  });
}

export function useRunAccountDiscovery() {
  const db = useDb();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { mode: 'lookalike' | 'sector' | 'combined'; client_id?: string; target_sectors?: string[]; target_regions?: string[]; max_suggestions?: number; sources?: string[]; discovery_name?: string; }) => {
      if (params.mode === 'lookalike' && !params.client_id) throw new Error('client_id is required for lookalike mode');
      const cleanupUser = await db.getCurrentUser();
      if (cleanupUser?.id) {
        // Delete old unsaved suggestions - need to find them first
        const { data: oldSugs } = await db.query('discovery_suggestions', {
          select: 'id', filters: [
            { column: 'created_by', operator: 'eq', value: cleanupUser.id },
            { column: 'status', operator: 'eq', value: 'new' },
          ],
          // discovery_name is null filter
        });
        // Filter client-side for null discovery_name since `is null` needs special handling
        for (const s of (oldSugs || []).filter((s: any) => !s.discovery_name)) {
          await db.delete('discovery_suggestions', { id: s.id });
        }
      }
      const useV2 = params.sources && (params.sources.includes('sec_edgar') || params.sources.includes('web_search'));
      const functionName = useV2 ? 'account-discovery-v2' : 'account-discovery';
      const { data, error } = await db.invoke(functionName, {
        client_id: params.client_id, mode: params.mode, target_sectors: params.target_sectors, target_regions: params.target_regions,
        max_suggestions: params.max_suggestions || 20, sources: params.sources, discovery_name: params.discovery_name,
      });
      if (error) throw error;
      if (useV2) return { count: data?.suggestion_count || data?.suggestions?.length || 0, mode: params.mode };
      const suggestions = data?.suggestions || [];
      if (suggestions.length === 0) return { count: 0, mode: params.mode };
      const authUser = await db.getCurrentUser();
      const rows = suggestions.filter((s: any) => !s.already_in_crm).slice(0, params.max_suggestions || 20).map((s: any) => ({
        name: s.name, normalized_name: s.name.toLowerCase().trim(), suggested_type: s.type || null, country: s.country || null,
        estimated_aum: null, similarity_score: 0, product_fit_score: 0, discovery_source: 'ai_lookalike',
        similarity_reason: s.similarity_reason || null, product_fit_reason: s.product_fit_reason || null, recommended_approach: s.recommended_approach || null,
        target_datasets: [], seed_client_id: params.client_id || null,
        run_type: params.mode === 'lookalike' ? 'lookalike' : params.mode === 'sector' ? 'sector' : 'combined',
        run_params: { mode: params.mode, client_id: params.client_id || null, sectors: params.target_sectors || [], regions: params.target_regions || [] },
        discovery_name: params.discovery_name || null, status: 'new', created_by: authUser?.id || null,
      }));
      if (rows.length > 0) {
        const { error: insertErr } = await db.insert('discovery_suggestions', rows);
        if (insertErr) throw new Error(insertErr.message);
      }
      return { count: rows.length, mode: params.mode };
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['discovery-suggestions'] }); },
  });
}

export function useImportSuggestion() {
  const db = useDb();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (suggestion: DiscoverySuggestion) => {
      const { data: clientArr, error: clientErr } = await db.insert('clients', {
        name: suggestion.name, normalized_name: suggestion.normalized_name || suggestion.name.toLowerCase().trim(),
        client_type: suggestion.suggested_type || 'Other', relationship_status: 'Prospect',
        headquarters_country: suggestion.country, aum: suggestion.estimated_aum,
        import_source: `discovery_${suggestion.discovery_source}`,
      });
      if (clientErr) throw new Error(clientErr.message);
      const client = clientArr[0];
      if (suggestion.sec_cik && client) {
        await db.insert('external_source_mappings', {
          client_id: client.id, external_source_type: 'sec_adviser', external_identifier: suggestion.sec_cik,
          external_entity_name: suggestion.name, match_method: 'discovery_import', confidence_score: 0.8,
        });
      }
      await db.update('discovery_suggestions', { id: suggestion.id }, { status: 'imported', imported_client_id: client.id });
      return { clientId: client.id, name: suggestion.name };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discovery-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useDismissSuggestion() {
  const db = useDb();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { error } = await db.update('discovery_suggestions', { id }, { status: 'dismissed', dismissed_reason: reason || null });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['discovery-suggestions'] }); },
  });
}
