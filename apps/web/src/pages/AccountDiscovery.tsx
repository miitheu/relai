import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import LoadingState from '@/components/LoadingState';
import { useDiscoverySuggestions, useRunAccountDiscovery, useImportSuggestion, useDismissSuggestion, useSavedDiscoveries, DiscoverySuggestion } from '@/hooks/useAccountDiscovery';
import { useClients } from '@/hooks/useClients';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Search, Target, RefreshCw, UserPlus, X, ExternalLink, Globe, Building2, Filter, Layers, Users2, Combine, CheckSquare, Square } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

type FilterStatus = 'all' | 'new' | 'imported' | 'dismissed';
type DiscoveryMode = 'lookalike' | 'sector' | 'combined';

export default function AccountDiscovery() {
  const navigate = useNavigate();
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('new');
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [activeMode, setActiveMode] = useState<DiscoveryMode | null>(null);
  const [sectorInput, setSectorInput] = useState('');
  const [regionInput, setRegionInput] = useState('');
  const [detailSuggestion, setDetailSuggestion] = useState<DiscoverySuggestion | null>(null);
  const [discoveryName, setDiscoveryName] = useState('');
  const [searchSources, setSearchSources] = useState<Set<string>>(new Set(['ai_lookalike']));
  const [displaySources, setDisplaySources] = useState<Set<string>>(new Set(['ai_lookalike', 'sec_edgar', 'web_search']));

  const { data: savedDiscoveries = [] } = useSavedDiscoveries();
  const [viewingDiscovery, setViewingDiscovery] = useState<string | null>(null);
  const { data: suggestions = [], isLoading } = useDiscoverySuggestions(
    filterStatus !== 'all' ? { status: filterStatus } : undefined
  );
  const { data: clients = [] } = useClients();
  const runDiscovery = useRunAccountDiscovery();
  const importSuggestion = useImportSuggestion();
  const dismissSuggestion = useDismissSuggestion();

  const toggleSearchSource = (source: string) => {
    setSearchSources(prev => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      if (next.size === 0) next.add('ai_lookalike');
      return next;
    });
  };

  const toggleDisplaySource = (source: string) => {
    setDisplaySources(prev => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      if (next.size === 0) next.add('ai_lookalike');
      return next;
    });
  };

  const handleDiscover = async (mode: DiscoveryMode, clientId?: string) => {
    try {
      await runDiscovery.mutateAsync({
        mode,
        client_id: mode === 'lookalike' ? clientId || selectedClient || undefined : undefined,
        target_sectors: mode === 'sector' && sectorInput ? sectorInput.split(',').map(s => s.trim()) : undefined,
        target_regions: mode === 'sector' && regionInput ? regionInput.split(',').map(s => s.trim()) : undefined,
        max_suggestions: 20,
        sources: Array.from(searchSources),
        discovery_name: discoveryName.trim() || undefined,
      });
      setActiveMode(null);
    } catch {
      // error handled by mutation
    }
  };

  const handleImport = async (suggestion: DiscoverySuggestion) => {
    const result = await importSuggestion.mutateAsync(suggestion);
    if (result?.clientId) {
      setDetailSuggestion(null);
      navigate(`/clients/${result.clientId}`);
    }
  };

  const handleDismiss = async (id: string) => {
    await dismissSuggestion.mutateAsync({ id });
    setDetailSuggestion(null);
  };

  const scoreColor = (score: number | null) => {
    if (!score) return 'text-muted-foreground';
    if (score >= 70) return 'text-success';
    if (score >= 40) return 'text-warning';
    return 'text-destructive';
  };

  const scoreBg = (score: number | null) => {
    if (!score) return 'bg-muted';
    if (score >= 70) return 'bg-success/10';
    if (score >= 40) return 'bg-warning/10';
    return 'bg-destructive/10';
  };

  const sourceIcon = (source: string | null) => {
    switch (source) {
      case 'sec_edgar': return <Building2 size={11} />;
      case 'web_search': return <Globe size={11} />;
      default: return <Sparkles size={11} />;
    }
  };

  const sourceLabel = (source: string | null) => {
    switch (source) {
      case 'sec_edgar': return 'SEC';
      case 'web_search': return 'Web';
      default: return 'AI';
    }
  };

  const filteredClients = clientSearch
    ? clients.filter((c: any) => c.name.toLowerCase().includes(clientSearch.toLowerCase())).slice(0, 20)
    : clients.slice(0, 20);

  // Filter suggestions by selected sources and discovery view
  const filteredSuggestions = suggestions.filter(s => {
    const src = s.discovery_source || 'ai_lookalike';
    if (!displaySources.has(src)) return false;
    // When viewing a saved discovery, only show those results
    if (viewingDiscovery) return (s as any).discovery_name === viewingDiscovery;
    // Otherwise show unsaved (current) results
    return !(s as any).discovery_name;
  });

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Account Discovery</h1>
          <p className="text-sm text-muted-foreground">
            AI-powered prospecting — find accounts similar to your best clients
          </p>
        </div>
      </div>

      {/* Saved Discoveries */}
      {savedDiscoveries.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Saved Discoveries</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setViewingDiscovery(null)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${!viewingDiscovery ? 'bg-primary/10 text-primary border-primary/30' : 'text-muted-foreground border-border hover:border-primary/30'}`}
            >
              Current Results
            </button>
            {savedDiscoveries.map(d => (
              <button
                key={d.discovery_name}
                onClick={() => setViewingDiscovery(d.discovery_name)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${viewingDiscovery === d.discovery_name ? 'bg-primary/10 text-primary border-primary/30' : 'text-muted-foreground border-border hover:border-primary/30'}`}
              >
                {d.discovery_name}
                <span className="ml-1 text-[10px] text-muted-foreground/60">
                  ({d.run_type}{d.seed_client?.name ? ` · ${d.seed_client.name}` : ''})
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Three Mode Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* Lookalike Mode */}
        <div className={`data-card cursor-pointer transition-all ${activeMode === 'lookalike' ? 'ring-2 ring-primary' : 'hover:border-primary/30'}`}
          onClick={() => setActiveMode(activeMode === 'lookalike' ? null : 'lookalike')}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users2 size={16} className="text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Lookalike</h3>
              <p className="text-[10px] text-muted-foreground">Find similar companies</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Select an existing client and discover companies with a similar profile, strategy, and size.</p>
        </div>

        {/* Sector Mode */}
        <div className={`data-card cursor-pointer transition-all ${activeMode === 'sector' ? 'ring-2 ring-primary' : 'hover:border-primary/30'}`}
          onClick={() => setActiveMode(activeMode === 'sector' ? null : 'sector')}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
              <Layers size={16} className="text-warning" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Sector</h3>
              <p className="text-[10px] text-muted-foreground">Target specific sectors</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Discover firms in specific industry sectors and regions that would be strong buyers of your data.</p>
        </div>

        {/* Combined Mode */}
        <div className={`data-card cursor-pointer transition-all ${activeMode === 'combined' ? 'ring-2 ring-primary' : 'hover:border-primary/30'}`}
          onClick={() => setActiveMode(activeMode === 'combined' ? null : 'combined')}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
              <Combine size={16} className="text-success" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Combined</h3>
              <p className="text-[10px] text-muted-foreground">Full ICP analysis</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Analyze your Ideal Client Profile from closed deals and find the best-fit prospects across all dimensions.</p>
        </div>
      </div>

      {/* Mode Action Panel */}
      {activeMode && (
        <div className="data-card mb-4 border-primary/20">
          {/* Discovery name */}
          <div className="mb-3">
            <input
              value={discoveryName}
              onChange={e => setDiscoveryName(e.target.value)}
              placeholder="Name this discovery (optional, e.g. 'US Hedge Fund Prospects Q1')"
              className="w-full px-3 py-2 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
            />
          </div>
          {activeMode === 'lookalike' && (
            <div className="space-y-3">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Select sources & client</h4>

              {/* Source Checkboxes */}
              <div className="flex items-center gap-4">
                <span className="text-xs text-muted-foreground">Sources:</span>
                {[
                  { key: 'ai_lookalike', label: 'AI Analysis', icon: <Sparkles size={11} /> },
                  { key: 'sec_edgar', label: 'SEC EDGAR', icon: <Building2 size={11} /> },
                  { key: 'web_search', label: 'Web Search', icon: <Globe size={11} /> },
                ].map(({ key, label, icon }) => (
                  <button
                    key={key}
                    onClick={(e) => { e.stopPropagation(); toggleSearchSource(key); }}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                      searchSources.has(key)
                        ? 'bg-primary/10 text-primary border border-primary/30'
                        : 'bg-muted text-muted-foreground border border-transparent hover:border-border'
                    }`}
                  >
                    {searchSources.has(key) ? <CheckSquare size={12} /> : <Square size={12} />}
                    {icon}
                    {label}
                  </button>
                ))}
              </div>

              {/* Client Search + Run Button */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={clientSearch}
                    onChange={e => { setClientSearch(e.target.value); setShowClientPicker(true); }}
                    onFocus={() => setShowClientPicker(true)}
                    placeholder="Search accounts..."
                    className="w-full pl-8 pr-3 py-2 text-sm bg-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {showClientPicker && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-48 overflow-auto">
                      {filteredClients.map((c: any) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setSelectedClient(c.id);
                            setClientSearch(c.name);
                            setShowClientPicker(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center justify-between"
                        >
                          <span>{c.name}</span>
                          <span className="text-xs text-muted-foreground">{c.client_type}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleDiscover('lookalike')}
                  disabled={runDiscovery.isPending || !selectedClient}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 shrink-0"
                >
                  {runDiscovery.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Users2 size={14} />}
                  Find Lookalikes
                </button>
              </div>
            </div>
          )}

          {activeMode === 'sector' && (
            <div className="space-y-3">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Target sectors & regions</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Sectors (comma-separated)</label>
                  <input
                    value={sectorInput}
                    onChange={e => setSectorInput(e.target.value)}
                    placeholder="e.g. Hedge Fund, Asset Manager, Pension Fund"
                    className="mt-1 w-full px-3 py-2 text-sm bg-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Regions (comma-separated)</label>
                  <input
                    value={regionInput}
                    onChange={e => setRegionInput(e.target.value)}
                    placeholder="e.g. United States, United Kingdom, Singapore"
                    className="mt-1 w-full px-3 py-2 text-sm bg-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              <button
                onClick={() => handleDiscover('sector')}
                disabled={runDiscovery.isPending}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {runDiscovery.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Layers size={14} />}
                Discover by Sector
              </button>
            </div>
          )}

          {activeMode === 'combined' && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Full ICP Discovery</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Analyzes your top closed-won deals, active client patterns, and product portfolio to find the highest-potential prospects.
              </p>
              <button
                onClick={() => handleDiscover('combined')}
                disabled={runDiscovery.isPending}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {runDiscovery.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Run Combined Discovery
              </button>
            </div>
          )}
        </div>
      )}

      {/* Running indicator */}
      {runDiscovery.isPending && (
        <div className="data-card mb-4 border-primary/30">
          <div className="flex items-center gap-2">
            <RefreshCw size={14} className="animate-spin text-primary" />
            <span className="text-sm">Discovering accounts — analyzing your client patterns and market data with AI...</span>
          </div>
        </div>
      )}

      {runDiscovery.isError && (
        <div className="data-card mb-4 border-destructive/30 bg-destructive/5">
          <p className="text-sm text-destructive">{(runDiscovery.error as Error)?.message || 'Discovery failed'}</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        <Filter size={14} className="text-muted-foreground" />
        {/* Source filters */}
        {[
          { key: 'ai_lookalike', label: 'AI', icon: <Sparkles size={10} /> },
          { key: 'sec_edgar', label: 'SEC', icon: <Building2 size={10} /> },
          { key: 'web_search', label: 'Web', icon: <Globe size={10} /> },
        ].map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => toggleDisplaySource(key)}
            className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
              displaySources.has(key) ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {icon} {label}
          </button>
        ))}
        <span className="w-px h-4 bg-border mx-1" />
        {(['new', 'all', 'imported', 'dismissed'] as FilterStatus[]).map(status => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              filterStatus === status
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {status === 'new' ? 'New' : status === 'all' ? 'All' : status === 'imported' ? 'Imported' : 'Dismissed'}
            {status === 'new' && filteredSuggestions.length > 0 && filterStatus === 'new' && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px]">{filteredSuggestions.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Results */}
      {isLoading ? (
        <LoadingState />
      ) : filteredSuggestions.length === 0 ? (
        <div className="data-card text-center py-12">
          <Sparkles size={32} className="mx-auto text-muted-foreground mb-3" />
          <h3 className="text-sm font-medium mb-1">No suggestions yet</h3>
          <p className="text-xs text-muted-foreground">Choose a discovery mode above to find new prospects based on your existing client patterns.</p>
        </div>
      ) : (
        <div className="data-card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Company</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Type</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Strategy</th>
                <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Similarity</th>
                <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Fit Score</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Source</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Why</th>
                <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuggestions.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => setDetailSuggestion(s)}
                >
                  <td className="px-4 py-3">
                    <div>
                      <span className="font-medium">{s.name}</span>
                      {s.country && <span className="text-xs text-muted-foreground ml-1.5">{s.country}</span>}
                    </div>
                    {s.estimated_aum && s.estimated_aum !== 'Unknown' && (
                      <span className="text-xs text-muted-foreground">{s.estimated_aum}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted">{s.suggested_type || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    {(s as any).strategy_classification && (s as any).strategy_classification !== 'Unknown' ? (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                        (s as any).strategy_classification.includes('Systematic') || (s as any).strategy_classification.includes('Quant') ? 'bg-info/10 text-info' :
                        (s as any).strategy_classification.includes('Fundamental') ? 'bg-success/10 text-success' :
                        (s as any).strategy_classification.includes('Multi') ? 'bg-primary/10 text-primary' :
                        (s as any).strategy_classification.includes('Macro') ? 'bg-warning/10 text-warning' :
                        'bg-muted text-muted-foreground'
                      }`} title={(s as any).strategy_detail || ''}>
                        {(s as any).strategy_classification}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-mono font-medium px-2 py-0.5 rounded ${scoreBg(s.similarity_score)} ${scoreColor(s.similarity_score)}`}>
                      {s.similarity_score ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-mono font-medium px-2 py-0.5 rounded ${scoreBg(s.product_fit_score)} ${scoreColor(s.product_fit_score)}`}>
                      {s.product_fit_score ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        {sourceIcon(s.discovery_source)}
                        {sourceLabel(s.discovery_source)}
                      </span>
                      {(s as any).run_type && (
                        <span className="text-[10px] text-muted-foreground/60 block mt-0.5">
                          {(s as any).run_type === 'lookalike' && (s as any).seed_client?.name
                            ? `Similar to ${(s as any).seed_client.name}`
                            : (s as any).run_type === 'sector'
                            ? `Sector: ${((s as any).run_params?.sectors || []).join(', ') || '—'}`
                            : (s as any).run_type === 'combined'
                            ? 'ICP analysis'
                            : ''}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-muted-foreground line-clamp-2 max-w-[250px]">
                      {s.product_fit_reason || s.similarity_reason || '—'}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {s.status === 'new' && (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleImport(s); }}
                          disabled={importSuggestion.isPending}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-primary/10 text-primary text-xs hover:bg-primary/20 disabled:opacity-50"
                        >
                          <UserPlus size={11} /> Import
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDismiss(s.id); }}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )}
                    {s.status === 'imported' && s.imported_client_id && (
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/clients/${s.imported_client_id}`); }}
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        View <ExternalLink size={10} />
                      </button>
                    )}
                    {s.status === 'dismissed' && (
                      <span className="text-xs text-muted-foreground">Dismissed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detailSuggestion} onOpenChange={(open) => { if (!open) setDetailSuggestion(null); }}>
        <DialogContent className="sm:max-w-lg">
          {detailSuggestion && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detailSuggestion.name}
                  {detailSuggestion.suggested_type && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted font-normal">{detailSuggestion.suggested_type}</span>
                  )}
                </DialogTitle>
                {detailSuggestion.country && (
                  <p className="text-sm text-muted-foreground">{detailSuggestion.country}{detailSuggestion.estimated_aum && detailSuggestion.estimated_aum !== 'Unknown' ? ` · AUM: ${detailSuggestion.estimated_aum}` : ''}</p>
                )}
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Scores */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-2 rounded-lg bg-muted/50">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Similarity</p>
                    <span className={`text-lg font-mono font-semibold ${scoreColor(detailSuggestion.similarity_score)}`}>
                      {detailSuggestion.similarity_score ?? '—'}
                    </span>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/50">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Product Fit</p>
                    <span className={`text-lg font-mono font-semibold ${scoreColor(detailSuggestion.product_fit_score)}`}>
                      {detailSuggestion.product_fit_score ?? '—'}
                    </span>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/50">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Composite</p>
                    <span className={`text-lg font-mono font-semibold ${scoreColor(detailSuggestion.composite_score)}`}>
                      {detailSuggestion.composite_score ?? '—'}
                    </span>
                  </div>
                </div>

                {/* Source */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {sourceIcon(detailSuggestion.discovery_source)}
                  <span>Source: {sourceLabel(detailSuggestion.discovery_source)}</span>
                </div>

                {/* Similarity Reason */}
                {detailSuggestion.similarity_reason && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Why Similar</h4>
                    <p className="text-sm leading-relaxed">{detailSuggestion.similarity_reason}</p>
                  </div>
                )}

                {/* Product Fit Reason */}
                {detailSuggestion.product_fit_reason && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Product Fit</h4>
                    <p className="text-sm leading-relaxed">{detailSuggestion.product_fit_reason}</p>
                  </div>
                )}

                {/* Recommended Approach */}
                {detailSuggestion.recommended_approach && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Recommended Approach</h4>
                    <p className="text-sm leading-relaxed">{detailSuggestion.recommended_approach}</p>
                  </div>
                )}

                {/* Target Datasets */}
                {detailSuggestion.target_datasets?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Target Products</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {detailSuggestion.target_datasets.map((d: string, i: number) => (
                        <span key={i} className="px-2 py-1 rounded-md bg-primary/10 text-primary text-xs">{d}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter>
                {detailSuggestion.status === 'new' && (
                  <div className="flex gap-2 w-full">
                    <button
                      onClick={() => handleDismiss(detailSuggestion.id)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm text-muted-foreground hover:bg-muted"
                    >
                      <X size={13} /> Dismiss
                    </button>
                    <button
                      onClick={() => handleImport(detailSuggestion)}
                      disabled={importSuggestion.isPending}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 ml-auto"
                    >
                      <UserPlus size={13} /> Import as Client
                    </button>
                  </div>
                )}
                {detailSuggestion.status === 'imported' && detailSuggestion.imported_client_id && (
                  <button
                    onClick={() => { setDetailSuggestion(null); navigate(`/clients/${detailSuggestion.imported_client_id}`); }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 ml-auto"
                  >
                    View Client <ExternalLink size={12} />
                  </button>
                )}
                {detailSuggestion.status === 'dismissed' && (
                  <span className="text-sm text-muted-foreground">This suggestion has been dismissed</span>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
