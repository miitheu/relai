import AppLayout from '@/components/AppLayout';
import { useDatasets, useCreateDataset } from '@/hooks/useCrmData';
import { useUpdateDataset, useCacheDatasetStats } from '@/hooks/useDatasets';
import { useFeedStatistics, useFeedNames, useTradeFlowsStatistics } from '@/hooks/useInsightHub';
import { Database, Plus, Pencil, BarChart3, Globe, Ship } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import { useToast } from '@/hooks/use-toast';

export default function DatasetCatalog({ embedded }: { embedded?: boolean } = {}) {
  const { data: datasets = [], isLoading } = useDatasets();
  const createDataset = useCreateDataset();
  const updateDataset = useUpdateDataset();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [coverage, setCoverage] = useState('');
  const [freq, setFreq] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Insight Hub data
  const { data: feedStats, isLoading: loadingStats } = useFeedStatistics();
  const { data: feedNames = [] } = useFeedNames();
  const { data: tradeFlowsStats, isLoading: loadingTFStats } = useTradeFlowsStatistics();

  // Cache Insight Hub stats on dataset records for AI draft consumption
  const cacheStats = useCacheDatasetStats();
  const cachedRef = useRef(false);
  useEffect(() => {
    if (cachedRef.current || !feedStats || !tradeFlowsStats || datasets.length === 0) return;
    cachedRef.current = true;

    // Build per-feed stats from feedStats.feeds
    const feedStatsMap = feedStats.feeds || {};

    for (const ds of datasets) {
      const dsName = ds.name?.toLowerCase() || '';
      let stats: Record<string, any> = {};

      if (dsName === 'trade flows' || dsName === 'b2b supply chain') {
        stats = {
          unique_tickers: tradeFlowsStats.uniqueTickers,
          countries: tradeFlowsStats.countries,
          supplier_transactions: tradeFlowsStats.totalSupplierTransactions,
          customer_transactions: tradeFlowsStats.totalCustomerTransactions,
        };
      } else {
        // Match to a feed name
        const feedMatch = Object.keys(feedStatsMap).find(f =>
          f.toLowerCase().includes(dsName) || dsName.includes(f.toLowerCase())
        );
        if (feedMatch) {
          stats = {
            companies_covered: feedStatsMap[feedMatch],
            total_records: feedStats.totalRecords,
            unique_tickers: feedStats.uniqueTickers,
            countries: feedStats.countries,
          };
        } else {
          stats = {
            total_records: feedStats.totalRecords,
            unique_tickers: feedStats.uniqueTickers,
            countries: feedStats.countries,
          };
        }
      }

      if (Object.keys(stats).length > 0) {
        cacheStats.mutate({ datasetId: ds.id, stats });
      }
    }
  }, [feedStats, tradeFlowsStats, datasets.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetForm = () => {
    setName(''); setDesc(''); setCoverage(''); setFreq(''); setIsActive(true);
    setEditingId(null); setShowForm(false);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (d: any) => {
    setEditingId(d.id);
    setName(d.name || '');
    setDesc(d.description || '');
    setCoverage(d.coverage || '');
    setFreq(d.update_frequency || '');
    setIsActive(d.is_active);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateDataset.mutateAsync({ id: editingId, name, description: desc, coverage, update_frequency: freq, is_active: isActive });
        toast({ title: 'Dataset updated' });
      } else {
        await createDataset.mutateAsync({ name, description: desc, coverage, update_frequency: freq });
        toast({ title: 'Dataset created' });
      }
      resetForm();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const isPending = createDataset.isPending || updateDataset.isPending;

  if (isLoading) return embedded ? <LoadingState /> : <AppLayout><LoadingState /></AppLayout>;

  const Wrapper = embedded ? 'div' : AppLayout;

  return (
    <Wrapper>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dataset Catalog</h1>
          <p className="text-sm text-muted-foreground">{datasets.length} datasets</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90">
          <Plus size={14} /> New Dataset
        </button>
      </div>

      {/* Insight Hub Feed Stats */}
      {feedStats && (
        <div className="data-card mb-6 border-primary/20">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Globe size={14} className="text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Insight Hub — Live Coverage</h3>
              <p className="text-[10px] text-muted-foreground">Cross-project data from Insight Hub</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Total Records</p>
              <p className="text-lg font-bold font-mono">{feedStats.totalRecords?.toLocaleString() || '—'}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Unique Tickers</p>
              <p className="text-lg font-bold font-mono">{feedStats.uniqueTickers?.toLocaleString() || '—'}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Countries</p>
              <p className="text-lg font-bold font-mono">{feedStats.countries?.toLocaleString() || '—'}</p>
            </div>
          </div>
          {feedStats.feeds && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-medium mb-1">Companies by Feed</p>
              {Object.entries(feedStats.feeds)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .map(([feed, count]) => (
                  <div key={feed} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <BarChart3 size={11} className="text-primary" />
                      <span>{feed}</span>
                    </div>
                    <span className="font-mono text-muted-foreground">{(count as number).toLocaleString()}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
      {loadingStats && (
        <div className="data-card mb-6 animate-pulse">
          <div className="h-4 bg-muted rounded w-48 mb-3"></div>
          <div className="grid grid-cols-3 gap-4">
            <div className="h-16 bg-muted rounded"></div>
            <div className="h-16 bg-muted rounded"></div>
            <div className="h-16 bg-muted rounded"></div>
          </div>
        </div>
      )}

      {/* Trade Flows Stats */}
      {tradeFlowsStats && (
        <div className="data-card mb-6 border-accent/20">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
              <Ship size={14} className="text-accent-foreground" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Trade Flows — Live Coverage</h3>
              <p className="text-[10px] text-muted-foreground">B2B supply chain transaction data</p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Unique Tickers</p>
              <p className="text-lg font-bold font-mono">{tradeFlowsStats.uniqueTickers?.toLocaleString() || '—'}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Countries</p>
              <p className="text-lg font-bold font-mono">{tradeFlowsStats.countries?.toLocaleString() || '—'}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Supplier Txns</p>
              <p className="text-lg font-bold font-mono">{tradeFlowsStats.totalSupplierTransactions?.toLocaleString() || '—'}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Customer Txns</p>
              <p className="text-lg font-bold font-mono">{tradeFlowsStats.totalCustomerTransactions?.toLocaleString() || '—'}</p>
            </div>
          </div>
        </div>
      )}
      {loadingTFStats && (
        <div className="data-card mb-6 animate-pulse">
          <div className="h-4 bg-muted rounded w-48 mb-3"></div>
          <div className="grid grid-cols-4 gap-4">
            <div className="h-16 bg-muted rounded"></div>
            <div className="h-16 bg-muted rounded"></div>
            <div className="h-16 bg-muted rounded"></div>
            <div className="h-16 bg-muted rounded"></div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="data-card w-full max-w-md space-y-4">
            <h2 className="text-sm font-semibold">{editingId ? 'Edit Dataset' : 'New Dataset'}</h2>
            <input value={name} onChange={e => setName(e.target.value)} required placeholder="Dataset name" className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm" />
            <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description" className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm h-20" />
            <div className="grid grid-cols-2 gap-3">
              <input value={coverage} onChange={e => setCoverage(e.target.value)} placeholder="Coverage" className="px-3 py-2 bg-muted border border-border rounded-md text-sm" />
              <input value={freq} onChange={e => setFreq(e.target.value)} placeholder="Update frequency" className="px-3 py-2 bg-muted border border-border rounded-md text-sm" />
            </div>
            {editingId && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="rounded border-border" />
                Active
              </label>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={resetForm} className="px-3 py-2 text-sm text-muted-foreground">Cancel</button>
              <button type="submit" disabled={isPending} className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50">
                {isPending ? 'Saving...' : editingId ? 'Save' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {datasets.length === 0 ? (
        <EmptyState icon={Database} title="No datasets yet" description="Add your first dataset to the catalog." actionLabel="New Dataset" onAction={openCreate} />
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {datasets.map((d: any) => (
            <div key={d.id} className="data-card hover:border-primary/30 transition-colors group relative">
              <button
                onClick={() => openEdit(d)}
                className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Pencil size={13} />
              </button>
              <div className="flex items-start gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Database size={16} className="text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{d.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{d.coverage || '—'} · {d.update_frequency || '—'}</p>
                </div>
              </div>
              {d.description && <p className="text-xs text-muted-foreground leading-relaxed mb-3">{d.description}</p>}
              {!d.is_active && <span className="status-badge bg-muted text-muted-foreground">Inactive</span>}
            </div>
          ))}
        </div>
      )}
    </Wrapper>
  );
}
