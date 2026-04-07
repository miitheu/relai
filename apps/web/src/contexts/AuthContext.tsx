import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useDb } from '@relai/db/react';
import type { Session, User } from '@relai/db';

type AppRole = 'admin' | 'sales_manager' | 'sales_rep' | 'viewer';

interface Profile {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  team: string | null;
  is_active: boolean;
  org_id: string | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  orgId: string | null;
  loading: boolean;
  needsSetup: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string, orgId?: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: ReactNode }) {
  const db = useDb();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const profileResult = await db.queryOne<Profile>('profiles', {
      select: '*',
      filters: [{ column: 'user_id', operator: 'eq', value: userId }],
    });

    const roleResult = await db.queryOne<{ role: AppRole }>('user_roles', {
      select: 'role',
      filters: [{ column: 'user_id', operator: 'eq', value: userId }],
    });

    if (profileResult.data) {
      setProfile(profileResult.data);
      setOrgId(profileResult.data.org_id);
    }
    if (roleResult.data) setRole(roleResult.data.role);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  useEffect(() => {
    const { unsubscribe } = db.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => fetchProfile(session.user.id), 0);
        } else {
          setProfile(null);
          setRole(null);
          setOrgId(null);
        }
        setLoading(false);
      }
    );

    db.getSession().then((session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const result = await db.signIn(email, password);
    return { error: result.error };
  };

  const signUp = async (email: string, password: string, fullName: string, signupOrgId?: string) => {
    const metadata: Record<string, unknown> = { full_name: fullName };
    if (signupOrgId) metadata.org_id = signupOrgId;
    const result = await db.signUp(email, password, metadata);
    return { error: result.error };
  };

  const signOut = async () => {
    await db.signOut();
    setProfile(null);
    setRole(null);
    setOrgId(null);
  };

  const needsSetup = !loading && !!user && !orgId;

  return (
    <AuthContext.Provider value={{
      session, user, profile, role, orgId, loading, needsSetup,
      signIn, signUp, signOut, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
