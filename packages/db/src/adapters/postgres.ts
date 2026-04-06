import type {
  DbAdapter,
  DbError,
  QueryOptions,
  UpsertOptions,
  User,
  Session,
  AuthChangeEvent,
  Subscription,
} from "../types";

// ---------------------------------------------------------------------------
// PostgresAdapter — Stub for self-hosted mode (Phase 4)
// ---------------------------------------------------------------------------

const NOT_IMPLEMENTED: DbError = {
  message: "PostgresAdapter: not yet implemented. Self-hosted mode is coming in Phase 4.",
  code: "NOT_IMPLEMENTED",
};

function notImplemented(): never {
  throw new Error(NOT_IMPLEMENTED.message);
}

export class PostgresAdapter implements DbAdapter {
  capabilities = {
    realtime: false,
    storage: false,
    rls: false,
  };

  constructor(_connectionString: string, _authSecret: string) {
    // Will initialize postgres.js connection in Phase 4
  }

  async query<T>(_table: string, _options?: QueryOptions) {
    return { data: null, count: null, error: NOT_IMPLEMENTED } as const;
  }

  async queryOne<T>(_table: string, _options?: QueryOptions) {
    return { data: null, error: NOT_IMPLEMENTED } as const;
  }

  async insert<T>(_table: string, _data: Partial<T> | Partial<T>[], _options?: { select?: string }) {
    return { data: null, error: NOT_IMPLEMENTED } as const;
  }

  async update<T>(_table: string, _match: Record<string, unknown>, _data: Partial<T>, _options?: { select?: string }) {
    return { data: null, error: NOT_IMPLEMENTED } as const;
  }

  async upsert<T>(_table: string, _data: Partial<T> | Partial<T>[], _options?: UpsertOptions & { select?: string }) {
    return { data: null, error: NOT_IMPLEMENTED } as const;
  }

  async delete(_table: string, _match: Record<string, unknown>) {
    return { error: NOT_IMPLEMENTED } as const;
  }

  async getCurrentUser(): Promise<User | null> {
    notImplemented();
  }

  async getSession(): Promise<Session | null> {
    notImplemented();
  }

  async signIn(_email: string, _password: string) {
    return { user: null, session: null, error: NOT_IMPLEMENTED } as const;
  }

  async signUp(_email: string, _password: string, _metadata?: Record<string, unknown>) {
    return { user: null, session: null, error: NOT_IMPLEMENTED } as const;
  }

  async signOut() {
    return { error: NOT_IMPLEMENTED };
  }

  async updateUser(_attributes: { password?: string; email?: string; data?: Record<string, unknown> }) {
    return { user: null, error: NOT_IMPLEMENTED } as const;
  }

  onAuthStateChange(_callback: (event: AuthChangeEvent, session: Session | null) => void): Subscription {
    notImplemented();
  }

  async rpc<T>(_functionName: string, _params?: Record<string, unknown>) {
    return { data: null, error: NOT_IMPLEMENTED } as const;
  }
}
