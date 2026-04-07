import type {
  DbAdapter,
  DbError,
  QueryOptions,
  UpsertOptions,
  User,
  Session,
  AuthChangeEvent,
  Subscription,
  UploadResult,
} from "../types";

type AuthCallback = (event: AuthChangeEvent, session: Session | null) => void;

/**
 * HttpAdapter — browser-side adapter for self-hosted mode.
 *
 * Auth tokens are stored in httpOnly cookies set by the API server.
 * The adapter sends `credentials: 'include'` on every request so
 * cookies are attached automatically. No tokens are ever accessible
 * to JavaScript — XSS cannot steal them.
 */
export class HttpAdapter implements DbAdapter {
  private baseUrl: string;
  private listeners: Set<AuthCallback> = new Set();
  private _cachedUser: User | null = null;
  private _authenticated = false;

  capabilities = {
    realtime: false,
    storage: true,
    rls: false,
  };

  constructor(apiUrl: string) {
    this.baseUrl = apiUrl.replace(/\/$/, "");
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });

    if (res.status === 401 && this._authenticated) {
      // Access token expired — try refresh (cookie-based)
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        const retry = await fetch(`${this.baseUrl}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        return retry.json();
      }
      this._authenticated = false;
      this._cachedUser = null;
      this.notifyListeners("SIGNED_OUT", null);
    }

    return res.json();
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      credentials: "include",
    });
    return res.json();
  }

  private async tryRefresh(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: "{}",
      });
      const data = await res.json();
      if (data.user && !data.error) {
        this._cachedUser = {
          id: data.user.id,
          email: data.user.email,
          created_at: data.user.created_at,
          user_metadata: data.user.raw_user_meta_data,
        };
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }

  private notifyListeners(event: AuthChangeEvent, session: Session | null) {
    for (const cb of this.listeners) {
      try { cb(event, session); } catch { /* ignore */ }
    }
  }

  private buildSession(data: any): Session | null {
    if (!data?.user) return null;
    return {
      access_token: "httponly-cookie",
      refresh_token: "httponly-cookie",
      expires_at: data.session?.expires_at,
      user: {
        id: data.user.id,
        email: data.user.email,
        created_at: data.user.created_at,
        user_metadata: data.user.raw_user_meta_data,
      },
    };
  }

  // ------ Query ------

  async query<T>(table: string, options?: QueryOptions) {
    return this.post<any>("/api/query", { table, options });
  }

  async queryOne<T>(table: string, options?: QueryOptions) {
    const result = await this.post<any>("/api/query", { table, options: { ...options, single: true } });
    return { data: result.data as T, error: result.error };
  }

  // ------ Mutations ------

  async insert<T>(table: string, data: Partial<T> | Partial<T>[], options?: { select?: string }) {
    return this.post<any>("/api/insert", { table, data, options });
  }

  async update<T>(table: string, match: Record<string, unknown>, data: Partial<T>, options?: { select?: string }) {
    return this.post<any>("/api/update", { table, match, data, options });
  }

  async upsert<T>(table: string, data: Partial<T> | Partial<T>[], options?: UpsertOptions & { select?: string }) {
    return this.post<any>("/api/upsert", { table, data, options });
  }

  async delete(table: string, match: Record<string, unknown>) {
    return this.post<any>("/api/delete", { table, match });
  }

  // ------ Auth ------

  async getCurrentUser(): Promise<User | null> {
    if (!this._authenticated) return null;
    if (this._cachedUser) return this._cachedUser;

    const result = await this.get<any>("/api/auth/me");
    if (!result.user) return null;
    this._cachedUser = {
      id: result.user.id,
      email: result.user.email,
      created_at: result.user.created_at,
      user_metadata: result.user.raw_user_meta_data,
    };
    return this._cachedUser;
  }

  async getSession(): Promise<Session | null> {
    // Check if we have a valid session by hitting /me
    const result = await this.get<any>("/api/auth/me");
    if (!result.user) {
      // Try refresh
      const refreshed = await this.tryRefresh();
      if (!refreshed) return null;
      return this.getSession();
    }

    this._authenticated = true;
    this._cachedUser = {
      id: result.user.id,
      email: result.user.email,
      created_at: result.user.created_at,
      user_metadata: result.user.raw_user_meta_data,
    };

    return {
      access_token: "httponly-cookie",
      refresh_token: "httponly-cookie",
      user: this._cachedUser,
    };
  }

  async signIn(email: string, password: string) {
    const result = await this.post<any>("/api/auth/signin", { email, password });
    if (result.error) return { user: null, session: null, error: result.error as DbError };

    this._authenticated = true;
    const session = this.buildSession(result)!;
    this._cachedUser = session.user;
    this.notifyListeners("SIGNED_IN", session);
    return { user: session.user, session, error: null };
  }

  async signUp(email: string, password: string, metadata?: Record<string, unknown>) {
    const result = await this.post<any>("/api/auth/signup", { email, password, metadata });
    if (result.error) return { user: null, session: null, error: result.error as DbError };

    this._authenticated = true;
    const session = this.buildSession(result)!;
    this._cachedUser = session.user;
    this.notifyListeners("SIGNED_IN", session);
    return { user: session.user, session, error: null };
  }

  async signOut() {
    await this.post("/api/auth/signout", {}).catch(() => {});
    this._authenticated = false;
    this._cachedUser = null;
    this.notifyListeners("SIGNED_OUT", null);
    return { error: null };
  }

  async updateUser(attributes: { password?: string; email?: string; data?: Record<string, unknown> }) {
    const result = await this.post<any>("/api/auth/update", attributes);
    if (result.error) return { user: null, error: result.error as DbError };
    const user: User = {
      id: result.user.id,
      email: result.user.email,
      created_at: result.user.created_at,
      user_metadata: result.user.raw_user_meta_data,
    };
    this._cachedUser = user;
    return { user, error: null };
  }

  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void): Subscription {
    this.listeners.add(callback);

    // Fire initial session check
    setTimeout(async () => {
      const session = await this.getSession();
      if (session) {
        this._authenticated = true;
        callback("INITIAL_SESSION", session);
      } else {
        callback("INITIAL_SESSION", null);
      }
    }, 0);

    return {
      unsubscribe: () => {
        this.listeners.delete(callback);
      },
    };
  }

  // ------ Storage ------

  async uploadFile(bucket: string, filePath: string, file: File): Promise<UploadResult> {
    const formData = new FormData();
    formData.append("bucket", bucket);
    formData.append("path", filePath);
    formData.append("file", file);

    const res = await fetch(`${this.baseUrl}/api/storage/upload`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });
    const result = await res.json();
    if (result.error) throw new Error(result.error.message);
    return { path: result.data.path };
  }

  getFileUrl(bucket: string, filePath: string): string {
    return `${this.baseUrl}/api/storage/serve/${bucket}/${filePath}`;
  }

  async getSignedUrl(bucket: string, filePath: string, expiresIn: number): Promise<string | null> {
    const result = await this.get<any>(
      `/api/storage/signed-url?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(filePath)}&expiresIn=${expiresIn}`
    );
    return result.url ?? null;
  }

  async removeFiles(bucket: string, paths: string[]): Promise<void> {
    await this.post("/api/storage/remove", { bucket, paths });
  }

  // ------ RPC ------

  async rpc<T>(functionName: string, params?: Record<string, unknown>) {
    return this.post<any>(`/api/functions/${functionName}`, params ?? {});
  }

  // ------ Edge Functions / Invoke ------

  async invoke<T>(functionName: string, body?: Record<string, unknown>) {
    return this.post<any>(`/api/functions/${functionName}`, body ?? {});
  }
}
