import { useCurrency } from '@/contexts/CurrencyContext';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export default function CurrencyToggle() {
  const { currency, toggleCurrency, rate, isLoading } = useCurrency();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={toggleCurrency}
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-mono font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <span className={currency === 'USD' ? 'text-foreground' : 'opacity-40'}>$</span>
          <span className="text-muted-foreground/40">/</span>
          <span className={currency === 'EUR' ? 'text-foreground' : 'opacity-40'}>€</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {isLoading
          ? 'Fetching rate…'
          : `Switch to ${currency === 'USD' ? 'EUR' : 'USD'} · Rate: 1 USD = ${rate?.toFixed(4) ?? '—'} EUR`
        }
      </TooltipContent>
    </Tooltip>
  );
}
