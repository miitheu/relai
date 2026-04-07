import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { useToast } from '@/hooks/use-toast';

export interface EntityResolution { id: string; client_id: string; source_name: string; normalized_name: string | null; canonical_name: string | null; entity_type: string; sec_filer_name: string | null; sec_cik: string | null; resolution_status: string; confidence_score: number; matched_by: string | null; manually_confirmed: boolean; match_candidates: SECCandidate[]; resolved_by: string | null; resolved_at: string | null; created_at: string; updated_at: string; }
export interface SECCandidate { name: string; cik: string; filing_date: string | null; filing_type: string | null; confidence: number; match_method: string; match_reasons?: string[]; }
export interface ExternalSourceMapping { id: string; client_id: string; resolution_id: string | null; external_source_type: string; external_entity_name: string; external_identifier: string | null; source_url: string | null; confidence_score: number; match_method: string | null; match_reasons: string[]; manually_confirmed: boolean; confirmed_at: string | null; metadata_json: any; created_at: string; updated_at: string; }

export function useEntityResolution(clientId?: string) {
  const db = useDb();
  return useQuery({
    queryKey: ['entity-resolution', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await db.queryOne('account_entity_resolutions', { filters: [{ column: 'client_id', operator: 'eq', value: clientId! }] });
      if (error && (error as any).code !== 'PGRST116') throw new Error(error.message);
      return (data as unknown as EntityResolution) || null;
    },
  });
}

export function useExternalSourceMappings(clientId?: string) {
  const db = useDb();
  return useQuery({
    queryKey: ['external-source-mappings', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await db.query('external_source_mappings', { filters: [{ column: 'client_id', operator: 'eq', value: clientId! }], order: [{ column: 'confidence_score', ascending: false }] });
      if (error) throw new Error(error.message);
      return (data || []) as unknown as ExternalSourceMapping[];
    },
  });
}

export function useResolveEntity() {
  const db = useDb();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ clientId }: { clientId: string }) => {
      const { data, error } = await db.invoke('resolve-entity', { client_id: clientId });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data, variables) => {
      const status = data.status;
      if (status === 'auto_matched') toast({ title: 'Entity resolved', description: `Matched to ${data.resolution?.canonical_name || data.resolution?.sec_filer_name}` });
      else if (status === 'needs_review') toast({ title: 'Review required', description: 'Multiple potential matches found. Please review and confirm.' });
      else toast({ title: 'No match found', description: 'This account could not be matched automatically.' });
      qc.invalidateQueries({ queryKey: ['entity-resolution', variables.clientId] });
      qc.invalidateQueries({ queryKey: ['external-source-mappings', variables.clientId] });
      qc.invalidateQueries({ queryKey: ['entity-resolutions-all'] });
    },
    onError: (err: Error) => { toast({ title: 'Entity resolution failed', description: err.message, variant: 'destructive' }); },
  });
}

export function useConfirmEntity() {
  const db = useDb();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ clientId, secCik, secFilerName, additionalMatches, sourceType, externalIdentifier, externalName }: { clientId: string; secCik?: string; secFilerName?: string; additionalMatches?: { cik: string; name: string; source_type?: string }[]; sourceType?: string; externalIdentifier?: string; externalName?: string; }) => {
      const { data, error } = await db.invoke('resolve-entity', { client_id: clientId, action: 'confirm', sec_cik: secCik, sec_filer_name: secFilerName, source_type: sourceType, external_identifier: externalIdentifier || secCik, external_name: externalName || secFilerName, additional_matches: additionalMatches });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, variables) => {
      toast({ title: 'Entity confirmed', description: 'Mapping saved successfully.' });
      qc.invalidateQueries({ queryKey: ['entity-resolution', variables.clientId] });
      qc.invalidateQueries({ queryKey: ['external-source-mappings', variables.clientId] });
      qc.invalidateQueries({ queryKey: ['entity-resolutions-all'] });
    },
    onError: (err: Error) => { toast({ title: 'Confirmation failed', description: err.message, variant: 'destructive' }); },
  });
}

export function useRejectEntity() {
  const db = useDb();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ clientId }: { clientId: string }) => {
      const { data, error } = await db.invoke('resolve-entity', { client_id: clientId, action: 'reject' });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, variables) => {
      toast({ title: 'Marked as not applicable' });
      qc.invalidateQueries({ queryKey: ['entity-resolution', variables.clientId] });
      qc.invalidateQueries({ queryKey: ['entity-resolutions-all'] });
    },
    onError: (err: Error) => { toast({ title: 'Action failed', description: err.message, variant: 'destructive' }); },
  });
}

export function useAllEntityResolutions() {
  const db = useDb();
  return useQuery({
    queryKey: ['entity-resolutions-all'],
    queryFn: async () => {
      const { data, error } = await db.query('account_entity_resolutions', { select: '*, clients(name, client_type)', order: [{ column: 'created_at', ascending: false }] });
      if (error) throw new Error(error.message);
      return data as unknown as (EntityResolution & { clients: { name: string; client_type: string } })[];
    },
  });
}

export function useBatchResolveEntities() {
  const db = useDb();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ batchSize, offset, entityTypeFilter }: { batchSize?: number; offset?: number; entityTypeFilter?: string } = {}) => {
      const { data, error } = await db.invoke('batch-resolve-entities', { batch_size: batchSize || 10, offset: offset || 0, only_sec: false, entity_type_filter: entityTypeFilter || null });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { success: boolean; processed: number; remaining: number; total_candidates: number; results: any[] };
    },
    onSuccess: (data) => {
      toast({ title: `Resolved ${data.processed} entities`, description: `${data.remaining} remaining. Auto-matched: ${data.results.filter((r: any) => r.status === 'auto_matched').length}, Needs review: ${data.results.filter((r: any) => r.status === 'needs_review').length}` });
      qc.invalidateQueries({ queryKey: ['entity-resolutions-all'] });
    },
    onError: (err: Error) => { toast({ title: 'Batch resolution failed', description: err.message, variant: 'destructive' }); },
  });
}
