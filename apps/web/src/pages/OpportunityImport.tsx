import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Upload, FileText, Building2, CheckCircle, ChevronRight, Loader2, AlertTriangle, XCircle, Database, User, GitMerge } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { parseCSV } from '@/lib/companyMatching';
import { autoMapOppColumns, OppColumnMapping, OPP_FIELD_LABELS } from '@/lib/oppImportMapping';
import {
  useCreateOppImportBatch,
  useInsertOppStagingRows,
  useMatchOpportunities,
  useOppStagingRows,
  useOppStagingStats,
  useOppImportBatch,
  useResolveOppRow,
  useImportOpportunities,
  useUpdateOppStagingRow,
} from '@/hooks/useOpportunityImport';
import { useClients } from '@/hooks/useCrmData';
import { useDatasets } from '@/hooks/useDatasets';
import { useProfiles } from '@/hooks/useProfiles';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { stageOrder } from '@/data/mockData';

type ImportStep = 'upload' | 'mapping' | 'matching' | 'review' | 'importing' | 'complete';

const STEPS: { id: ImportStep; label: string; icon: React.ElementType }[] = [
  { id: 'upload', label: 'Upload', icon: Upload },
  { id: 'mapping', label: 'Map Columns', icon: FileText },
  { id: 'matching', label: 'Match & Validate', icon: Building2 },
  { id: 'review', label: 'Review & Resolve', icon: GitMerge },
  { id: 'importing', label: 'Import', icon: CheckCircle },
];

export default function OpportunityImport() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState<ImportStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [columnMapping, setColumnMapping] = useState<OppColumnMapping | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);

  const createBatch = useCreateOppImportBatch();
  const insertRows = useInsertOppStagingRows();
  const matchOpps = useMatchOpportunities();
  const importOpps = useImportOpportunities();

  const { data: batch } = useOppImportBatch(batchId || undefined);
  const { data: stagingRows = [] } = useOppStagingRows(batchId || undefined);
  const { data: stats } = useOppStagingStats(batchId || undefined);
  const { data: clients = [] } = useClients();
  const { data: datasets = [] } = useDatasets();
  const { data: profiles = [] } = useProfiles();

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const text = await f.text();
    const parsed = parseCSV(text);
    setParsedData(parsed);
    setColumnMapping(autoMapOppColumns(parsed.headers));
    setStep('mapping');
  }, []);

  const handleStartMatching = async () => {
    if (!parsedData || !columnMapping || !file) return;
    try {
      const batch = await createBatch.mutateAsync({
        name: `Opp Import ${new Date().toLocaleDateString()}`,
        file_name: file.name,
        total_rows: parsedData.rows.length,
      });
      setBatchId(batch.id);

      const stagingData = parsedData.rows.map((row, idx) => ({
        batch_id: batch.id,
        row_number: idx + 1,
        raw_name: columnMapping.name !== null ? row[columnMapping.name] || null : null,
        raw_stage: columnMapping.stage !== null ? row[columnMapping.stage] || null : null,
        raw_client_type: columnMapping.clientType !== null ? row[columnMapping.clientType] || null : null,
        raw_product: columnMapping.product !== null ? row[columnMapping.product] || null : null,
        raw_owner: columnMapping.owner !== null ? row[columnMapping.owner] || null : null,
        raw_deal_value_min: columnMapping.dealValueMin !== null ? row[columnMapping.dealValueMin] || null : null,
        raw_deal_value_max: columnMapping.dealValueMax !== null ? row[columnMapping.dealValueMax] || null : null,
        raw_source: columnMapping.source !== null ? row[columnMapping.source] || null : null,
        raw_contacts: columnMapping.contacts !== null ? row[columnMapping.contacts] || null : null,
        raw_deal_creation_date: columnMapping.dealCreationDate !== null ? row[columnMapping.dealCreationDate] || null : null,
        raw_expected_close_date: columnMapping.expectedCloseDate !== null ? row[columnMapping.expectedCloseDate] || null : null,
        raw_renewal_due: columnMapping.renewalDue !== null ? row[columnMapping.renewalDue] || null : null,
        raw_comment: columnMapping.comment !== null ? row[columnMapping.comment] || null : null,
        raw_deal_type: columnMapping.dealType !== null ? row[columnMapping.dealType] || null : null,
      }));

      await insertRows.mutateAsync(stagingData);
      setStep('matching');
      await matchOpps.mutateAsync(batch.id);
      setStep('review');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleFinalImport = async () => {
    if (!batchId) return;
    try {
      setStep('importing');
      const result = await importOpps.mutateAsync(batchId);
      toast({ title: 'Import Complete', description: `Imported ${result.imported} opportunities, skipped ${result.skipped}.` });
      setStep('complete');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const currentStepIndex = STEPS.findIndex(s => s.id === step);
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Opportunity Import</h1>
            <p className="text-sm text-muted-foreground">Import opportunities with company, product, and owner resolution</p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {STEPS.map((s, idx) => {
              const Icon = s.icon;
              const isActive = s.id === step;
              const isComplete = idx < currentStepIndex;
              return (
                <div key={s.id} className="flex items-center">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm ${
                    isActive ? 'bg-primary text-primary-foreground' :
                    isComplete ? 'bg-success/10 text-success' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {isComplete ? <CheckCircle size={14} /> : <Icon size={14} />}
                    <span className="hidden sm:inline">{s.label}</span>
                  </div>
                  {idx < STEPS.length - 1 && <ChevronRight size={16} className="mx-2 text-muted-foreground" />}
                </div>
              );
            })}
          </div>
          <Progress value={progress} className="h-1" />
        </div>

        {/* Upload */}
        {step === 'upload' && (
          <Card>
            <CardHeader>
              <CardTitle>Upload Opportunity File</CardTitle>
              <CardDescription>Upload a CSV file with opportunity data. The system will match companies, products, and owners before importing.</CardDescription>
            </CardHeader>
            <CardContent>
              <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                <Upload size={32} className="text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground">Click to upload or drag and drop</span>
                <span className="text-xs text-muted-foreground mt-1">CSV files only</span>
                <input type="file" accept=".csv" onChange={handleFileSelect} className="hidden" />
              </label>
              <div className="mt-6 p-4 bg-muted/30 rounded-lg">
                <p className="text-sm font-medium mb-2">Expected columns:</p>
                <div className="flex flex-wrap gap-2">
                  {['Name', 'Stage', 'Client Type', 'Product', 'Owner', 'Deal Value Min', 'Deal Value Max', 'Source', 'Contacts', 'Deal creation date', 'Expected Close Date', 'Renewal Due', 'Comment', 'Deal Type'].map(col => (
                    <Badge key={col} variant="secondary">{col}</Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Mapping */}
        {step === 'mapping' && parsedData && columnMapping && (
          <Card>
            <CardHeader>
              <CardTitle>Map Columns</CardTitle>
              <CardDescription>Verify column mapping. Found {parsedData.rows.length} rows.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-6">
                {(Object.keys(columnMapping) as (keyof OppColumnMapping)[]).map(field => (
                  <div key={field} className="flex items-center gap-3">
                    <span className="text-sm font-medium w-36">{OPP_FIELD_LABELS[field]}</span>
                    <Select
                      value={columnMapping[field]?.toString() ?? 'unmapped'}
                      onValueChange={(v) => setColumnMapping({ ...columnMapping, [field]: v === 'unmapped' ? null : parseInt(v) })}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unmapped">— Not Mapped —</SelectItem>
                        {parsedData.headers.map((h, i) => (
                          <SelectItem key={i} value={i.toString()}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="text-xs font-medium bg-muted px-3 py-2">Preview (first 3 rows)</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        {parsedData.headers.map((h, i) => (
                          <th key={i} className="px-3 py-2 text-left text-xs font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.rows.slice(0, 3).map((row, i) => (
                        <tr key={i} className="border-b">
                          {row.map((cell, j) => (
                            <td key={j} className="px-3 py-2 text-xs truncate max-w-[150px]">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <Button variant="outline" onClick={() => { setStep('upload'); setFile(null); setParsedData(null); }}>Back</Button>
                <Button onClick={handleStartMatching} disabled={createBatch.isPending || insertRows.isPending}>
                  {createBatch.isPending || insertRows.isPending ? <><Loader2 className="animate-spin mr-2" size={14} /> Processing...</> : 'Continue to Matching'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Matching */}
        {step === 'matching' && (
          <Card>
            <CardHeader>
              <CardTitle>Matching & Validating</CardTitle>
              <CardDescription>Resolving companies, products, owners, and checking for duplicates...</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center py-12">
              <Loader2 className="animate-spin text-primary mb-4" size={48} />
              <p className="text-sm text-muted-foreground">This may take a moment for large files.</p>
            </CardContent>
          </Card>
        )}

        {/* Review */}
        {step === 'review' && stats && (
          <ReviewStep
            batchId={batchId!}
            stats={stats}
            stagingRows={stagingRows}
            clients={clients}
            datasets={datasets}
            profiles={profiles}
            onFinalImport={handleFinalImport}
          />
        )}

        {/* Importing */}
        {step === 'importing' && (
          <Card>
            <CardHeader>
              <CardTitle>Importing Opportunities</CardTitle>
              <CardDescription>Creating opportunity records...</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center py-12">
              <Loader2 className="animate-spin text-primary mb-4" size={48} />
              <p className="text-sm text-muted-foreground">Please wait while opportunities are imported.</p>
            </CardContent>
          </Card>
        )}

        {/* Complete */}
        {step === 'complete' && stats && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-success">
                <CheckCircle size={20} /> Import Complete
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="p-4 bg-success/10 rounded-lg text-center">
                  <p className="text-2xl font-bold text-success">{stats.imported}</p>
                  <p className="text-xs text-muted-foreground">Opportunities Imported</p>
                </div>
                <div className="p-4 bg-warning/10 rounded-lg text-center">
                  <p className="text-2xl font-bold text-warning">{stats.total - stats.imported - stats.pending}</p>
                  <p className="text-xs text-muted-foreground">Skipped / Errors</p>
                </div>
                <div className="p-4 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total Rows</p>
                </div>
              </div>
              <div className="flex justify-center gap-3">
                <Button variant="outline" onClick={() => navigate('/pipeline')}>View Pipeline</Button>
                <Button onClick={() => { setStep('upload'); setFile(null); setParsedData(null); setBatchId(null); }}>Import More</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

// ============================================================
// REVIEW STEP
// ============================================================

function ReviewStep({
  batchId,
  stats,
  stagingRows,
  clients,
  datasets,
  profiles,
  onFinalImport,
}: {
  batchId: string;
  stats: any;
  stagingRows: any[];
  clients: any[];
  datasets: any[];
  profiles: any[];
  onFinalImport: () => void;
}) {
  const [resolveDialog, setResolveDialog] = useState<{ row: any } | null>(null);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [selectedStage, setSelectedStage] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newDatasetName, setNewDatasetName] = useState('');
  const [createNewClient, setCreateNewClient] = useState(false);
  const [createNewDataset, setCreateNewDataset] = useState(false);
  const resolveRow = useResolveOppRow();
  const updateRow = useUpdateOppStagingRow();

  const pendingRows = stagingRows.filter(r => r.resolution_status === 'pending');
  const needsReview = stagingRows.filter(r =>
    r.resolution_status === 'pending' &&
    (r.client_match_confidence === 'ambiguous' || r.client_match_confidence === 'new' || r.client_match_confidence === 'none' ||
     r.dataset_match_confidence === 'ambiguous' || r.dataset_match_confidence === 'new' ||
     r.owner_match_confidence === 'ambiguous' || r.owner_match_confidence === 'new' ||
     r.duplicate_status === 'likely_duplicate')
  );
  const autoResolvable = pendingRows.filter(r =>
    (r.client_match_confidence === 'exact' || r.client_match_confidence === 'likely') &&
    r.duplicate_status !== 'likely_duplicate' &&
    r.validation_status !== 'invalid'
  );
  const resolvedRows = stagingRows.filter(r => r.resolution_status === 'resolved');
  const canImport = pendingRows.length === 0 && resolvedRows.length > 0;

  const handleAutoResolve = async () => {
    for (const row of autoResolvable) {
      await resolveRow.mutateAsync({
        stagingRowId: row.id,
        clientId: row.matched_client_id,
        datasetId: row.matched_dataset_id,
        ownerId: row.matched_owner_id,
        stage: row.normalized_stage,
      });
    }
  };

  const openResolve = (row: any) => {
    setResolveDialog({ row });
    setSelectedClientId(row.matched_client_id || '');
    setSelectedDatasetId(row.matched_dataset_id || '');
    setSelectedOwnerId(row.matched_owner_id || '');
    setSelectedStage(row.normalized_stage || 'Lead');
    setCreateNewClient(false);
    setCreateNewDataset(false);
    setNewClientName(row.raw_name || '');
    setNewDatasetName(row.raw_product || '');
  };

  const handleResolve = async () => {
    if (!resolveDialog) return;
    try {
      await resolveRow.mutateAsync({
        stagingRowId: resolveDialog.row.id,
        clientId: createNewClient ? undefined : selectedClientId || undefined,
        datasetId: createNewDataset ? undefined : selectedDatasetId || undefined,
        ownerId: selectedOwnerId || undefined,
        stage: selectedStage || undefined,
        createNewClient,
        newClientName: createNewClient ? newClientName : undefined,
        createNewDataset,
        newDatasetName: createNewDataset ? newDatasetName : undefined,
      });
      setResolveDialog(null);
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleSkip = async (rowId: string) => {
    await updateRow.mutateAsync({ id: rowId, resolution_status: 'skipped' });
  };

  const getConfBadge = (conf: string) => {
    if (conf === 'exact' || conf === 'likely') return <Badge variant="default" className="text-[10px]">{conf}</Badge>;
    if (conf === 'ambiguous') return <Badge variant="secondary" className="text-[10px] bg-warning/10 text-warning">{conf}</Badge>;
    return <Badge variant="outline" className="text-[10px] text-destructive">{conf}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Total Rows</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold text-success">{stats.clientExact}</p>
          <p className="text-xs text-muted-foreground">Clients Matched</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold text-warning">{stats.clientAmbiguous + stats.clientNew}</p>
          <p className="text-xs text-muted-foreground">Need Review</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold text-destructive">{stats.duplicates}</p>
          <p className="text-xs text-muted-foreground">Possible Duplicates</p>
        </CardContent></Card>
      </div>

      {/* Match detail */}
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-2"><Database size={14} className="text-muted-foreground" /><span className="text-sm font-medium">Datasets</span></div>
          <p className="text-sm"><span className="font-bold text-success">{stats.datasetMatched}</span> matched · <span className="text-muted-foreground">{stats.total - stats.datasetMatched} unmatched</span></p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-2"><User size={14} className="text-muted-foreground" /><span className="text-sm font-medium">Owners</span></div>
          <p className="text-sm"><span className="font-bold text-success">{stats.ownerMatched}</span> matched · <span className="text-muted-foreground">{stats.total - stats.ownerMatched} unmatched</span></p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-2"><CheckCircle size={14} className="text-muted-foreground" /><span className="text-sm font-medium">Resolved</span></div>
          <p className="text-sm"><span className="font-bold">{stats.resolved}</span> of {stats.total}</p>
        </CardContent></Card>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        {autoResolvable.length > 0 && (
          <Button onClick={handleAutoResolve} disabled={resolveRow.isPending}>
            {resolveRow.isPending ? <Loader2 className="animate-spin mr-2" size={14} /> : null}
            Auto-resolve {autoResolvable.length} confident matches
          </Button>
        )}
        {pendingRows.length > 0 && (
          <Button variant="outline" onClick={async () => {
            for (const row of pendingRows) {
              if (row.resolution_status !== 'pending') continue;
              const hasClient = row.matched_client_id && (row.client_match_confidence === 'exact' || row.client_match_confidence === 'likely');
              await resolveRow.mutateAsync({
                stagingRowId: row.id,
                clientId: hasClient ? row.matched_client_id : undefined,
                datasetId: row.matched_dataset_id || undefined,
                ownerId: row.matched_owner_id || undefined,
                stage: row.normalized_stage || undefined,
                createNewClient: !hasClient,
                newClientName: !hasClient ? (row.raw_name || 'Unknown Company') : undefined,
                createNewDataset: false,
              });
            }
          }} disabled={resolveRow.isPending}>
            {resolveRow.isPending ? <Loader2 className="animate-spin mr-2" size={14} /> : null}
            Resolve all ({pendingRows.length} pending) — create new clients if needed
          </Button>
        )}
        <div className="ml-auto flex items-center gap-3">
          {pendingRows.length > 0 && (
            <p className="text-sm text-muted-foreground">{pendingRows.length} rows still pending</p>
          )}
          <Button onClick={onFinalImport} disabled={!canImport}>
            {canImport ? `Import ${resolvedRows.length} Opportunities` : 'Resolve all rows to import'}
          </Button>
        </div>
      </div>

      {/* Rows table */}
      <Tabs defaultValue={needsReview.length > 0 ? 'review' : 'all'}>
        <TabsList>
          <TabsTrigger value="review">Needs Review ({needsReview.length})</TabsTrigger>
          <TabsTrigger value="all">All Rows ({stagingRows.length})</TabsTrigger>
          <TabsTrigger value="resolved">Resolved ({resolvedRows.length})</TabsTrigger>
        </TabsList>

        {['review', 'all', 'resolved'].map(tab => (
          <TabsContent key={tab} value={tab}>
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left text-xs font-medium">#</th>
                      <th className="px-3 py-2 text-left text-xs font-medium">Company/Name</th>
                      <th className="px-3 py-2 text-left text-xs font-medium">Client Match</th>
                      <th className="px-3 py-2 text-left text-xs font-medium">Product</th>
                      <th className="px-3 py-2 text-left text-xs font-medium">Owner</th>
                      <th className="px-3 py-2 text-left text-xs font-medium">Stage</th>
                      <th className="px-3 py-2 text-right text-xs font-medium">Value</th>
                      <th className="px-3 py-2 text-left text-xs font-medium">Status</th>
                      <th className="px-3 py-2 text-xs font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tab === 'review' ? needsReview : tab === 'resolved' ? resolvedRows : stagingRows).map(row => (
                      <tr key={row.id} className="border-b hover:bg-muted/30">
                        <td className="px-3 py-2 text-xs text-muted-foreground">{row.row_number}</td>
                        <td className="px-3 py-2 text-xs font-medium max-w-[150px] truncate">{row.raw_name}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            {getConfBadge(row.client_match_confidence)}
                            <span className="text-xs truncate max-w-[100px]">{row.matched_client?.name || '—'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            {getConfBadge(row.dataset_match_confidence)}
                            <span className="text-xs truncate max-w-[100px]">{row.matched_dataset?.name || row.raw_product || '—'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs">{row.raw_owner || '—'}</td>
                        <td className="px-3 py-2 text-xs">{row.normalized_stage || row.raw_stage || '—'}</td>
                        <td className="px-3 py-2 text-xs text-right font-mono">
                          {row.parsed_value_min || 0}–{row.parsed_value_max || 0}
                        </td>
                        <td className="px-3 py-2">
                          {row.resolution_status === 'resolved' && <Badge variant="default" className="text-[10px]">Resolved</Badge>}
                          {row.resolution_status === 'imported' && <Badge className="text-[10px] bg-success/10 text-success">Imported</Badge>}
                          {row.resolution_status === 'skipped' && <Badge variant="outline" className="text-[10px]">Skipped</Badge>}
                          {row.resolution_status === 'pending' && row.duplicate_status === 'likely_duplicate' && (
                            <Badge variant="secondary" className="text-[10px] bg-warning/10 text-warning">Duplicate?</Badge>
                          )}
                          {row.resolution_status === 'pending' && row.duplicate_status !== 'likely_duplicate' && (
                            <Badge variant="outline" className="text-[10px]">Pending</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {row.resolution_status === 'pending' && (
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => openResolve(row)}>
                                Resolve
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-muted-foreground" onClick={() => handleSkip(row.id)}>
                                Skip
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Warnings */}
      {stats.invalid > 0 && (
        <Card className="border-destructive/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-destructive mb-2">
              <XCircle size={14} />
              <span className="text-sm font-medium">{stats.invalid} rows have validation errors</span>
            </div>
            <p className="text-xs text-muted-foreground">These rows are missing required data and will be skipped unless resolved.</p>
          </CardContent>
        </Card>
      )}

      {/* Resolve Dialog */}
      <Dialog open={!!resolveDialog} onOpenChange={open => !open && setResolveDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Resolve: {resolveDialog?.row.raw_name}</DialogTitle>
          </DialogHeader>

          {resolveDialog && (
            <div className="space-y-4">
              {/* Warnings */}
              {resolveDialog.row.validation_warnings?.length > 0 && (
                <div className="p-3 bg-warning/10 rounded-lg">
                  {resolveDialog.row.validation_warnings.map((w: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-warning">
                      <AlertTriangle size={12} /> {w}
                    </div>
                  ))}
                </div>
              )}

              {/* Client */}
              <div className="space-y-2">
                <label className="text-xs font-medium">Client / Company</label>
                {!createNewClient ? (
                  <div className="flex gap-2">
                    <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Select client" /></SelectTrigger>
                      <SelectContent>
                        {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" onClick={() => setCreateNewClient(true)}>+ New</Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input value={newClientName} onChange={e => setNewClientName(e.target.value)} placeholder="New client name" />
                    <Button size="sm" variant="outline" onClick={() => setCreateNewClient(false)}>Cancel</Button>
                  </div>
                )}
              </div>

              {/* Dataset */}
              <div className="space-y-2">
                <label className="text-xs font-medium">Dataset / Product</label>
                {!createNewDataset ? (
                  <div className="flex gap-2">
                    <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Select dataset" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— None —</SelectItem>
                        {datasets.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" onClick={() => setCreateNewDataset(true)}>+ New</Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input value={newDatasetName} onChange={e => setNewDatasetName(e.target.value)} placeholder="New dataset name" />
                    <Button size="sm" variant="outline" onClick={() => setCreateNewDataset(false)}>Cancel</Button>
                  </div>
                )}
              </div>

              {/* Owner */}
              <div className="space-y-2">
                <label className="text-xs font-medium">Owner</label>
                <Select value={selectedOwnerId} onValueChange={setSelectedOwnerId}>
                  <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Unassigned —</SelectItem>
                    {profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Stage */}
              <div className="space-y-2">
                <label className="text-xs font-medium">Stage</label>
                <Select value={selectedStage} onValueChange={setSelectedStage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {stageOrder.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Raw data preview */}
              <div className="p-3 bg-muted/30 rounded-lg text-xs space-y-1">
                <p><span className="text-muted-foreground">Raw Stage:</span> {resolveDialog.row.raw_stage || '—'}</p>
                <p><span className="text-muted-foreground">Value:</span> {resolveDialog.row.raw_deal_value_min || '0'} – {resolveDialog.row.raw_deal_value_max || '0'}</p>
                <p><span className="text-muted-foreground">Source:</span> {resolveDialog.row.raw_source || '—'}</p>
                <p><span className="text-muted-foreground">Contacts:</span> {resolveDialog.row.raw_contacts || '—'}</p>
                <p><span className="text-muted-foreground">Comment:</span> {resolveDialog.row.raw_comment || '—'}</p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialog(null)}>Cancel</Button>
            <Button onClick={handleResolve} disabled={resolveRow.isPending}>
              {resolveRow.isPending ? 'Resolving...' : 'Resolve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
