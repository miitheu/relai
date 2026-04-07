import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Organization, TenantConfig } from '../index';
import type { DbAdapter } from '@relai/db';

const TenantConfigContext = createContext<TenantConfig>({ org: null, loading: true });

export function useTenantConfig(): TenantConfig {
  return useContext(TenantConfigContext);
}

interface TenantConfigProviderProps {
  db: DbAdapter;
  orgId: string | null;
  children: ReactNode;
}

export function TenantConfigProvider({ db, orgId, children }: TenantConfigProviderProps) {
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) {
      setOrg(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      const result = await db.queryOne<Organization>('organizations', {
        select: '*',
        filters: [{ column: 'id', operator: 'eq', value: orgId }],
      });

      if (!cancelled) {
        setOrg(result.data ?? null);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [orgId, db]);

  return (
    <TenantConfigContext.Provider value={{ org, loading }}>
      {children}
    </TenantConfigContext.Provider>
  );
}
