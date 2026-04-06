import { useState } from 'react';
import { Plus, TrendingUp, Clock, DollarSign, ChevronRight, ChevronDown, Truck, RefreshCw, Sparkles } from 'lucide-react';
import { formatCurrency, getStageColor } from '@/data/mockData';
import { useCurrencyRerender } from '@/hooks/useCurrencyRerender';
import { differenceInDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import BallStatusBadge from '@/components/BallStatusBadge';
import { getTrialStatus, getDaysRemaining } from '@/lib/trialUtils';

interface ClientPipelineProps {
  clientId: string;
  opportunities: any[];
  deliveries: any[];
  renewals: any[];
  onCreateOpportunity: () => void;
  onLogTrial: () => void;
  onLogDelivery: () => void;
}

export default function ClientPipeline({
  clientId,
  opportunities,
  deliveries,
  renewals,
  onCreateOpportunity,
  onLogTrial,
  onLogDelivery,
}: ClientPipelineProps) {
  useCurrencyRerender();
  const navigate = useNavigate();

  const activeOpps = opportunities.filter((o: any) => !['Closed Won', 'Closed Lost'].includes(o.stage));
  const closedOpps = opportunities.filter((o: any) => ['Closed Won', 'Closed Lost'].includes(o.stage));
  const totalActive = activeOpps.reduce((s: number, o: any) => s + Number(o.value), 0);
  const wonValue = closedOpps.filter(o => o.stage === 'Closed Won').reduce((s: number, o: any) => s + Number(o.value), 0);
  const upcomingRenewals = renewals.filter((r: any) => r.status === 'Upcoming' || r.status === 'Negotiation');

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

      {/* Active Opportunities */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Active Opportunities</h3>
        <Button size="sm" onClick={onCreateOpportunity}>
          <Plus size={14} className="mr-1" /> New Opportunity
        </Button>
      </div>

      <div className="space-y-3 mb-6">
        {activeOpps.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No active opportunities</p>
        ) : (
          activeOpps.map((opp: any) => {
            const daysInStage = opp.stage_entered_at ? differenceInDays(new Date(), new Date(opp.stage_entered_at)) : 0;
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
                    {opp.source === 'renewal' && (
                      <span className="text-[10px] bg-info/10 text-info px-1.5 py-0.5 rounded shrink-0">RENEWAL</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{opp.datasets?.name || 'No dataset'}</span>
                    <span>·</span>
                    <span>Close: {opp.expected_close || 'TBD'}</span>
                    {opp.stage_entered_at && (
                      <>
                        <span>·</span>
                        <span className={`flex items-center gap-1 ${daysInStage > 30 ? 'text-destructive' : daysInStage > 14 ? 'text-warning' : ''}`}>
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
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/pipeline/${opp.id}?draft=manual`); }}
                    className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                    title="Draft AI message"
                  >
                    <Sparkles size={13} />
                  </button>
                  <ChevronRight size={14} className="text-muted-foreground" />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Closed Opportunities */}
      {closedOpps.length > 0 && (
        <CollapsibleSection title="Closed Opportunities" count={closedOpps.length} defaultOpen={false}>
          <div className="space-y-2">
            {closedOpps.slice(0, 10).map((opp: any) => (
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
        </CollapsibleSection>
      )}

      {/* Deliveries & Trials */}
      <CollapsibleSection
        title="Deliveries & Trials"
        count={deliveries.length}
        defaultOpen={deliveries.length > 0}
        actions={
          <div className="flex gap-3">
            <button onClick={onLogDelivery} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <Truck size={12} /> Log Delivery
            </button>
            <button onClick={onLogTrial} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <Truck size={12} /> Log Trial
            </button>
          </div>
        }
      >
        {deliveries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No deliveries or trials</p>
        ) : (
          <div className="space-y-2">
            {deliveries.map((d: any) => {
              const isTrial = d.delivery_type?.toLowerCase() === 'trial';
              const tStatus = isTrial ? getTrialStatus(d.status, d.trial_start_date, d.trial_end_date, d.opportunities?.stage) : null;
              const dLeft = isTrial ? getDaysRemaining(d.trial_end_date) : null;
              return (
                <div key={d.id} className="data-card flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {d.datasets?.name || '—'}
                      {isTrial && <span className="ml-2 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">TRIAL</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{d.delivery_method} · {d.delivery_date}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {isTrial && tStatus === 'active' && <span className="text-xs text-success">{dLeft}d left</span>}
                    {isTrial && tStatus === 'ending_soon' && <span className="text-xs text-warning">{dLeft}d left</span>}
                    {isTrial && tStatus === 'expired' && <span className="text-xs text-destructive">Expired</span>}
                    {isTrial && tStatus === 'converted' && <span className="text-xs text-success">Converted</span>}
                    <span className="status-badge bg-secondary text-secondary-foreground">
                      {isTrial ? tStatus : d.delivery_type}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CollapsibleSection>

      {/* Renewals */}
      <CollapsibleSection
        title="Renewals"
        count={renewals.length}
        defaultOpen={upcomingRenewals.length > 0}
      >
        {renewals.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No renewals</p>
        ) : (
          <div className="space-y-2">
            {renewals.map((r: any) => (
              <div key={r.id} className="data-card flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{r.datasets?.name || '—'}</p>
                  <p className="text-xs text-muted-foreground">Renewal: {r.renewal_date} · Prob: {r.probability}%</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`status-badge ${
                    r.status === 'Renewed' ? 'bg-success/10 text-success' :
                    r.status === 'Lost' ? 'signal-high' :
                    r.status === 'Negotiation' ? 'signal-medium' :
                    'bg-info/10 text-info'
                  }`}>
                    {r.status}
                  </span>
                  <span className="font-mono text-sm">{formatCurrency(Number(r.value))}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}

function CollapsibleSection({
  title,
  count,
  defaultOpen,
  actions,
  children,
}: {
  title: string;
  count: number;
  defaultOpen: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown size={14} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
          {title}
          <span className="text-xs font-normal ml-1">({count})</span>
        </button>
        {open && actions}
      </div>
      {open && children}
    </div>
  );
}
