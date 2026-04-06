import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSupabase } from '@/hooks/useSupabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Sparkles, Download, Building2, CheckCircle2, AlertCircle, Link2, Loader2, ChevronLeft, ChevronRight, FileText } from 'lucide-react';

interface EnrichedEntity {
  cik: string;
  name: string;
  ticker?: string;
  exchange?: string;
  sic?: string;
  sicDescription?: string;
  stateOfIncorporation?: string;
  latest13FDate?: string;
  filing_count_13f?: number;
}

interface ImportResult {
  cik: string;
  name: string;
  status: 'created' | 'linked' | 'skipped' | 'error';
  reason: string;
  client_id?: string;
}

const PAGE_SIZE = 25;

export default function SecImportTab() {
  const supabase = useSupabase();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<EnrichedEntity[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [knownCikCount, setKnownCikCount] = useState(0);

  // Filters
  const [nameSearch, setNameSearch] = useState('');
  const [sicFilter, setSicFilter] = useState<string>('investment_only');
  const [aum13F, setAum13F] = useState<string>('no_filter');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const loadSuggestions = async (newOffset = 0) => {
    setLoading(true);
    setImportResults(null);
    try {
      const { data, error } = await supabase.functions.invoke('sec-import-accounts', {
        body: {
          action: 'discover',
          limit: PAGE_SIZE,
          offset: newOffset,
          name_search: nameSearch.trim() || undefined,
          sic_filter: sicFilter,
          min_aum: aum13F === '13f_filers' ? 100_000_000 : undefined,
        },
      });
      if (error) throw error;
      setSuggestions(data.suggestions || []);
      setTotal(data.total || 0);
      setOffset(newOffset);
      setKnownCikCount(data.known_cik_count || 0);
      setSelected(new Set());
      setHasRun(true);
    } catch (err: any) {
      toast.error(`Discovery failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (cik: string) => {
    const next = new Set(selected);
    if (next.has(cik)) {
      next.delete(cik);
    } else {
      next.add(cik);
    }
    setSelected(next);
  };

  const toggleSelectAll = () => {
    if (selected.size === suggestions.length) setSelected(new Set());
    else setSelected(new Set(suggestions.map(r => r.cik)));
  };

  const handleImport = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    setImportResults(null);
    const entities = suggestions.filter(r => selected.has(r.cik)).map(r => ({ cik: r.cik, name: r.name, ticker: r.ticker }));
    try {
      const { data, error } = await supabase.functions.invoke('sec-import-accounts', {
        body: { action: 'import', entities, imported_by: user?.id },
      });
      if (error) throw error;
      setImportResults(data.results || []);
      toast.success(`Imported ${data.created} new accounts, linked ${data.linked}`);
      loadSuggestions(offset);
    } catch (err: any) {
      toast.error(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium">SEC Fund Discovery</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Discover SEC-registered funds and managers not yet in your CRM. Set your filters, then run discovery.
          Accounts already linked by CIK or name are automatically excluded.
        </p>
      </div>

      {/* Primary action + filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={() => loadSuggestions(0)} disabled={loading} size="sm">
          {loading ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Sparkles size={14} className="mr-1.5" />}
          {hasRun ? 'Refresh Results' : 'Discover New Funds'}
        </Button>
        <Select value={sicFilter} onValueChange={v => { setSicFilter(v); if (hasRun) loadSuggestions(0); }}>
          <SelectTrigger className="h-8 w-[190px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="investment_only">Investment-related only</SelectItem>
            <SelectItem value="all">All SEC filers</SelectItem>
          </SelectContent>
        </Select>
        <Select value={aum13F} onValueChange={v => { setAum13F(v); if (hasRun) loadSuggestions(0); }}>
          <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="no_filter">Any entity</SelectItem>
            <SelectItem value="13f_filers">13F filers only (&gt;$100M AUM)</SelectItem>
          </SelectContent>
        </Select>
        {hasRun && (
          <Input
            placeholder="Narrow by name, ticker, CIK..."
            value={nameSearch}
            onChange={e => setNameSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && loadSuggestions(0)}
            className="h-8 w-52 text-xs ml-auto"
          />
        )}
      </div>

      {/* Stats */}
      {hasRun && !loading && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span><strong className="text-foreground">{total.toLocaleString()}</strong> new entities match filters</span>
          <span className="text-border">|</span>
          <span><strong className="text-foreground">{knownCikCount}</strong> CIKs excluded (already in CRM)</span>
          {selected.size > 0 && (
            <>
              <span className="text-border">|</span>
              <Badge variant="default" className="text-xs">{selected.size} selected</Badge>
            </>
          )}
        </div>
      )}

      {/* Results table */}
      {suggestions.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Building2 size={14} />
                Discovery Results
              </CardTitle>
              <Button size="sm" onClick={handleImport} disabled={importing || selected.size === 0}>
                {importing ? <Loader2 size={14} className="animate-spin mr-1" /> : <Download size={14} className="mr-1" />}
                Import {selected.size > 0 ? `(${selected.size})` : 'Selected'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="border-t">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={suggestions.length > 0 && selected.size === suggestions.length}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Company Name</TableHead>
                    <TableHead>CIK</TableHead>
                    <TableHead>Ticker</TableHead>
                    <TableHead>SIC / Sector</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Latest 13F</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suggestions.map(r => (
                    <TableRow key={r.cik}>
                      <TableCell>
                        <Checkbox checked={selected.has(r.cik)} onCheckedChange={() => toggleSelect(r.cik)} />
                      </TableCell>
                      <TableCell className="font-medium text-sm">{r.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">{r.cik}</TableCell>
                      <TableCell className="text-xs">{r.ticker || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate" title={r.sicDescription}>
                        {r.sicDescription || (r.sic ? `SIC ${r.sic}` : '—')}
                      </TableCell>
                      <TableCell className="text-xs">{r.stateOfIncorporation || '—'}</TableCell>
                      <TableCell className="text-xs">
                        {r.latest13FDate ? (
                          <Badge variant="outline" className="text-xs gap-1">
                            <FileText size={10} /> {r.latest13FDate}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-2 border-t text-xs text-muted-foreground">
              <span>Page {currentPage} of {totalPages.toLocaleString()}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={offset === 0 || loading} onClick={() => loadSuggestions(Math.max(0, offset - PAGE_SIZE))}>
                  <ChevronLeft size={12} className="mr-0.5" /> Prev
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={offset + PAGE_SIZE >= total || loading} onClick={() => loadSuggestions(offset + PAGE_SIZE)}>
                  Next <ChevronRight size={12} className="ml-0.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import Results */}
      {importResults && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Import Results</CardTitle>
          </CardHeader>
          <CardContent className="p-0 border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>CIK</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importResults.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-sm">{r.name}</TableCell>
                    <TableCell className="text-xs font-mono">{r.cik}</TableCell>
                    <TableCell>
                      <Badge
                        variant={r.status === 'created' ? 'default' : r.status === 'linked' ? 'secondary' : r.status === 'error' ? 'destructive' : 'outline'}
                        className="text-xs gap-1 capitalize"
                      >
                        {r.status === 'created' && <CheckCircle2 size={10} />}
                        {r.status === 'error' && <AlertCircle size={10} />}
                        {r.status === 'linked' && <Link2 size={10} />}
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
