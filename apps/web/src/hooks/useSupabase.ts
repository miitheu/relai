import { useDb } from '@relai/db/react';
import { SupabaseAdapter } from '@relai/db';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Bridge hook: returns the underlying Supabase client from the DbAdapter.
 *
 * Usage in hooks/components that still use the Supabase query builder:
 *   const supabase = useSupabase();
 *   const { data } = await supabase.from('table').select('*');
 *
 * This hook exists for incremental migration. New code should prefer
 * useDb() with db.query(), db.insert(), db.update(), db.delete().
 *
 * In self-hosted mode (PostgresAdapter), this hook will throw — hooks
 * that still call it must be migrated to use useDb() abstract methods.
 */
export function useSupabase(): SupabaseClient {
  const db = useDb();
  if (db instanceof SupabaseAdapter) {
    return db.raw;
  }
  throw new Error(
    'useSupabase() requires hosted mode (SupabaseAdapter). ' +
    'Migrate this hook to use useDb() abstract methods for self-hosted support.'
  );
}
