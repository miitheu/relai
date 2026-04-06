import { useState } from 'react';
import { useWorkflowRules, useCreateWorkflowRule, useUpdateWorkflowRule, useDeleteWorkflowRule, useWorkflowActions, useWorkflowExecutionLog, WorkflowRule } from '@/hooks/useWorkflows';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Search, Plus, Workflow, ChevronDown, ChevronRight, Zap, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

const entityTypes = ['client', 'opportunity', 'contact', 'delivery', 'renewal'];
const triggerEvents = ['created', 'updated', 'stage_changed', 'status_changed', 'assigned', 'deleted'];

export default function WorkflowsTab() {
  const { data: rules, isLoading } = useWorkflowRules();
  const createRule = useCreateWorkflowRule();
  const updateRule = useUpdateWorkflowRule();
  const deleteRule = useDeleteWorkflowRule();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', entity_type: 'client', trigger_event: 'created', conditions: '' });

  const filtered = (rules || []).filter(r => {
    if (search) {
      const q = search.toLowerCase();
      if (!r.name.toLowerCase().includes(q)) return false;
    }
    if (entityFilter !== 'all' && r.entity_type !== entityFilter) return false;
    return true;
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let conditions: Record<string, any> | undefined;
      if (form.conditions.trim()) {
        conditions = JSON.parse(form.conditions);
      }
      await createRule.mutateAsync({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        entity_type: form.entity_type,
        trigger_event: form.trigger_event,
        conditions,
        is_active: true,
      });
      toast({ title: 'Workflow rule created', description: `${form.name} has been added.` });
      setForm({ name: '', description: '', entity_type: 'client', trigger_event: 'created', conditions: '' });
      setShowCreate(false);
    } catch (err: any) {
      toast({ title: 'Error creating rule', description: err.message, variant: 'destructive' });
    }
  };

  const handleToggleActive = async (rule: WorkflowRule) => {
    try {
      await updateRule.mutateAsync({ id: rule.id, is_active: !rule.is_active });
      toast({ title: rule.is_active ? 'Rule deactivated' : 'Rule activated' });
    } catch (err: any) {
      toast({ title: 'Error updating rule', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (rule: WorkflowRule) => {
    try {
      await deleteRule.mutateAsync(rule.id);
      toast({ title: 'Rule deleted' });
    } catch (err: any) {
      toast({ title: 'Error deleting rule', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search workflow rules..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-[150px] h-9 text-sm">
            <SelectValue placeholder="Entity type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            {entityTypes.map(t => (
              <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setShowCreate(true)} className="ml-auto">
          <Plus size={14} /> New Rule
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Loading workflow rules...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Workflow size={32} className="mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            {search || entityFilter !== 'all' ? 'No rules match your filters' : 'No workflow rules configured'}
          </p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Rule Name</TableHead>
                <TableHead>Entity Type</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(rule => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  expanded={expandedRule === rule.id}
                  onToggleExpand={() => setExpandedRule(expandedRule === rule.id ? null : rule.id)}
                  onToggleActive={() => handleToggleActive(rule)}
                  onDelete={() => handleDelete(rule)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Rule Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Workflow Rule</DialogTitle>
            <DialogDescription>Define a new automation rule that triggers on entity events.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Rule Name *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
                placeholder="e.g. Notify on deal stage change"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="What does this rule do?"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Entity Type *</Label>
                <Select value={form.entity_type} onValueChange={v => setForm(f => ({ ...f, entity_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {entityTypes.map(t => (
                      <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Trigger Event *</Label>
                <Select value={form.trigger_event} onValueChange={v => setForm(f => ({ ...f, trigger_event: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {triggerEvents.map(t => (
                      <SelectItem key={t} value={t}>{t.replace('_', ' ').charAt(0).toUpperCase() + t.replace('_', ' ').slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Conditions (JSON, optional)</Label>
              <Textarea
                value={form.conditions}
                onChange={e => setForm(f => ({ ...f, conditions: e.target.value }))}
                placeholder='{"field": "stage", "equals": "Closed Won"}'
                rows={3}
                className="font-mono text-xs"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={createRule.isPending}>
                {createRule.isPending ? 'Creating...' : 'Create Rule'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RuleRow({
  rule,
  expanded,
  onToggleExpand,
  onToggleActive,
  onDelete,
}: {
  rule: WorkflowRule;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const { data: actions } = useWorkflowActions(expanded ? rule.id : undefined);
  const { data: logs } = useWorkflowExecutionLog(expanded ? rule.id : undefined);

  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggleExpand}>
        <TableCell>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </TableCell>
        <TableCell className="font-medium">{rule.name}</TableCell>
        <TableCell>
          <Badge variant="secondary" className="text-xs capitalize">{rule.entity_type}</Badge>
        </TableCell>
        <TableCell className="text-sm capitalize">{rule.trigger_event.replace('_', ' ')}</TableCell>
        <TableCell>
          <span className={`inline-flex items-center gap-1.5 text-xs ${rule.is_active ? 'text-emerald-600' : 'text-muted-foreground'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${rule.is_active ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
            {rule.is_active ? 'Active' : 'Inactive'}
          </span>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">{format(new Date(rule.created_at), 'MMM d, yyyy')}</TableCell>
        <TableCell>
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <Switch checked={rule.is_active} onCheckedChange={onToggleActive} />
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={onDelete}>
              <Trash2 size={13} />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/30 p-4">
            <div className="space-y-4">
              {rule.description && (
                <p className="text-sm text-muted-foreground">{rule.description}</p>
              )}

              {/* Conditions */}
              {rule.conditions && (
                <div>
                  <h4 className="text-xs font-medium mb-1">Conditions</h4>
                  <pre className="text-xs bg-background border rounded p-2 overflow-auto max-h-32 font-mono">
                    {JSON.stringify(rule.conditions, null, 2)}
                  </pre>
                </div>
              )}

              {/* Actions */}
              <div>
                <h4 className="text-xs font-medium mb-1">Actions ({actions?.length || 0})</h4>
                {actions && actions.length > 0 ? (
                  <div className="space-y-1">
                    {actions.map(a => (
                      <div key={a.id} className="flex items-center gap-2 text-xs p-2 bg-background border rounded">
                        <Zap size={12} className="text-primary" />
                        <span className="font-medium capitalize">{a.action_type.replace('_', ' ')}</span>
                        {a.action_config && (
                          <span className="text-muted-foreground truncate max-w-[300px]">
                            {JSON.stringify(a.action_config)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No actions configured</p>
                )}
              </div>

              {/* Recent Executions */}
              <div>
                <h4 className="text-xs font-medium mb-1">Recent Executions</h4>
                {logs && logs.length > 0 ? (
                  <div className="space-y-1">
                    {logs.slice(0, 5).map(l => (
                      <div key={l.id} className="flex items-center gap-2 text-xs p-2 bg-background border rounded">
                        <Badge variant={l.status === 'success' ? 'default' : 'destructive'} className="text-[10px]">
                          {l.status}
                        </Badge>
                        <span className="text-muted-foreground">{l.entity_type} {l.entity_id.slice(0, 8)}</span>
                        <span className="ml-auto text-muted-foreground">{format(new Date(l.executed_at), 'MMM d HH:mm')}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No executions yet</p>
                )}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
