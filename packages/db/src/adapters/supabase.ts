import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type {
  DbAdapter,
  DbError,
  QueryOptions,
  UpsertOptions,
  Filter,
  User,
  Session,
  AuthChangeEvent,
  RealtimeEvent,
  RealtimePayload,
  Subscription,
  UploadResult,
} from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDbError(err: unknown): DbError {
  if (err && typeof err === "object" && "message" in err) {
    const e = err as Record<string, unknown>;
    return {
      message: String(e.message ?? "Unknown error"),
      code: e.code != null ? String(e.code) : undefined,
      details: e.details != null ? String(e.details) : undefined,
      hint: e.hint != null ? String(e.hint) : undefined,
    };
  }
  return { message: String(err) };
}

function mapUser(u: { id: string; email?: string | undefined; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown>; created_at?: string } | null): User | null {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email ?? "",
    app_metadata: u.app_metadata,
    user_metadata: u.user_metadata,
    created_at: u.created_at,
  };
}

function mapSession(s: { access_token: string; refresh_token: string; expires_at?: number; user: any } | null): Session | null {
  if (!s) return null;
  return {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: s.expires_at,
    user: mapUser(s.user)!,
  };
}

function applyFilters(query: any, filters: Filter[]): any {
  let q = query;
  for (const f of filters) {
    switch (f.operator) {
      case "eq":
        q = q.eq(f.column, f.value);
        break;
      case "neq":
        q = q.neq(f.column, f.value);
        break;
      case "gt":
        q = q.gt(f.column, f.value);
        break;
      case "gte":
        q = q.gte(f.column, f.value);
        break;
      case "lt":
        q = q.lt(f.column, f.value);
        break;
      case "lte":
        q = q.lte(f.column, f.value);
        break;
      case "like":
        q = q.like(f.column, f.value as string);
        break;
      case "ilike":
        q = q.ilike(f.column, f.value as string);
        break;
      case "is":
        q = q.is(f.column, f.value);
        break;
      case "in":
        q = q.in(f.column, f.value as unknown[]);
        break;
      case "contains":
        q = q.contains(f.column, f.value);
        break;
      case "containedBy":
        q = q.containedBy(f.column, f.value);
        break;
      case "overlaps":
        q = q.overlaps(f.column, f.value);
        break;
      case "textSearch":
        q = q.textSearch(f.column, f.value as string);
        break;
    }
  }
  return q;
}

// ---------------------------------------------------------------------------
// SupabaseAdapter
// ---------------------------------------------------------------------------

export class SupabaseAdapter implements DbAdapter {
  private client: SupabaseClient;

  capabilities = {
    realtime: true,
    storage: true,
    rls: true,
  };

  constructor(supabaseUrl: string, supabaseAnonKey: string) {
    this.client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }

  /** Expose the raw Supabase client for incremental migration (temporary) */
  get raw(): SupabaseClient {
    return this.client;
  }

  // ------ Query ------

  async query<T = Record<string, unknown>>(table: string, options?: QueryOptions) {
    let q = this.client.from(table).select(options?.select ?? "*", {
      count: options?.count ?? undefined,
    });

    if (options?.filters) q = applyFilters(q, options.filters);
    if (options?.or) q = q.or(options.or);
    if (options?.order) {
      for (const o of options.order) {
        q = q.order(o.column, {
          ascending: o.ascending ?? true,
          nullsFirst: o.nullsFirst,
        });
      }
    }
    if (options?.limit != null) q = q.limit(options.limit);
    if (options?.range) q = q.range(options.range[0], options.range[1]);

    const { data, count, error } = await q;

    if (error) return { data: null, count: null, error: toDbError(error) } as const;
    return { data: (data ?? []) as T[], count: count ?? null, error: null } as const;
  }

  async queryOne<T = Record<string, unknown>>(table: string, options?: QueryOptions) {
    const opts: QueryOptions = { ...options, limit: 1 };
    let q = this.client.from(table).select(opts.select ?? "*");

    if (opts.filters) q = applyFilters(q, opts.filters);
    if (opts.or) q = q.or(opts.or);

    const { data, error } = await q.maybeSingle();
    if (error) return { data: null, error: toDbError(error) } as const;
    return { data: data as T, error: null } as const;
  }

  // ------ Mutations ------

  async insert<T = Record<string, unknown>>(
    table: string,
    data: Partial<T> | Partial<T>[],
    options?: { select?: string }
  ) {
    const q = this.client
      .from(table)
      .insert(data as any)
      .select(options?.select ?? "*");

    const { data: result, error } = await q;
    if (error) return { data: null, error: toDbError(error) } as const;
    return { data: (result ?? []) as T[], error: null } as const;
  }

  async update<T = Record<string, unknown>>(
    table: string,
    match: Record<string, unknown>,
    data: Partial<T>,
    options?: { select?: string }
  ) {
    let q = this.client.from(table).update(data as any);
    for (const [col, val] of Object.entries(match)) {
      q = q.eq(col, val as any);
    }
    q = q.select(options?.select ?? "*");

    const { data: result, error } = await q;
    if (error) return { data: null, error: toDbError(error) } as const;
    return { data: (result ?? []) as T[], error: null } as const;
  }

  async upsert<T = Record<string, unknown>>(
    table: string,
    data: Partial<T> | Partial<T>[],
    options?: UpsertOptions & { select?: string }
  ) {
    const q = this.client
      .from(table)
      .upsert(data as any, {
        onConflict: options?.onConflict,
        ignoreDuplicates: options?.ignoreDuplicates,
      })
      .select(options?.select ?? "*");

    const { data: result, error } = await q;
    if (error) return { data: null, error: toDbError(error) } as const;
    return { data: (result ?? []) as T[], error: null } as const;
  }

  async delete(table: string, match: Record<string, unknown>) {
    let q = this.client.from(table).delete();
    for (const [col, val] of Object.entries(match)) {
      q = q.eq(col, val as any);
    }
    const { error } = await q;
    if (error) return { error: toDbError(error) } as const;
    return { error: null } as const;
  }

  // ------ Auth ------

  async getCurrentUser(): Promise<User | null> {
    const { data } = await this.client.auth.getUser();
    return mapUser(data.user);
  }

  async getSession(): Promise<Session | null> {
    const { data } = await this.client.auth.getSession();
    return mapSession(data.session);
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error || !data.user || !data.session) {
      return { user: null, session: null, error: toDbError(error ?? { message: "Sign in failed" }) } as const;
    }
    return { user: mapUser(data.user)!, session: mapSession(data.session)!, error: null } as const;
  }

  async signUp(email: string, password: string, metadata?: Record<string, unknown>) {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: metadata ? { data: metadata } : undefined,
    });
    if (error || !data.user || !data.session) {
      return { user: null, session: null, error: toDbError(error ?? { message: "Sign up failed" }) } as const;
    }
    return { user: mapUser(data.user)!, session: mapSession(data.session)!, error: null } as const;
  }

  async signOut() {
    const { error } = await this.client.auth.signOut();
    return { error: error ? toDbError(error) : null };
  }

  async updateUser(attributes: { password?: string; email?: string; data?: Record<string, unknown> }) {
    const { data, error } = await this.client.auth.updateUser(attributes);
    if (error || !data.user) {
      return { user: null, error: toDbError(error ?? { message: "Update failed" }) } as const;
    }
    return { user: mapUser(data.user)!, error: null } as const;
  }

  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void): Subscription {
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      callback(event as AuthChangeEvent, mapSession(session));
    });
    return { unsubscribe: () => data.subscription.unsubscribe() };
  }

  // ------ Realtime ------

  subscribe(
    table: string,
    event: RealtimeEvent,
    filter: string | undefined,
    callback: (payload: RealtimePayload) => void
  ): Subscription {
    const channel = this.client
      .channel(`${table}-changes`)
      .on(
        "postgres_changes" as any,
        {
          event: event === "*" ? "*" : event,
          schema: "public",
          table,
          filter,
        },
        (payload: any) => {
          callback({
            eventType: payload.eventType as RealtimeEvent,
            new: payload.new ?? {},
            old: payload.old ?? {},
          });
        }
      )
      .subscribe();

    return {
      unsubscribe: () => {
        this.client.removeChannel(channel);
      },
    };
  }

  // ------ Storage ------

  async uploadFile(bucket: string, path: string, file: File): Promise<UploadResult> {
    const { data, error } = await this.client.storage.from(bucket).upload(path, file);
    if (error) throw error;
    return { path: data.path };
  }

  getFileUrl(bucket: string, path: string): string {
    const { data } = this.client.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  async removeFiles(bucket: string, paths: string[]): Promise<void> {
    const { error } = await this.client.storage.from(bucket).remove(paths);
    if (error) throw error;
  }

  // ------ RPC ------

  async rpc<T = unknown>(functionName: string, params?: Record<string, unknown>) {
    const { data, error } = await this.client.rpc(functionName, params as any);
    if (error) return { data: null, error: toDbError(error) } as const;
    return { data: data as T, error: null } as const;
  }
}
