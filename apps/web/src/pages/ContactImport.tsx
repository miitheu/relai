import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Upload, FileText, Building2, Users, CheckCircle, AlertTriangle, XCircle, ChevronRight, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { parseCSV, autoMapColumns, type ColumnMapping } from '@/lib/companyMatching';
import {
  useCreateImportBatch,
  useInsertStagingRows,
  useMatchCompanies,
  useStagingRows,
  useStagingStats,
  useImportBatch,
  useResolveCompany,
  useImportContacts,
  useUpdateStagingRow,
} from '@/hooks/useContactImport';
import { useClients, useCreateClient } from '@/hooks/useCrmData';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

type ImportStep = 'upload' | 'mapping' | 'matching' | 'review' | 'confirm' | 'complete';

const STEPS: { id: ImportStep; label: string; icon: React.ElementType }[] = [
  { id: 'upload', label: 'Upload', icon: Upload },
  { id: 'mapping', label: 'Map Columns', icon: FileText },
  { id: 'matching', label: 'Match Companies', icon: Building2 },
  { id: 'review', label: 'Review', icon: Users },
  { id: 'confirm', label: 'Import', icon: CheckCircle },
];

export default function ContactImport() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [step, setStep] = useState<ImportStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  
  const createBatch = useCreateImportBatch();
  const insertStagingRows = useInsertStagingRows();
  const matchCompanies = useMatchCompanies();
  const importContacts = useImportContacts();
  
  const { data: batch } = useImportBatch(batchId || undefined);
  const { data: stagingRows = [] } = useStagingRows(batchId || undefined);
  const { data: stats } = useStagingStats(batchId || undefined);
  const { data: clients = [] } = useClients();
  
  // Handle file upload
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    
    setFile(f);
    const text = await f.text();
    const parsed = parseCSV(text);
    setParsedData(parsed);
    
    // Auto-map columns
    const mapping = autoMapColumns(parsed.headers);
    setColumnMapping(mapping);
    
    setStep('mapping');
  }, []);
  
  // Proceed to matching
  const handleStartMatching = async () => {
    if (!parsedData || !columnMapping || !file) return;
    
    try {
      // Create batch
      const batch = await createBatch.mutateAsync({
        name: `Import ${new Date().toLocaleDateString()}`,
        file_name: file.name,
        total_rows: parsedData.rows.length,
      });
      setBatchId(batch.id);
      
      // Insert staging rows
      const stagingData = parsedData.rows.map((row, idx) => ({
        batch_id: batch.id,
        row_number: idx + 1,
        raw_name: columnMapping.name !== null ? row[columnMapping.name] || null : null,
        raw_company: columnMapping.company !== null ? row[columnMapping.company] || null : null,
        raw_organization_type: columnMapping.organizationType !== null ? row[columnMapping.organizationType] || null : null,
        raw_deals: columnMapping.deals !== null ? row[columnMapping.deals] || null : null,
        raw_contact_title: columnMapping.contactTitle !== null ? row[columnMapping.contactTitle] || null : null,
        raw_phone: columnMapping.phone !== null ? row[columnMapping.phone] || null : null,
        raw_email: columnMapping.email !== null ? row[columnMapping.email] || null : null,
        raw_people: columnMapping.people !== null ? row[columnMapping.people] || null : null,
        raw_source: columnMapping.source !== null ? row[columnMapping.source] || null : null,
      }));
      
      await insertStagingRows.mutateAsync(stagingData);
      
      setStep('matching');
      
      // Run matching
      await matchCompanies.mutateAsync(batch.id);
      
      setStep('review');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };
  
  // Final import
  const handleFinalImport = async () => {
    if (!batchId) return;
    
    try {
      setStep('confirm');
      const result = await importContacts.mutateAsync(batchId);
      toast({ title: 'Import Complete', description: `Imported ${result.imported} contacts, skipped ${result.skipped} duplicates.` });
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
            <h1 className="text-2xl font-bold">Contact Import</h1>
            <p className="text-sm text-muted-foreground">Import contacts with company resolution and deduplication</p>
          </div>
        </div>
        
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {STEPS.map((s, idx) => {
              const Icon = s.icon;
              const isActive = s.id === step;
              const isComplete = idx < currentStepIndex;
              const isDisabled = idx > currentStepIndex;
              
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
                  {idx < STEPS.length - 1 && (
                    <ChevronRight size={16} className="mx-2 text-muted-foreground" />
                  )}
                </div>
              );
            })}
          </div>
          <Progress value={progress} className="h-1" />
        </div>
        
        {/* Step Content */}
        {step === 'upload' && (
          <Card>
            <CardHeader>
              <CardTitle>Upload Contact File</CardTitle>
              <CardDescription>Upload a CSV file with contact data. The system will match companies before importing contacts.</CardDescription>
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
                  {['Name', 'Company', 'Organization Type', 'Deals', 'Contact Title/Function', 'Phone', 'Email', 'People', 'Source'].map(col => (
                    <Badge key={col} variant="secondary">{col}</Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
        {step === 'mapping' && parsedData && columnMapping && (
          <Card>
            <CardHeader>
              <CardTitle>Map Columns</CardTitle>
              <CardDescription>Verify the column mapping is correct. Found {parsedData.rows.length} rows.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-6">
                {Object.entries(columnMapping).map(([field, colIdx]) => (
                  <div key={field} className="flex items-center gap-3">
                    <span className="text-sm font-medium w-32 capitalize">{field.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <Select
                      value={colIdx?.toString() ?? 'unmapped'}
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
              
              {/* Preview */}
              <div className="border rounded-lg overflow-hidden">
                <div className="text-xs font-medium bg-muted px-3 py-2">Preview (first 3 rows)</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        {parsedData.headers.map((h, i) => (
                          <th key={i} className="px-3 py-2 text-left text-xs font-medium">{h}</th>
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
                <Button onClick={handleStartMatching} disabled={createBatch.isPending || insertStagingRows.isPending}>
                  {createBatch.isPending || insertStagingRows.isPending ? <><Loader2 className="animate-spin mr-2" size={14} /> Processing...</> : 'Continue to Matching'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        
        {step === 'matching' && (
          <Card>
            <CardHeader>
              <CardTitle>Matching Companies</CardTitle>
              <CardDescription>Analyzing company names and finding matches...</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center py-12">
              <Loader2 className="animate-spin text-primary mb-4" size={48} />
              <p className="text-sm text-muted-foreground">This may take a moment for large files.</p>
            </CardContent>
          </Card>
        )}
        
        {step === 'review' && stats && (
          <CompanyReviewStep 
            batchId={batchId!} 
            stats={stats} 
            stagingRows={stagingRows}
            clients={clients}
            onComplete={() => setStep('confirm')}
            onFinalImport={handleFinalImport}
          />
        )}
        
        {step === 'confirm' && (
          <Card>
            <CardHeader>
              <CardTitle>Importing Contacts</CardTitle>
              <CardDescription>Creating contact records...</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center py-12">
              <Loader2 className="animate-spin text-primary mb-4" size={48} />
              <p className="text-sm text-muted-foreground">Please wait while contacts are imported.</p>
            </CardContent>
          </Card>
        )}
        
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
                  <p className="text-2xl font-bold text-success">{stats.byResolution.imported}</p>
                  <p className="text-xs text-muted-foreground">Contacts Imported</p>
                </div>
                <div className="p-4 bg-warning/10 rounded-lg text-center">
                  <p className="text-2xl font-bold text-warning">{stats.byResolution.skipped}</p>
                  <p className="text-xs text-muted-foreground">Duplicates Skipped</p>
                </div>
                <div className="p-4 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total Rows</p>
                </div>
              </div>
              <div className="flex justify-center gap-3">
                <Button variant="outline" onClick={() => navigate('/clients')}>View Clients</Button>
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
// COMPANY REVIEW STEP COMPONENT
// ============================================================

function CompanyReviewStep({ 
  batchId, 
  stats, 
  stagingRows,
  clients,
  onComplete,
  onFinalImport,
}: { 
  batchId: string; 
  stats: any; 
  stagingRows: any[];
  clients: any[];
  onComplete: () => void;
  onFinalImport: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'ambiguous' | 'new' | 'all'>('ambiguous');
  const [resolveDialog, setResolveDialog] = useState<{ row: any } | null>(null);
  const [newClientName, setNewClientName] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const queryClient = useQueryClient();
  const resolveCompany = useResolveCompany();
  const updateRow = useUpdateStagingRow();
  
  const ambiguousRows = stagingRows.filter(r => r.company_match_confidence === 'ambiguous' && r.resolution_status === 'pending');
  const newRows = stagingRows.filter(r => r.company_match_confidence === 'new' && r.resolution_status === 'pending');
  const resolvedRows = stagingRows.filter(r => r.resolution_status === 'resolved');
  const pendingRows = stagingRows.filter(r => r.resolution_status === 'pending');
  
  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  ).slice(0, 10);
  
  const handleResolve = async (action: 'accept' | 'select' | 'create' | 'skip') => {
    if (!resolveDialog) return;
    
    try {
      if (action === 'skip') {
        await updateRow.mutateAsync({
          id: resolveDialog.row.id,
          resolution_status: 'skipped',
        });
      } else if (action === 'accept') {
        await resolveCompany.mutateAsync({
          stagingRowId: resolveDialog.row.id,
          clientId: resolveDialog.row.matched_client_id,
        });
      } else if (action === 'select' && selectedClientId) {
        await resolveCompany.mutateAsync({
          stagingRowId: resolveDialog.row.id,
          clientId: selectedClientId,
        });
      } else if (action === 'create') {
        await resolveCompany.mutateAsync({
          stagingRowId: resolveDialog.row.id,
          createNew: true,
          newClientData: { name: newClientName || resolveDialog.row.raw_company },
        });
      }
      
      setResolveDialog(null);
      setSelectedClientId('');
      setNewClientName('');
      setSearchQuery('');
    } catch (err: any) {
      console.error(err);
    }
  };
  
  const handleBulkAccept = async (rows: any[]) => {
    for (const row of rows) {
      if (row.matched_client_id) {
        await resolveCompany.mutateAsync({
          stagingRowId: row.id,
          clientId: row.matched_client_id,
        });
      }
    }
  };
  
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);

  const handleBulkCreateNew = async (rows: any[]) => {
    // Group rows by normalized company name to avoid creating duplicate clients
    const byCompany = new Map<string, any[]>();
    for (const row of rows) {
      const key = (row.raw_company || '').trim().toLowerCase();
      if (!key) continue;
      if (!byCompany.has(key)) byCompany.set(key, []);
      byCompany.get(key)!.push(row);
    }

    const groups = Array.from(byCompany.values());
    setBulkProgress({ current: 0, total: groups.length });
    let completed = 0;

    for (const group of groups) {
      try {
        const first = group[0];
        const result = await resolveCompany.mutateAsync({
          stagingRowId: first.id,
          createNew: true,
          newClientData: { name: first.raw_company },
        });

        // Link remaining rows in this group to the same newly created client
        for (let i = 1; i < group.length; i++) {
          try {
            await resolveCompany.mutateAsync({
              stagingRowId: group[i].id,
              clientId: result.resolved_client_id!,
            });
          } catch (e) {
            console.error('Failed to link row', group[i].id, e);
          }
        }
      } catch (e) {
        console.error('Failed to create company for group', group[0]?.raw_company, e);
      }
      completed++;
      setBulkProgress({ current: completed, total: groups.length });
    }

    setBulkProgress(null);
    // Refetch staging rows to reflect all changes
    queryClient.invalidateQueries({ queryKey: ['staging-rows'] });
  };
  
  const canProceed = pendingRows.length === 0;
  
  return (
    <>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Company Resolution</CardTitle>
          <CardDescription>Review and resolve company matches before importing contacts.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Stats */}
          <div className="grid grid-cols-5 gap-3 mb-6">
            <div className="p-3 bg-success/10 rounded-lg text-center">
              <p className="text-xl font-bold text-success">{stats.byConfidence.exact}</p>
              <p className="text-[10px] text-muted-foreground">Exact Match</p>
            </div>
            <div className="p-3 bg-info/10 rounded-lg text-center">
              <p className="text-xl font-bold text-info">{stats.byConfidence.likely}</p>
              <p className="text-[10px] text-muted-foreground">Likely Match</p>
            </div>
            <div className="p-3 bg-warning/10 rounded-lg text-center">
              <p className="text-xl font-bold text-warning">{stats.byConfidence.ambiguous}</p>
              <p className="text-[10px] text-muted-foreground">Ambiguous</p>
            </div>
            <div className="p-3 bg-muted rounded-lg text-center">
              <p className="text-xl font-bold">{stats.byConfidence.new}</p>
              <p className="text-[10px] text-muted-foreground">New Companies</p>
            </div>
            <div className="p-3 bg-primary/10 rounded-lg text-center">
              <p className="text-xl font-bold text-primary">{resolvedRows.length}</p>
              <p className="text-[10px] text-muted-foreground">Resolved</p>
            </div>
          </div>
          
          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <div className="flex items-center justify-between mb-4">
              <TabsList>
                <TabsTrigger value="ambiguous" className="gap-1">
                  <AlertTriangle size={12} /> Ambiguous ({ambiguousRows.length})
                </TabsTrigger>
                <TabsTrigger value="new" className="gap-1">
                  <Building2 size={12} /> New ({newRows.length})
                </TabsTrigger>
                <TabsTrigger value="all">All ({stagingRows.length})</TabsTrigger>
              </TabsList>
              
              <div className="flex gap-2">
                {activeTab === 'ambiguous' && ambiguousRows.length > 0 && ambiguousRows.every(r => r.matched_client_id) && (
                  <Button size="sm" variant="outline" onClick={() => handleBulkAccept(ambiguousRows)}>
                    Accept All Matches
                  </Button>
                )}
                {activeTab === 'new' && newRows.length > 0 && (
                  <Button size="sm" variant="outline" onClick={() => handleBulkCreateNew(newRows)} disabled={!!bulkProgress}>
                    {bulkProgress ? (
                      <><Loader2 className="h-3 w-3 animate-spin mr-1" /> {bulkProgress.current}/{bulkProgress.total} companies</>
                    ) : (
                      'Create All as New'
                    )}
                  </Button>
                )}
              </div>
            </div>
            
            <TabsContent value="ambiguous" className="space-y-2">
              {ambiguousRows.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No ambiguous matches to review.</p>
              ) : (
                ambiguousRows.map(row => (
                  <ReviewRow key={row.id} row={row} onResolve={() => setResolveDialog({ row })} />
                ))
              )}
            </TabsContent>
            
            <TabsContent value="new" className="space-y-2">
              {newRows.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No new companies to review.</p>
              ) : (
                newRows.map(row => (
                  <ReviewRow key={row.id} row={row} onResolve={() => setResolveDialog({ row })} />
                ))
              )}
            </TabsContent>
            
            <TabsContent value="all" className="space-y-2 max-h-96 overflow-y-auto">
              {stagingRows.map(row => (
                <ReviewRow key={row.id} row={row} onResolve={() => setResolveDialog({ row })} />
              ))}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      
      {/* Import Button */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" disabled>Back</Button>
        <Button onClick={onFinalImport} disabled={!canProceed}>
          {canProceed ? `Import ${resolvedRows.length} Contacts` : `${pendingRows.length} Pending Resolution`}
        </Button>
      </div>
      
      {/* Resolve Dialog */}
      <Dialog open={!!resolveDialog} onOpenChange={() => setResolveDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Resolve Company</DialogTitle>
          </DialogHeader>
          
          {resolveDialog && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Imported company name</p>
                <p className="font-medium">{resolveDialog.row.raw_company}</p>
                <p className="text-xs text-muted-foreground mt-1">Contact: {resolveDialog.row.raw_name} ({resolveDialog.row.raw_email})</p>
              </div>
              
              {resolveDialog.row.matched_client && (
                <div className="p-3 border rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Suggested match ({resolveDialog.row.company_match_confidence})</p>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{resolveDialog.row.matched_client.name}</span>
                    <Button size="sm" onClick={() => handleResolve('accept')}>Accept Match</Button>
                  </div>
                </div>
              )}
              
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-2">Or select existing company</p>
                <Input
                  placeholder="Search companies..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="mb-2"
                />
                {searchQuery && (
                  <div className="border rounded-lg max-h-40 overflow-y-auto">
                    {filteredClients.map(c => (
                      <div
                        key={c.id}
                        onClick={() => setSelectedClientId(c.id)}
                        className={`px-3 py-2 text-sm cursor-pointer hover:bg-muted ${selectedClientId === c.id ? 'bg-primary/10' : ''}`}
                      >
                        {c.name}
                      </div>
                    ))}
                    {filteredClients.length === 0 && (
                      <p className="px-3 py-2 text-sm text-muted-foreground">No matches found</p>
                    )}
                  </div>
                )}
                {selectedClientId && (
                  <Button size="sm" className="mt-2" onClick={() => handleResolve('select')}>
                    Use Selected Company
                  </Button>
                )}
              </div>
              
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-2">Or create new company</p>
                <Input
                  placeholder={resolveDialog.row.raw_company || 'Company name'}
                  value={newClientName}
                  onChange={e => setNewClientName(e.target.value)}
                />
                <Button size="sm" className="mt-2" onClick={() => handleResolve('create')}>
                  Create New Company
                </Button>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="ghost" onClick={() => handleResolve('skip')}>Skip This Row</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReviewRow({ row, onResolve }: { row: any; onResolve: () => void }) {
  const confidenceColors: Record<string, string> = {
    exact: 'bg-success/10 text-success',
    likely: 'bg-info/10 text-info',
    ambiguous: 'bg-warning/10 text-warning',
    new: 'bg-muted text-muted-foreground',
  };
  
  const statusColors: Record<string, string> = {
    pending: 'bg-muted text-muted-foreground',
    resolved: 'bg-success/10 text-success',
    skipped: 'bg-muted text-muted-foreground',
    imported: 'bg-primary/10 text-primary',
  };
  
  return (
    <div className="flex items-center gap-3 p-3 border rounded-lg">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{row.raw_company || '(no company)'}</span>
          <Badge variant="secondary" className={confidenceColors[row.company_match_confidence] || ''}>
            {row.company_match_confidence}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {row.raw_name} · {row.raw_email}
          {row.matched_client && <> → <span className="text-foreground">{row.matched_client.name}</span></>}
          {row.resolved_client && <> → <span className="text-success">{row.resolved_client.name}</span></>}
        </p>
      </div>
      <Badge className={statusColors[row.resolution_status] || ''}>{row.resolution_status}</Badge>
      {row.resolution_status === 'pending' && (
        <Button size="sm" variant="outline" onClick={onResolve}>Resolve</Button>
      )}
    </div>
  );
}
