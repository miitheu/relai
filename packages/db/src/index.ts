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
  NotFilter,
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
export { HttpAdapter } from "./adapters/http";

import type { DbAdapter, DbConfig } from "./types";
import { SupabaseAdapter } from "./adapters/supabase";
import { HttpAdapter } from "./adapters/http";

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createDbAdapter(config: DbConfig): DbAdapter {
  switch (config.mode) {
    case "hosted":
      return new SupabaseAdapter(config.supabaseUrl, config.supabaseAnonKey);
    case "self-hosted":
      return new HttpAdapter(config.apiUrl);
    default:
      throw new Error(`Unknown CRM_MODE: ${(config as any).mode}`);
  }
}
