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

const TOKEN_KEY = "relai_access_token";
const REFRESH_KEY = "relai_refresh_token";

type AuthCallback = (event: AuthChangeEvent, session: Session | null) => void;

export class HttpAdapter implements DbAdapter {
  private baseUrl: string;
  private listeners: Set<AuthCallback> = new Set();

  capabilities = {
    realtime: false,
    storage: true,
    rls: false,
  };

  constructor(apiUrl: string) {
    this.baseUrl = apiUrl.replace(/\/$/, "");
  }

  private get token(): string | null {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
  }

  private setTokens(access: string, refresh: string) {
    localStorage.setItem(TOKEN_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  }

  private clearTokens() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (res.status === 401 && this.token) {
      // Try refresh
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        headers["Authorization"] = `Bearer ${this.token}`;
        const retry = await fetch(`${this.baseUrl}${path}`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        return retry.json();
      }
      this.clearTokens();
      this.notifyListeners("SIGNED_OUT", null);
    }

    return res.json();
  }

  private async get<T>(path: string): Promise<T> {
    const headers: Record<string, string> = {};
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;

    const res = await fetch(`${this.baseUrl}${path}`, { headers });
    return res.json();
  }

  private async tryRefresh(): Promise<boolean> {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${this.baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      const data = await res.json();
      if (data.session) {
        this.setTokens(data.session.access_token, data.session.refresh_token);
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

  private mapSession(data: any): Session | null {
    if (!data?.session) return null;
    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
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
    if (!this.token) return null;
    const result = await this.get<any>("/api/auth/me");
    if (!result.user) return null;
    return {
      id: result.user.id,
      email: result.user.email,
      created_at: result.user.created_at,
      user_metadata: result.user.raw_user_meta_data,
    };
  }

  async getSession(): Promise<Session | null> {
    if (!this.token) return null;
    const user = await this.getCurrentUser();
    if (!user) return null;
    return {
      access_token: this.token!,
      refresh_token: localStorage.getItem(REFRESH_KEY) ?? undefined,
      user,
    };
  }

  async signIn(email: string, password: string) {
    const result = await this.post<any>("/api/auth/signin", { email, password });
    if (result.error) return { user: null, session: null, error: result.error as DbError };

    this.setTokens(result.session.access_token, result.session.refresh_token);
    const session = this.mapSession(result)!;
    this.notifyListeners("SIGNED_IN", session);
    return { user: session.user, session, error: null };
  }

  async signUp(email: string, password: string, metadata?: Record<string, unknown>) {
    const result = await this.post<any>("/api/auth/signup", { email, password, metadata });
    if (result.error) return { user: null, session: null, error: result.error as DbError };

    this.setTokens(result.session.access_token, result.session.refresh_token);
    const session = this.mapSession(result)!;
    this.notifyListeners("SIGNED_IN", session);
    return { user: session.user, session, error: null };
  }

  async signOut() {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (refreshToken) {
      await this.post("/api/auth/signout", { refresh_token: refreshToken }).catch(() => {});
    }
    this.clearTokens();
    this.notifyListeners("SIGNED_OUT", null);
    return { error: null };
  }

  async updateUser(attributes: { password?: string; email?: string; data?: Record<string, unknown> }) {
    const result = await this.post<any>("/api/auth/update", attributes);
    if (result.error) return { user: null, error: result.error as DbError };
    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        created_at: result.user.created_at,
        user_metadata: result.user.raw_user_meta_data,
      },
      error: null,
    };
  }

  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void): Subscription {
    this.listeners.add(callback);

    // Fire initial session check
    setTimeout(async () => {
      const session = await this.getSession();
      if (session) callback("INITIAL_SESSION", session);
      else callback("INITIAL_SESSION", null);
    }, 0);

    return {
      unsubscribe: () => {
        this.listeners.delete(callback);
      },
    };
  }

  // ------ Storage ------

  async uploadFile(bucket: string, path: string, file: File): Promise<UploadResult> {
    const formData = new FormData();
    formData.append("bucket", bucket);
    formData.append("path", path);
    formData.append("file", file);

    const headers: Record<string, string> = {};
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;

    const res = await fetch(`${this.baseUrl}/api/storage/upload`, {
      method: "POST",
      headers,
      body: formData,
    });
    const result = await res.json();
    if (result.error) throw new Error(result.error.message);
    return { path: result.data.path };
  }

  getFileUrl(bucket: string, path: string): string {
    return `${this.baseUrl}/api/storage/serve/${bucket}/${path}`;
  }

  async getSignedUrl(bucket: string, path: string, expiresIn: number): Promise<string | null> {
    const result = await this.get<any>(
      `/api/storage/signed-url?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}&expiresIn=${expiresIn}`
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
