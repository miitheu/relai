// ============================================================================
// @relai/db — Database Abstraction Layer Types
// ============================================================================

// ---------------------------------------------------------------------------
// Filter & Query Types
// ---------------------------------------------------------------------------

export type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "like"
  | "ilike"
  | "is"
  | "in"
  | "contains"
  | "containedBy"
  | "overlaps"
  | "textSearch";

export interface Filter {
  column: string;
  operator: FilterOperator;
  value: unknown;
}

export interface OrderBy {
  column: string;
  ascending?: boolean;
  nullsFirst?: boolean;
}

export interface QueryOptions {
  select?: string;
  filters?: Filter[];
  or?: string;
  order?: OrderBy[];
  limit?: number;
  offset?: number;
  range?: [number, number];
  count?: "exact" | "planned" | "estimated";
  single?: boolean;
  maybeSingle?: boolean;
}

export interface UpsertOptions {
  onConflict?: string;
  ignoreDuplicates?: boolean;
}

// ---------------------------------------------------------------------------
// Auth Types
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface Session {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user: User;
}

export type AuthChangeEvent =
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED"
  | "PASSWORD_RECOVERY"
  | "INITIAL_SESSION";

// ---------------------------------------------------------------------------
// Realtime Types
// ---------------------------------------------------------------------------

export type RealtimeEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

export interface RealtimePayload<T = Record<string, unknown>> {
  eventType: RealtimeEvent;
  new: T;
  old: T;
}

export interface Subscription {
  unsubscribe: () => void;
}

// ---------------------------------------------------------------------------
// Storage Types
// ---------------------------------------------------------------------------

export interface UploadResult {
  path: string;
}

// ---------------------------------------------------------------------------
// DbAdapter Interface
// ---------------------------------------------------------------------------

export interface DbAdapter {
  // ------ Query ------
  query<T = Record<string, unknown>>(
    table: string,
    options?: QueryOptions
  ): Promise<{ data: T[]; count: number | null; error: null } | { data: null; count: null; error: DbError }>;

  queryOne<T = Record<string, unknown>>(
    table: string,
    options?: QueryOptions
  ): Promise<{ data: T; error: null } | { data: null; error: DbError }>;

  // ------ Mutations ------
  insert<T = Record<string, unknown>>(
    table: string,
    data: Partial<T> | Partial<T>[],
    options?: { select?: string }
  ): Promise<{ data: T[]; error: null } | { data: null; error: DbError }>;

  update<T = Record<string, unknown>>(
    table: string,
    match: Record<string, unknown>,
    data: Partial<T>,
    options?: { select?: string }
  ): Promise<{ data: T[]; error: null } | { data: null; error: DbError }>;

  upsert<T = Record<string, unknown>>(
    table: string,
    data: Partial<T> | Partial<T>[],
    options?: UpsertOptions & { select?: string }
  ): Promise<{ data: T[]; error: null } | { data: null; error: DbError }>;

  delete(
    table: string,
    match: Record<string, unknown>
  ): Promise<{ error: null } | { error: DbError }>;

  // ------ Auth ------
  getCurrentUser(): Promise<User | null>;
  getSession(): Promise<Session | null>;
  signIn(
    email: string,
    password: string
  ): Promise<{ user: User; session: Session; error: null } | { user: null; session: null; error: DbError }>;
  signUp(
    email: string,
    password: string,
    metadata?: Record<string, unknown>
  ): Promise<{ user: User; session: Session; error: null } | { user: null; session: null; error: DbError }>;
  signOut(): Promise<{ error: DbError | null }>;
  updateUser(
    attributes: { password?: string; email?: string; data?: Record<string, unknown> }
  ): Promise<{ user: User; error: null } | { user: null; error: DbError }>;
  onAuthStateChange(
    callback: (event: AuthChangeEvent, session: Session | null) => void
  ): Subscription;

  // ------ Realtime (optional) ------
  subscribe?(
    table: string,
    event: RealtimeEvent,
    filter: string | undefined,
    callback: (payload: RealtimePayload) => void
  ): Subscription;

  // ------ Storage (optional) ------
  uploadFile?(bucket: string, path: string, file: File): Promise<UploadResult>;
  getFileUrl?(bucket: string, path: string): string;
  removeFiles?(bucket: string, paths: string[]): Promise<void>;

  // ------ RPC ------
  rpc<T = unknown>(
    functionName: string,
    params?: Record<string, unknown>
  ): Promise<{ data: T; error: null } | { data: null; error: DbError }>;

  // ------ Capabilities ------
  capabilities: {
    realtime: boolean;
    storage: boolean;
    rls: boolean;
  };
}

// ---------------------------------------------------------------------------
// Error Type
// ---------------------------------------------------------------------------

export interface DbError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type DbMode = "hosted" | "self-hosted";

export interface HostedConfig {
  mode: "hosted";
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export interface SelfHostedConfig {
  mode: "self-hosted";
  connectionString: string;
  authSecret: string;
}

export type DbConfig = HostedConfig | SelfHostedConfig;
