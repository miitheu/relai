// ============================================================================
// @relai/db — Database Abstraction Layer
// ============================================================================

export type {
  DbAdapter,
  DbConfig,
  DbMode,
  HostedConfig,
  SelfHostedConfig,
  DbError,
  QueryOptions,
  UpsertOptions,
  Filter,
  FilterOperator,
  OrderBy,
  User,
  Session,
  AuthChangeEvent,
  RealtimeEvent,
  RealtimePayload,
  Subscription,
  UploadResult,
} from "./types";

export { SupabaseAdapter } from "./adapters/supabase";
export { PostgresAdapter } from "./adapters/postgres";

import type { DbAdapter, DbConfig } from "./types";
import { SupabaseAdapter } from "./adapters/supabase";
import { PostgresAdapter } from "./adapters/postgres";

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createDbAdapter(config: DbConfig): DbAdapter {
  switch (config.mode) {
    case "hosted":
      return new SupabaseAdapter(config.supabaseUrl, config.supabaseAnonKey);
    case "self-hosted":
      return new PostgresAdapter(config.connectionString, config.authSecret);
    default:
      throw new Error(`Unknown CRM_MODE: ${(config as any).mode}`);
  }
}
