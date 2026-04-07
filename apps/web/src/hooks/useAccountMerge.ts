import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { useToast } from '@/hooks/use-toast';

export interface ClusterMember { id: string; name: string; match_reasons: string[]; member_confidence: number; }
export interface ClusterEdge { id_a: string; id_b: string; confidence: number; match_type: string; reasons: string[]; }
export interface DuplicateCluster { cluster_id: string; members: ClusterMember[]; max_confidence: number; avg_confidence: number; match_types: string[]; all_reasons: string[]; member_count: number; edges: ClusterEdge[]; }
export interface MergeEvent { id: string; primary_account_id: string; secondary_account_id: string; merged_by: string; merged_at: string; merge_summary_json: { primary_name: string; secondary_name: string; records_moved: Record<string, number>; total_records_moved: number; }; created_at: string; }

export function useDetectDuplicates() {
  const db = useDb();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ minConfidence = 50 }: { minConfidence?: number } = {}) => {
      const { data, error } = await db.invoke('detect-duplicates', { min_confidence: minConfidence, limit: 500 });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { success: boolean; total_accounts: number; cluster_count: number; total_edges: number; clusters: DuplicateCluster[]; };
    },
    onError: (err: Error) => { toast({ title: 'Duplicate detection failed', description: err.message, variant: 'destructive' }); },
  });
}

export function useMergeAccounts() {
  const db = useDb();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ primaryAccountId, secondaryAccountId, userId }: { primaryAccountId: string; secondaryAccountId: string; userId?: string; }) => {
      const { data, error } = await db.invoke('merge-accounts', { primary_account_id: primaryAccountId, secondary_account_id: secondaryAccountId, user_id: userId });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast({ title: 'Accounts merged', description: `${data.summary.total_records_moved} records moved successfully.` });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['merge-history'] });
    },
    onError: (err: Error) => { toast({ title: 'Merge failed', description: err.message, variant: 'destructive' }); },
  });
}

export function useMergeHistory() {
  const db = useDb();
  return useQuery({
    queryKey: ['merge-history'],
    queryFn: async () => {
      const { data, error } = await db.query('account_merge_events', { order: [{ column: 'merged_at', ascending: false }], limit: 100 });
      if (error) throw new Error(error.message);
      return (data || []) as unknown as MergeEvent[];
    },
  });
}

export function useAccountLinkedCounts(clientId?: string) {
  const db = useDb();
  return useQuery({
    queryKey: ['account-linked-counts', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const counts: Record<string, number> = {};
      const tables = ['contacts', 'opportunities', 'contracts', 'deliveries', 'notes', 'activities', 'emails', 'meetings'];
      const results = await Promise.all(
        tables.map(table =>
          db.query(table, { count: 'exact', head: true, filters: [{ column: 'client_id', operator: 'eq', value: clientId! }] })
        )
      );
      tables.forEach((table, i) => { counts[table] = results[i].count || 0; });
      return counts;
    },
  });
}
