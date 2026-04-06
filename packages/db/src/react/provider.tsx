import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { DbAdapter, DbConfig } from "../types";
import { createDbAdapter } from "../index";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const DbContext = createContext<DbAdapter | null>(null);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDb(): DbAdapter {
  const adapter = useContext(DbContext);
  if (!adapter) {
    throw new Error("useDb() must be used within a <DbProvider>. Wrap your app in <DbProvider config={...}>.");
  }
  return adapter;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface DbProviderProps {
  config: DbConfig;
  children: ReactNode;
}

export function DbProvider({ config, children }: DbProviderProps) {
  const adapter = useMemo(() => createDbAdapter(config), [config.mode]);
  return <DbContext.Provider value={adapter}>{children}</DbContext.Provider>;
}
