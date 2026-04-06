import { createContext, useContext, useState, useEffect, useCallback, useSyncExternalStore, ReactNode } from 'react';
import { getCurrency, getRate, setCurrencyGlobal, setRateGlobal, subscribeCurrency, convertToActive } from '@/lib/currencyStore';

type Currency = 'USD' | 'EUR';

interface CurrencyContextType {
  currency: Currency;
  toggleCurrency: () => void;
  rate: number;
  isLoading: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const currency = useSyncExternalStore(subscribeCurrency, getCurrency);
  const [isLoading, setIsLoading] = useState(false);
  const rate = useSyncExternalStore(subscribeCurrency, getRate);

  useEffect(() => {
    const fetchRate = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR');
        if (!res.ok) throw new Error('Failed to fetch rate');
        const data = await res.json();
        setRateGlobal(data.rates.EUR);
      } catch (err) {
        console.error('Failed to fetch exchange rate:', err);
        setRateGlobal(0.92); // fallback
      } finally {
        setIsLoading(false);
      }
    };
    fetchRate();
  }, []);

  const toggleCurrency = useCallback(() => {
    setCurrencyGlobal(getCurrency() === 'USD' ? 'EUR' : 'USD');
  }, []);

  return (
    <CurrencyContext.Provider value={{ currency, toggleCurrency, rate, isLoading }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
}
