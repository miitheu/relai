import { useEffect } from 'react';
import { useDb } from '@relai/db/react';
import { useQueryClient } from '@tanstack/react-query';
import type { DbAdapter } from '@relai/db';

/**
 * Subscribe to Supabase Realtime changes on a table and auto-invalidate
 * the corresponding React Query cache when changes occur.
 *
 * NOTE: This hook requires the underlying adapter to expose a `raw` Supabase client.
 * For non-Supabase adapters, it silently no-ops.
 */
export function useRealtimeTable(
  table: string,
  queryKey: string[],
  filter?: { column: string; value: string },
) {
  const db = useDb();
  const qc = useQueryClient();

  useEffect(() => {
    if (filter && !filter.value) return;

    // Access raw Supabase client if available (SupabaseAdapter exposes .raw)
    const rawClient = (db as any).raw;
    if (!rawClient || !rawClient.channel) return;

    const channelName = filter
      ? `${table}_${filter.column}_${filter.value}`
      : `${table}_changes`;

    const channel = rawClient
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          ...(filter ? { filter: `${filter.column}=eq.${filter.value}` } : {}),
        },
        () => {
          qc.invalidateQueries({ queryKey });
        },
      )
      .subscribe();

    return () => {
      rawClient.removeChannel(channel);
    };
  }, [table, queryKey.join(','), filter?.column, filter?.value, qc]);
}
