import { Plus, TrendingUp, Clock, DollarSign, ChevronRight } from 'lucide-react';
import { formatCurrency, getStageColor } from '@/data/mockData';
import { useCurrencyRerender } from '@/hooks/useCurrencyRerender';
import { differenceInDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import BallStatusBadge from '@/components/BallStatusBadge';

interface ClientOpportunitiesProps {
  clientId: string;
  opportunities: any[];
  onCreateNew: () => void;
}

export default function ClientOpportunities({ clientId, opportunities, onCreateNew }: ClientOpportunitiesProps) {
  useCurrencyRerender();
  const navigate = useNavigate();
  
  const activeOpps = opportunities.filter((o: any) => !['Closed Won', 'Closed Lost'].includes(o.stage));
  const closedOpps = opportunities.filter((o: any) => ['Closed Won', 'Closed Lost'].includes(o.stage));
  
  const totalActive = activeOpps.reduce((s: number, o: any) => s + Number(o.value), 0);
  const wonValue = closedOpps
    .filter(o => o.stage === 'Closed Won')
    .reduce((s: number, o: any) => s + Number(o.value), 0);
  
  return (
    <div>
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="data-card text-center">
          <p className="text-2xl font-bold">{activeOpps.length}</p>
          <p className="text-xs text-muted-foreground">Active Deals</p>
        </div>
        <div className="data-card text-center">
          <p className="text-2xl font-bold text-primary">{formatCurrency(totalActive)}</p>
          <p className="text-xs text-muted-foreground">Pipeline Value</p>
        </div>
        <div className="data-card text-center">
          <p className="text-2xl font-bold text-success">{formatCurrency(wonValue)}</p>
          <p className="text-xs text-muted-foreground">Won (All Time)</p>
        </div>
      </div>
      
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Active Opportunities</h3>
        <Button size="sm" onClick={onCreateNew}>
          <Plus size={14} className="mr-1" /> New Opportunity
        </Button>
      </div>
      
      {/* Active Opportunities */}
      <div className="space-y-3 mb-6">
        {activeOpps.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No active opportunities</p>
        ) : (
          activeOpps.map((opp: any) => {
            const daysInStage = opp.stage_entered_at
              ? differenceInDays(new Date(), new Date(opp.stage_entered_at))
              : 0;
            const isStale = daysInStage > 14;
            
            return (
              <div
                key={opp.id}
                onClick={() => navigate(`/pipeline/${opp.id}`)}
                className="data-card flex items-center justify-between cursor-pointer hover:border-primary/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={14} className="text-primary shrink-0" />
                    <span className="font-medium truncate">{opp.name}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{opp.datasets?.name || 'No dataset'}</span>
                    <span>·</span>
                    <span>Close: {opp.expected_close || 'TBD'}</span>
                    {opp.stage_entered_at && (
                      <>
                        <span>·</span>
                        <span className={`flex items-center gap-1 ${
                          daysInStage > 30 ? 'text-destructive' :
                          daysInStage > 14 ? 'text-warning' : ''
                        }`}>
                          <Clock size={10} /> {daysInStage}d in stage
                        </span>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <BallStatusBadge status={opp.ball_status} />
                  <span className={`status-badge ${getStageColor(opp.stage)}`}>{opp.stage}</span>
                  <div className="text-right w-28">
                    <span className="font-mono font-medium">{formatCurrency(Number(opp.value))}</span>
                    {(Number(opp.value_min) > 0 || Number(opp.value_max) > 0) && (
                      <p className="text-[10px] text-muted-foreground font-mono">{formatCurrency(Number(opp.value_min))}–{formatCurrency(Number(opp.value_max))}</p>
                    )}
                  </div>
                  <ChevronRight size={14} className="text-muted-foreground" />
                </div>
              </div>
            );
          })
        )}
      </div>
      
      {/* Closed Opportunities */}
      {closedOpps.length > 0 && (
        <>
          <h3 className="text-sm font-semibold mb-4 text-muted-foreground">Closed Opportunities</h3>
          <div className="space-y-2">
            {closedOpps.slice(0, 5).map((opp: any) => (
              <div
                key={opp.id}
                onClick={() => navigate(`/pipeline/${opp.id}`)}
                className="data-card flex items-center justify-between cursor-pointer hover:border-primary/50 transition-colors opacity-70"
              >
                <div className="flex items-center gap-2">
                  <DollarSign size={14} className={opp.stage === 'Closed Won' ? 'text-success' : 'text-muted-foreground'} />
                  <span className="font-medium">{opp.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`status-badge ${getStageColor(opp.stage)}`}>{opp.stage}</span>
                  <span className="font-mono text-sm">{formatCurrency(Number(opp.value))}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
