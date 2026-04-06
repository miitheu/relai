import { useState } from 'react';
import { useIntegrations, useCreateIntegration, useUpdateIntegration, useSyncLog, Integration } from '@/hooks/useIntegrations';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Search, Plus, Plug, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import GmailIntegrationCard from './GmailIntegrationCard';

const integrationTypes = ['crm', 'email', 'calendar', 'data_provider', 'analytics', 'storage', 'webhook', 'custom'];

const statusBadge: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active: 'default',
  inactive: 'secondary',
  error: 'destructive',
  pending: 'outline',
};

export default function IntegrationsTab() {
  const { data: integrations, isLoading } = useIntegrations();
  const createIntegration = useCreateIntegration();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', type: 'crm', config: '' });

  const filtered = (integrations || []).filter(i => {
    if (search) {
      const q = search.toLowerCase();
      if (!i.name.toLowerCase().includes(q) && !i.type.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let config: Record<string, any> | undefined;
      if (form.config.trim()) {
        config = JSON.parse(form.config);
      }
      await createIntegration.mutateAsync({
        name: form.name.trim(),
        type: form.type,
        config,
        status: 'inactive',
      });
      toast({ title: 'Integration created', description: `${form.name} has been added.` });
      setForm({ name: '', type: 'crm', config: '' });
      setShowCreate(false);
    } catch (err: any) {
      toast({ title: 'Error creating integration', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <GmailIntegrationCard />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search integrations..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} className="ml-auto">
          <Plus size={14} /> New Integration
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Loading integrations...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Plug size={32} className="mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            {search ? 'No integrations match your search' : 'No integrations configured'}
          </p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Sync</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(integration => (
                <IntegrationRow
                  key={integration.id}
                  integration={integration}
                  expanded={expandedId === integration.id}
                  onToggle={() => setExpandedId(expandedId === integration.id ? null : integration.id)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Integration Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Integration</DialogTitle>
            <DialogDescription>Configure a new external integration for data syncing.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Integration Name *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
                placeholder="e.g. Salesforce CRM Sync"
              />
            </div>
            <div className="space-y-2">
              <Label>Type *</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {integrationTypes.map(t => (
                    <SelectItem key={t} value={t}>{t.replace('_', ' ').charAt(0).toUpperCase() + t.replace('_', ' ').slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Configuration (JSON, optional)</Label>
              <Textarea
                value={form.config}
                onChange={e => setForm(f => ({ ...f, config: e.target.value }))}
                placeholder='{"api_key": "...", "base_url": "..."}'
                rows={4}
                className="font-mono text-xs"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={createIntegration.isPending}>
                {createIntegration.isPending ? 'Creating...' : 'Create Integration'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IntegrationRow({
  integration,
  expanded,
  onToggle,
}: {
  integration: Integration;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { data: syncLogs } = useSyncLog(expanded ? integration.id : undefined);

  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </TableCell>
        <TableCell className="font-medium">{integration.name}</TableCell>
        <TableCell>
          <Badge variant="secondary" className="text-xs capitalize">{integration.type.replace('_', ' ')}</Badge>
        </TableCell>
        <TableCell>
          <Badge variant={statusBadge[integration.status] || 'outline'} className="text-xs capitalize">
            {integration.status}
          </Badge>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {integration.last_sync_at
            ? format(new Date(integration.last_sync_at), 'MMM d, yyyy HH:mm')
            : 'Never'}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {format(new Date(integration.created_at), 'MMM d, yyyy')}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/30 p-4">
            <div className="space-y-3">
              {/* Config */}
              {integration.config && (
                <div>
                  <h4 className="text-xs font-medium mb-1">Configuration</h4>
                  <pre className="text-xs bg-background border rounded p-2 overflow-auto max-h-24 font-mono">
                    {JSON.stringify(integration.config, null, 2)}
                  </pre>
                </div>
              )}

              {/* Sync Log */}
              <div>
                <h4 className="text-xs font-medium mb-1">Sync History</h4>
                {syncLogs && syncLogs.length > 0 ? (
                  <div className="space-y-1">
                    {syncLogs.slice(0, 5).map(log => (
                      <div key={log.id} className="flex items-center gap-2 text-xs p-2 bg-background border rounded">
                        <RefreshCw size={12} className={log.status === 'success' ? 'text-emerald-500' : 'text-destructive'} />
                        <Badge variant={log.status === 'success' ? 'default' : 'destructive'} className="text-[10px]">
                          {log.status}
                        </Badge>
                        {log.records_synced != null && (
                          <span className="text-muted-foreground">{log.records_synced} records</span>
                        )}
                        {log.error_message && (
                          <span className="text-destructive truncate max-w-[200px]">{log.error_message}</span>
                        )}
                        <span className="ml-auto text-muted-foreground">
                          {format(new Date(log.started_at), 'MMM d HH:mm')}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No sync history</p>
                )}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
