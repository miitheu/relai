import { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import LoadingState from '@/components/LoadingState';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '@/data/mockData';
import { useCurrencyRerender } from '@/hooks/useCurrencyRerender';
import { useCommissionLedger, useUpdateCommissionEntry, CommissionLedgerEntry } from '@/hooks/useCommissions';
import { useToast } from '@/hooks/use-toast';
import { Coins, DollarSign, Clock, CheckCircle2, Percent } from 'lucide-react';
import { startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, format } from 'date-fns';

type PeriodPreset = 'month' | 'quarter' | 'year';

function getPeriodRange(preset: PeriodPreset): { start: Date; end: Date; label: string } {
  const now = new Date();
  switch (preset) {
    case 'month': {
      const s = startOfMonth(now);
      const e = endOfMonth(now);
      return { start: s, end: e, label: format(now, 'MMMM yyyy') };
    }
    case 'quarter': {
      const s = startOfQuarter(now);
      const e = endOfQuarter(now);
      return { start: s, end: e, label: `Q${Math.ceil((s.getMonth() + 1) / 3)} ${s.getFullYear()}` };
    }
    case 'year': {
      return { start: startOfYear(now), end: endOfYear(now), label: `FY ${now.getFullYear()}` };
    }
  }
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-warning/10 text-warning',
  approved: 'bg-info/10 text-info',
  paid: 'bg-success/10 text-success',
};

export default function Commissions({ embedded }: { embedded?: boolean } = {}) {
  useCurrencyRerender();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [period, setPeriod] = useState<PeriodPreset>('quarter');
  const periodRange = getPeriodRange(period);
  const periodStart = format(periodRange.start, 'yyyy-MM-dd');
  const periodEnd = format(periodRange.end, 'yyyy-MM-dd');

  // Admin/manager sees all, sales reps see only their own
  const isAdmin = role === 'admin' || role === 'sales_manager';
  const ledgerFilters = useMemo(() => ({
    period_start: periodStart,
    period_end: periodEnd,
    ...(isAdmin ? {} : { user_id: user?.id }),
  }), [periodStart, periodEnd, isAdmin, user?.id]);

  const { data: ledger = [], isLoading } = useCommissionLedger(ledgerFilters);
  const updateEntry = useUpdateCommissionEntry();

  // KPI calculations
  const kpis = useMemo(() => {
    const totalEarned = ledger.reduce((s: number, e: any) => s + Number(e.commission_amount), 0);
    const pending = ledger.filter((e: any) => e.status === 'pending').reduce((s: number, e: any) => s + Number(e.commission_amount), 0);
    const paid = ledger.filter((e: any) => e.status === 'paid').reduce((s: number, e: any) => s + Number(e.commission_amount), 0);
    const totalBase = ledger.reduce((s: number, e: any) => s + Number(e.base_amount), 0);
    const avgRate = totalBase > 0 ? (totalEarned / totalBase) * 100 : 0;
    return { totalEarned, pending, paid, avgRate };
  }, [ledger]);

  const handleStatusChange = async (entryId: string, newStatus: string) => {
    try {
      const updates: Record<string, any> = { id: entryId, status: newStatus };
      if (newStatus === 'approved') {
        updates.approved_by = user?.id;
        updates.approved_at = new Date().toISOString();
      }
      if (newStatus === 'paid') {
        updates.paid_at = new Date().toISOString();
      }
      await updateEntry.mutateAsync(updates);
      toast({ title: 'Updated', description: `Commission entry marked as ${newStatus}.` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  if (isLoading) return embedded ? <LoadingState /> : <AppLayout><LoadingState /></AppLayout>;

  const Wrapper = embedded ? 'div' : AppLayout;

  const kpiCards = [
    { icon: DollarSign, label: 'Total Earned', value: formatCurrency(kpis.totalEarned), accent: 'text-primary' },
    { icon: Clock, label: 'Pending', value: formatCurrency(kpis.pending), accent: 'text-warning' },
    { icon: CheckCircle2, label: 'Paid', value: formatCurrency(kpis.paid), accent: 'text-success' },
    { icon: Percent, label: 'Commission Rate', value: `${kpis.avgRate.toFixed(1)}%`, accent: 'text-info' },
  ];

  return (
    <Wrapper>
      <div className="page-header">
        <div>
          <h1 className="page-title">Commissions</h1>
          <p className="text-sm text-muted-foreground">
            {periodRange.label} · {ledger.length} entries{!isAdmin && ' (your commissions)'}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
          {([
            { key: 'month', label: 'Month' },
            { key: 'quarter', label: 'Quarter' },
            { key: 'year', label: 'Year' },
          ] as const).map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${period === p.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {kpiCards.map((c, i) => (
          <div key={i} className="data-card py-3 px-4">
            <div className="flex items-center gap-2 mb-1.5">
              <c.icon size={13} className={c.accent} />
              <span className="metric-label">{c.label}</span>
            </div>
            <div className="metric-value">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Commission Ledger Table */}
      <div className="data-card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {isAdmin && <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">User</th>}
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Opportunity</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Base Amount</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Commission</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Rate</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</th>
              {isAdmin && <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {ledger.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 7 : 5} className="px-4 py-8 text-center text-muted-foreground text-sm">
                  No commission entries for this period.
                </td>
              </tr>
            ) : (
              ledger.map((entry: any) => (
                <tr key={entry.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <span className="font-medium">{entry.profiles?.full_name || entry.profiles?.email || '—'}</span>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => entry.opportunity_id && navigate(`/pipeline/${entry.opportunity_id}`)}
                      className="text-left hover:text-primary transition-colors"
                    >
                      {entry.opportunities?.name || '—'}
                      {entry.opportunities?.clients?.name && (
                        <span className="text-muted-foreground text-xs ml-1.5">({entry.opportunities.clients.name})</span>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(Number(entry.base_amount))}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium">{formatCurrency(Number(entry.commission_amount))}</td>
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">{(Number(entry.rate) * 100).toFixed(1)}%</td>
                  <td className="px-4 py-3">
                    <span className={`status-badge ${STATUS_STYLES[entry.status] || 'bg-muted text-muted-foreground'}`}>
                      {entry.status}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {entry.status === 'pending' && (
                          <button
                            onClick={() => handleStatusChange(entry.id, 'approved')}
                            className="text-xs px-2 py-1 rounded bg-info/10 text-info hover:bg-info/20 transition-colors"
                          >
                            Approve
                          </button>
                        )}
                        {entry.status === 'approved' && (
                          <button
                            onClick={() => handleStatusChange(entry.id, 'paid')}
                            className="text-xs px-2 py-1 rounded bg-success/10 text-success hover:bg-success/20 transition-colors"
                          >
                            Mark Paid
                          </button>
                        )}
                        {entry.status === 'paid' && (
                          <span className="text-[10px] text-muted-foreground">
                            {entry.paid_at ? format(new Date(entry.paid_at), 'MMM d, yyyy') : '—'}
                          </span>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Wrapper>
  );
}
