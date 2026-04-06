import { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { useQuotas, useCreateQuota, useUpdateQuota, useDeleteQuota, useQuotaAttainment } from '@/hooks/useQuotas';
import type { Quota, QuotaFilters } from '@/hooks/useQuotas';
import { useProfiles } from '@/hooks/useCrmData';
import { useTerritories } from '@/hooks/useTerritories';
import { useCurrencyRerender } from '@/hooks/useCurrencyRerender';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency } from '@/data/mockData';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import { Target, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

const QUOTA_TYPES = [
  { value: 'revenue', label: 'Revenue' },
  { value: 'deals', label: 'Deals' },
  { value: 'meetings', label: 'Meetings' },
  { value: 'pipeline', label: 'Pipeline' },
];

function currentYear() {
  return new Date().getFullYear();
}

function buildPeriodOptions() {
  const year = currentYear();
  const options: { value: string; label: string }[] = [];
  for (let y = year + 1; y >= year - 2; y--) {
    for (let q = 4; q >= 1; q--) {
      options.push({ value: `${y}-Q${q}`, label: `Q${q} ${y}` });
    }
  }
  return options;
}

function getQuarterDates(period: string) {
  const match = period.match(/^(\d{4})-Q([1-4])$/);
  if (!match) return null;
  const year = parseInt(match[1]);
  const quarter = parseInt(match[2]);
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = quarter * 3;
  const lastDay = new Date(year, endMonth, 0).getDate();
  return {
    period_start: `${year}-${String(startMonth).padStart(2, '0')}-01`,
    period_end: `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`,
  };
}

function getAttainmentColor(pct: number) {
  if (pct >= 80) return 'text-success';
  if (pct >= 50) return 'text-warning';
  return 'text-destructive';
}

function getAttainmentBg(pct: number) {
  if (pct >= 80) return 'bg-success/10';
  if (pct >= 50) return 'bg-warning/10';
  return 'bg-destructive/10';
}

function QuotaAttainmentCell({ quotaId, targetValue, quotaType }: { quotaId: string; targetValue: number; quotaType: string }) {
  const { data: snapshots = [] } = useQuotaAttainment(quotaId);
  const latest = snapshots[0];
  if (!latest) return <span className="text-muted-foreground text-xs">--</span>;

  const value = Number(latest.attainment_value);
  const pct = targetValue > 0 ? Math.round((value / targetValue) * 100) : 0;
  const isMonetary = quotaType === 'revenue' || quotaType === 'pipeline';

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-mono">{isMonetary ? formatCurrency(value) : value.toLocaleString()}</span>
      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${getAttainmentBg(pct)} ${getAttainmentColor(pct)}`}>
        {pct}%
      </span>
    </div>
  );
}

export default function Quotas({ embedded }: { embedded?: boolean } = {}) {
  useCurrencyRerender();
  const { user, role } = useAuth();
  const { data: profiles = [] } = useProfiles();
  const { data: territories = [] } = useTerritories();
  const createQuota = useCreateQuota();
  const updateQuota = useUpdateQuota();
  const deleteQuota = useDeleteQuota();

  const canManage = role === 'admin' || role === 'sales_manager';

  // Filter state
  const periodOptions = useMemo(() => buildPeriodOptions(), []);
  const currentQ = `${currentYear()}-Q${Math.ceil((new Date().getMonth() + 1) / 3)}`;
  const [filterPeriod, setFilterPeriod] = useState(currentQ);
  const [filterUserId, setFilterUserId] = useState('');
  const [filterType, setFilterType] = useState('');

  const filters: QuotaFilters = {};
  if (filterPeriod) filters.period = filterPeriod;
  if (filterUserId) filters.user_id = filterUserId;
  if (filterType) filters.quota_type = filterType;

  const { data: quotas = [], isLoading } = useQuotas(filters);

  // Dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [editingQuota, setEditingQuota] = useState<Quota | null>(null);
  const [formUserId, setFormUserId] = useState('');
  const [formTerritoryId, setFormTerritoryId] = useState('');
  const [formPeriod, setFormPeriod] = useState(currentQ);
  const [formQuotaType, setFormQuotaType] = useState('revenue');
  const [formTargetValue, setFormTargetValue] = useState('');

  const profileMap = useMemo(() => {
    const m = new Map<string, string>();
    profiles.forEach((p: any) => m.set(p.user_id, p.full_name || p.email));
    return m;
  }, [profiles]);

  const resetForm = () => {
    setFormUserId('');
    setFormTerritoryId('');
    setFormPeriod(currentQ);
    setFormQuotaType('revenue');
    setFormTargetValue('');
  };

  const openEdit = (q: Quota) => {
    setFormUserId(q.user_id);
    setFormTerritoryId(q.territory_id || '');
    setFormQuotaType(q.quota_type);
    setFormTargetValue(String(q.target_value));
    // Reverse-lookup period from dates
    const startDate = new Date(q.period_start);
    const quarter = Math.ceil((startDate.getMonth() + 1) / 3);
    setFormPeriod(`${startDate.getFullYear()}-Q${quarter}`);
    setEditingQuota(q);
  };

  const handleCreate = async () => {
    if (!formUserId || !formTargetValue || !formPeriod) return;
    const dates = getQuarterDates(formPeriod);
    if (!dates) return;
    try {
      await createQuota.mutateAsync({
        user_id: formUserId,
        territory_id: formTerritoryId || undefined,
        period_start: dates.period_start,
        period_end: dates.period_end,
        quota_type: formQuotaType,
        target_value: parseFloat(formTargetValue),
      });
      setShowCreate(false);
      resetForm();
      toast.success('Quota created');
    } catch {
      toast.error('Failed to create quota');
    }
  };

  const handleUpdate = async () => {
    if (!editingQuota || !formUserId || !formTargetValue || !formPeriod) return;
    const dates = getQuarterDates(formPeriod);
    if (!dates) return;
    try {
      await updateQuota.mutateAsync({
        id: editingQuota.id,
        user_id: formUserId,
        territory_id: formTerritoryId || null,
        period_start: dates.period_start,
        period_end: dates.period_end,
        quota_type: formQuotaType,
        target_value: parseFloat(formTargetValue),
      });
      setEditingQuota(null);
      resetForm();
      toast.success('Quota updated');
    } catch {
      toast.error('Failed to update quota');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteQuota.mutateAsync(id);
      toast.success('Quota deleted');
    } catch {
      toast.error('Failed to delete quota');
    }
  };

  if (isLoading) return embedded ? <LoadingState /> : <AppLayout><LoadingState /></AppLayout>;

  const Wrapper = embedded ? 'div' : AppLayout;

  const isMonetary = (type: string) => type === 'revenue' || type === 'pipeline';

  const renderFormFields = () => (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">User *</label>
        <select
          value={formUserId}
          onChange={e => setFormUserId(e.target.value)}
          className="w-full mt-1.5 px-3 py-2.5 rounded-lg bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Select user...</option>
          {profiles.map((p: any) => (
            <option key={p.user_id} value={p.user_id}>{p.full_name || p.email}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Period *</label>
          <select
            value={formPeriod}
            onChange={e => setFormPeriod(e.target.value)}
            className="w-full mt-1.5 px-3 py-2.5 rounded-lg bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {periodOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quota Type *</label>
          <select
            value={formQuotaType}
            onChange={e => setFormQuotaType(e.target.value)}
            className="w-full mt-1.5 px-3 py-2.5 rounded-lg bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {QUOTA_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Target Value *</label>
          <input
            type="number"
            value={formTargetValue}
            onChange={e => setFormTargetValue(e.target.value)}
            placeholder={isMonetary(formQuotaType) ? 'e.g. 500000' : 'e.g. 20'}
            className="w-full mt-1.5 px-3 py-2.5 rounded-lg bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Territory</label>
          <select
            value={formTerritoryId}
            onChange={e => setFormTerritoryId(e.target.value)}
            className="w-full mt-1.5 px-3 py-2.5 rounded-lg bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">None</option>
            {territories.map((t: any) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );

  return (
    <Wrapper>
      <div className="page-header">
        <div>
          <h1 className="page-title">Quotas</h1>
          <p className="text-sm text-muted-foreground">
            {quotas.length} {quotas.length === 1 ? 'quota' : 'quotas'}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => { resetForm(); setShowCreate(true); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
          >
            <Plus size={14} /> New Quota
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="data-card mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Period</label>
            <select
              value={filterPeriod}
              onChange={e => setFilterPeriod(e.target.value)}
              className="px-3 py-1.5 rounded-md bg-secondary text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All Periods</option>
              {periodOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">User</label>
            <select
              value={filterUserId}
              onChange={e => setFilterUserId(e.target.value)}
              className="px-3 py-1.5 rounded-md bg-secondary text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All Users</option>
              {profiles.map((p: any) => (
                <option key={p.user_id} value={p.user_id}>{p.full_name || p.email}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">Type</label>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="px-3 py-1.5 rounded-md bg-secondary text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All Types</option>
              {QUOTA_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {quotas.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No quotas found"
          description={filterPeriod || filterUserId || filterType
            ? 'No quotas match your current filters. Try adjusting the filters or create a new quota.'
            : 'Create your first quota to start tracking sales targets.'
          }
          actionLabel={canManage ? 'New Quota' : undefined}
          onAction={canManage ? () => { resetForm(); setShowCreate(true); } : undefined}
        />
      ) : (
        <div className="data-card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">User</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Type</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Period</th>
                <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Target</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Attainment</th>
                {canManage && (
                  <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium w-20">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {quotas.map((q: Quota) => {
                const startDate = new Date(q.period_start);
                const quarter = Math.ceil((startDate.getMonth() + 1) / 3);
                const periodLabel = `Q${quarter} ${startDate.getFullYear()}`;
                const typeLabel = QUOTA_TYPES.find(t => t.value === q.quota_type)?.label || q.quota_type;

                return (
                  <tr key={q.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      {profileMap.get(q.user_id) || 'Unknown'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted capitalize">{typeLabel}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{periodLabel}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      <span className="metric-value">
                        {isMonetary(q.quota_type) ? formatCurrency(Number(q.target_value)) : Number(q.target_value).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <QuotaAttainmentCell quotaId={q.id} targetValue={Number(q.target_value)} quotaType={q.quota_type} />
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEdit(q)}
                            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                            title="Edit quota"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => handleDelete(q.id)}
                            className="p-1 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                            title="Delete quota"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Quota Dialog */}
      <Dialog open={showCreate} onOpenChange={(o) => { if (!o) resetForm(); setShowCreate(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Quota</DialogTitle>
          </DialogHeader>
          {renderFormFields()}
          <DialogFooter>
            <button onClick={() => { resetForm(); setShowCreate(false); }} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!formUserId || !formTargetValue || createQuota.isPending}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40"
            >
              {createQuota.isPending ? 'Creating...' : 'Create Quota'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Quota Dialog */}
      <Dialog open={!!editingQuota} onOpenChange={(o) => { if (!o) { setEditingQuota(null); resetForm(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Quota</DialogTitle>
          </DialogHeader>
          {renderFormFields()}
          <DialogFooter>
            <button onClick={() => { setEditingQuota(null); resetForm(); }} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            <button
              onClick={handleUpdate}
              disabled={!formUserId || !formTargetValue || updateQuota.isPending}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40"
            >
              {updateQuota.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Wrapper>
  );
}
