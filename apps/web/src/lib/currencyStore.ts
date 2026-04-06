// Global currency state — singleton pattern for use in non-hook contexts (e.g. formatCurrency)

type Currency = 'USD' | 'EUR';
type Listener = () => void;

let _currency: Currency = (typeof localStorage !== 'undefined' && localStorage.getItem('preferred_currency') as Currency) || 'USD';
let _rate: number = 1; // EUR per 1 USD
const _listeners: Set<Listener> = new Set();

export function getCurrency(): Currency { return _currency; }
export function getRate(): number { return _rate; }

export function setCurrencyGlobal(c: Currency) {
  _currency = c;
  if (typeof localStorage !== 'undefined') localStorage.setItem('preferred_currency', c);
  _listeners.forEach(fn => fn());
}

export function setRateGlobal(r: number) {
  _rate = r;
  _listeners.forEach(fn => fn());
}

export function subscribeCurrency(fn: Listener) {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

export function convertToActive(usdAmount: number): number {
  if (_currency === 'USD') return usdAmount;
  return usdAmount * _rate;
}
