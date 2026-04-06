import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface QuickCreateDefaults {
  client_id?: string;
  dataset_id?: string;
  stage?: string;
  owner_id?: string;
  opportunity_id?: string;
}

interface QuickCreateContextType {
  isOpen: boolean;
  isTrialOpen: boolean;
  isDeliveryOpen: boolean;
  defaults: QuickCreateDefaults;
  open: (defaults?: QuickCreateDefaults) => void;
  openTrial: (defaults?: QuickCreateDefaults) => void;
  openDelivery: (defaults?: QuickCreateDefaults) => void;
  close: () => void;
}

const QuickCreateContext = createContext<QuickCreateContextType | null>(null);

export function QuickCreateProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isTrialOpen, setIsTrialOpen] = useState(false);
  const [isDeliveryOpen, setIsDeliveryOpen] = useState(false);
  const [defaults, setDefaults] = useState<QuickCreateDefaults>({});

  const open = useCallback((d?: QuickCreateDefaults) => {
    setDefaults(d || {});
    setIsOpen(true);
  }, []);

  const openTrial = useCallback((d?: QuickCreateDefaults) => {
    setDefaults(d || {});
    setIsTrialOpen(true);
  }, []);

  const openDelivery = useCallback((d?: QuickCreateDefaults) => {
    setDefaults(d || {});
    setIsDeliveryOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setIsTrialOpen(false);
    setIsDeliveryOpen(false);
    setDefaults({});
  }, []);

  return (
    <QuickCreateContext.Provider value={{ isOpen, isTrialOpen, isDeliveryOpen, defaults, open, openTrial, openDelivery, close }}>
      {children}
    </QuickCreateContext.Provider>
  );
}

export function useQuickCreate() {
  const ctx = useContext(QuickCreateContext);
  if (!ctx) throw new Error('useQuickCreate must be used within QuickCreateProvider');
  return ctx;
}
