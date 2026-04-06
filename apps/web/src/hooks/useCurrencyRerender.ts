import { useSyncExternalStore } from 'react';
import { subscribeCurrency, getCurrency, getRate } from '@/lib/currencyStore';

/**
 * Call this hook in any component that uses formatCurrency to ensure
 * it re-renders when the user toggles currency.
 */
export function useCurrencyRerender() {
  useSyncExternalStore(subscribeCurrency, () => `${getCurrency()}-${getRate()}`);
}
