import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Building2, Database, TrendingUp, BarChart3, Users, Truck, RefreshCw, Home, FileText, Radar, User, Package, Shield, Sparkles } from 'lucide-react';
import { useQuickCreate } from '@/contexts/QuickCreateContext';
import { useSupabase } from '@/hooks/useSupabase';

const routes = [
  { label: 'Home', path: '/', icon: Home },
  { label: 'Accounts', path: '/clients', icon: Building2 },
  { label: 'Contacts', path: '/contacts', icon: Users },
  { label: 'Products', path: '/datasets', icon: Database },
  { label: 'Pipeline', path: '/pipeline', icon: TrendingUp },
  { label: 'Analytics', path: '/analytics', icon: BarChart3 },
  { label: 'Deliveries', path: '/deliveries', icon: Truck },
  { label: 'Renewals', path: '/renewals', icon: RefreshCw },
  { label: 'Admin', path: '/admin', icon: Shield },
  { label: 'Forecast', path: '/forecast', icon: TrendingUp },
  { label: 'Territories', path: '/territories', icon: Radar },
  { label: 'Commissions', path: '/commissions', icon: FileText },
  { label: 'Discovery', path: '/discovery', icon: Sparkles },
];

interface SearchResult {
  id: string;
  label: string;
  sublabel?: string;
  group: string;
  icon: any;
  path: string;
}

export default function CommandPalette() {
  const supabase = useSupabase();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [liveResults, setLiveResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const { open: openQuickCreate, openTrial } = useQuickCreate();
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
        setQuery('');
        setLiveResults([]);
        setSelectedIndex(0);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Live search with debounce
  useEffect(() => {
    if (!query || query.length < 2) {
      setLiveResults([]);
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const q = `%${query}%`;
        const [clientsRes, contactsRes, oppsRes, datasetsRes] = await Promise.all([
          supabase.from('clients').select('id, name, type, country').ilike('name', q).limit(5),
          supabase.from('contacts').select('id, first_name, last_name, title, client_id').or(`first_name.ilike.${q},last_name.ilike.${q}`).limit(5),
          supabase.from('opportunities').select('id, name, stage, value').ilike('name', q).limit(5),
          supabase.from('datasets').select('id, name, category').ilike('name', q).limit(5),
        ]);

        const results: SearchResult[] = [];
        (clientsRes.data || []).forEach((c: any) => {
          results.push({ id: c.id, label: c.name, sublabel: [c.type, c.country].filter(Boolean).join(' \u00b7 '), group: 'Accounts', icon: Building2, path: `/clients/${c.id}` });
        });
        (contactsRes.data || []).forEach((c: any) => {
          results.push({ id: c.id, label: `${c.first_name} ${c.last_name}`, sublabel: c.title || '', group: 'Contacts', icon: User, path: `/clients/${c.client_id}` });
        });
        (oppsRes.data || []).forEach((o: any) => {
          results.push({ id: o.id, label: o.name, sublabel: o.stage, group: 'Opportunities', icon: TrendingUp, path: `/pipeline/${o.id}` });
        });
        (datasetsRes.data || []).forEach((d: any) => {
          results.push({ id: d.id, label: d.name, sublabel: d.category, group: 'Products', icon: Package, path: `/datasets/${d.id}` });
        });
        setLiveResults(results);
        setSelectedIndex(0);
      } catch (e) {
        console.error('Search error:', e);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query]);

  const staticActions = useMemo(() => {
    const items = [
      { id: 'new-opp', label: 'New Opportunity', group: 'Actions', icon: Plus, action: () => { openQuickCreate(); setOpen(false); } },
      { id: 'new-trial', label: 'New Trial Delivery', group: 'Actions', icon: Plus, action: () => { openTrial(); setOpen(false); } },
      ...routes.map(r => ({ id: `nav-${r.path}`, label: r.label, group: 'Navigate', icon: r.icon, action: () => { navigate(r.path); setOpen(false); } })),
    ];
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter(i => i.label.toLowerCase().includes(q));
  }, [query, navigate, openQuickCreate]);

  const allItems = useMemo(() => {
    const searchItems = liveResults.map(r => ({
      id: r.id,
      label: r.label,
      sublabel: r.sublabel,
      group: r.group,
      icon: r.icon,
      action: () => { navigate(r.path); setOpen(false); },
    }));
    return [...searchItems, ...staticActions];
  }, [liveResults, staticActions, navigate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, allItems.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && allItems[selectedIndex]) { e.preventDefault(); allItems[selectedIndex].action(); }
  }, [allItems, selectedIndex]);

  if (!open) return null;

  const groups = Array.from(new Set(allItems.map(a => a.group)));
  let flatIndex = -1;

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-background/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="fixed inset-x-0 top-[15%] z-[60] mx-auto w-full max-w-lg">
        <div className="bg-popover border border-border rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search size={16} className="text-muted-foreground shrink-0" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search accounts, contacts, deals, products..."
              className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
              autoFocus
            />
            {isSearching && <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
            <kbd className="text-[10px] px-1.5 py-0.5 bg-muted rounded border border-border text-muted-foreground font-mono">ESC</kbd>
          </div>
          <div className="max-h-80 overflow-y-auto py-2">
            {allItems.length === 0 && !isSearching && (
              <p className="px-4 py-6 text-xs text-muted-foreground text-center">No results</p>
            )}
            {groups.map(group => {
              const items = allItems.filter(a => a.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group}>
                  <div className="px-4 py-1 text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{group}</div>
                  {items.map(item => {
                    flatIndex++;
                    const idx = flatIndex;
                    return (
                      <button
                        key={item.id}
                        onClick={item.action}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground transition-colors ${idx === selectedIndex ? 'bg-muted' : 'hover:bg-muted/50'}`}
                      >
                        <item.icon size={15} className="text-muted-foreground shrink-0" />
                        <div className="flex-1 text-left">
                          <span>{item.label}</span>
                          {'sublabel' in item && item.sublabel && (
                            <span className="ml-2 text-xs text-muted-foreground">{item.sublabel}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
