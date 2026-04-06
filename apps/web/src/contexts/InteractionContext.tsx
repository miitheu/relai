import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

export type InteractionType = 'meeting' | 'email' | 'call' | 'note' | 'demo';

interface InteractionDefaults {
  client_id?: string;
  contact_id?: string;
  opportunity_id?: string;
  dataset_id?: string;
  type?: InteractionType;
}

interface InteractionContextType {
  isOpen: boolean;
  defaults: InteractionDefaults;
  open: (defaults?: InteractionDefaults) => void;
  close: () => void;
}

const InteractionContext = createContext<InteractionContextType | null>(null);

export function InteractionProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [defaults, setDefaults] = useState<InteractionDefaults>({});

  const open = useCallback((d?: InteractionDefaults) => {
    setDefaults(d || {});
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setDefaults({});
  }, []);

  return (
    <InteractionContext.Provider value={{ isOpen, defaults, open, close }}>
      {children}
    </InteractionContext.Provider>
  );
}

export function useInteraction() {
  const ctx = useContext(InteractionContext);
  if (!ctx) throw new Error('useInteraction must be used within InteractionProvider');
  return ctx;
}
