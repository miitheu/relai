import { useEffect } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Subscribe to Supabase Realtime changes on a table and auto-invalidate
 * the corresponding React Query cache when changes occur.
 *
 * Use this to replace polling (refetchInterval) patterns.
 */
export function useRealtimeTable(
  table: string,
  queryKey: string[],
  filter?: { column: string; value: string },
) {
  const supabase = useSupabase();
  const qc = useQueryClient();

  useEffect(() => {
    if (filter && !filter.value) return;

    const channelName = filter
      ? `${table}_${filter.column}_${filter.value}`
      : `${table}_changes`;

    const channel = supabase
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
      supabase.removeChannel(channel);
    };
  }, [table, queryKey.join(','), filter?.column, filter?.value, qc]);
}
