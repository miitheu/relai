import { useState } from 'react';
import { useEmailTemplates, useCreateEmailTemplate, useUpdateEmailTemplate, useDeleteEmailTemplate, EmailTemplate } from '@/hooks/useEmailTemplates';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Search, Plus, Mail, Trash2, Database } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useDatasets } from '@/hooks/useDatasets';

const categories = ['sample_email', 'outreach', 'follow_up', 'renewal', 'onboarding', 'support', 'marketing', 'internal'];

const categoryColors: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  sample_email: 'default',
  outreach: 'default',
  follow_up: 'secondary',
  renewal: 'outline',
  onboarding: 'default',
  support: 'secondary',
  marketing: 'outline',
  internal: 'secondary',
};

const categoryLabels: Record<string, string> = {
  sample_email: 'Sample Email (AI Reference)',
  outreach: 'Outreach',
  follow_up: 'Follow Up',
  renewal: 'Renewal',
  onboarding: 'Onboarding',
  support: 'Support',
  marketing: 'Marketing',
  internal: 'Internal',
};

export default function EmailTemplatesTab() {
  const { data: templates, isLoading } = useEmailTemplates();
  const createTemplate = useCreateEmailTemplate();
  const updateTemplate = useUpdateEmailTemplate();
  const deleteTemplate = useDeleteEmailTemplate();
  const { toast } = useToast();
  const { data: datasets = [] } = useDatasets();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [form, setForm] = useState({ name: '', subject: '', body: '', category: 'outreach', variables: '', datasetIds: [] as string[] });
  const [editForm, setEditForm] = useState({ name: '', subject: '', body: '', category: '', variables: '', datasetIds: [] as string[] });

  const filtered = (templates || []).filter(t => {
    if (search) {
      const q = search.toLowerCase();
      if (!t.name.toLowerCase().includes(q) && !t.subject.toLowerCase().includes(q)) return false;
    }
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
    return true;
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const vars = form.variables.trim()
        ? form.variables.split(',').map(v => v.trim()).filter(Boolean)
        : undefined;
      await createTemplate.mutateAsync({
        name: form.name.trim(),
        subject: form.subject.trim(),
        body: form.body,
        category: form.category,
        variables: vars,
        dataset_ids: form.datasetIds.length > 0 ? form.datasetIds : undefined,
        is_active: true,
      });
      toast({ title: 'Template created', description: `${form.name} has been added.` });
      setForm({ name: '', subject: '', body: '', category: 'outreach', variables: '', datasetIds: [] });
      setShowCreate(false);
    } catch (err: any) {
      toast({ title: 'Error creating template', description: err.message, variant: 'destructive' });
    }
  };

  const openEdit = (t: EmailTemplate) => {
    setEditForm({
      name: t.name,
      subject: t.subject,
      body: t.body,
      category: t.category || 'outreach',
      variables: (t.variables || []).join(', '),
      datasetIds: t.dataset_ids || [],
    });
    setEditing(t);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      const vars = editForm.variables.trim()
        ? editForm.variables.split(',').map(v => v.trim()).filter(Boolean)
        : undefined;
      await updateTemplate.mutateAsync({
        id: editing.id,
        name: editForm.name.trim(),
        subject: editForm.subject.trim(),
        body: editForm.body,
        category: editForm.category,
        variables: vars,
        dataset_ids: editForm.datasetIds,
      });
      toast({ title: 'Template updated' });
      setEditing(null);
    } catch (err: any) {
      toast({ title: 'Error updating template', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate.mutateAsync(id);
      toast({ title: 'Template deleted' });
      setEditing(null);
    } catch (err: any) {
      toast({ title: 'Error deleting template', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[150px] h-9 text-sm">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map(c => (
              <SelectItem key={c} value={c}>{categoryLabels[c] || c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setShowCreate(true)} className="ml-auto">
          <Plus size={14} /> New Template
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Loading templates...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Mail size={32} className="mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            {search || categoryFilter !== 'all' ? 'No templates match your filters' : 'No email templates yet'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(t => (
            <div
              key={t.id}
              onClick={() => openEdit(t)}
              className="border rounded-lg p-4 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors space-y-2"
            >
              <div className="flex items-start justify-between">
                <h4 className="text-sm font-medium truncate flex-1">{t.name}</h4>
                {t.category && (
                  <Badge variant={categoryColors[t.category] || 'outline'} className="text-[10px] ml-2">
                    {categoryLabels[t.category] || t.category}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">{t.subject}</p>
              {t.variables && t.variables.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {t.variables.slice(0, 3).map(v => (
                    <span key={v} className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded font-mono">{`{{${v}}}`}</span>
                  ))}
                  {t.variables.length > 3 && (
                    <span className="text-[10px] text-muted-foreground">+{t.variables.length - 3} more</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Template Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Email Template</DialogTitle>
            <DialogDescription>Add a new reusable email template with variable placeholders.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Template Name *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
                placeholder="e.g. Welcome Onboarding"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Category *</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c} value={c}>{categoryLabels[c] || c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Variables (comma-separated)</Label>
                <Input
                  value={form.variables}
                  onChange={e => setForm(f => ({ ...f, variables: e.target.value }))}
                  placeholder="name, company, date"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Subject *</Label>
              <Input
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                required
                placeholder="e.g. Welcome to {{company}}!"
              />
            </div>
            <div className="space-y-2">
              <Label>Body *</Label>
              <Textarea
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                required
                rows={8}
                placeholder="Hi {{name}},&#10;&#10;Welcome aboard..."
              />
            </div>
            {form.category === 'sample_email' && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><Database size={12} /> Tag Products</Label>
                <p className="text-[11px] text-muted-foreground">Select which products this sample email relates to. The AI will use it as a style reference when drafting for these products.</p>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {datasets.filter((d: any) => d.is_active).map((d: any) => (
                    <label key={d.id} className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-colors ${form.datasetIds.includes(d.id) ? 'bg-primary/10 border-primary text-primary' : 'border-border hover:border-primary/50'}`}>
                      <input type="checkbox" className="sr-only" checked={form.datasetIds.includes(d.id)}
                        onChange={e => setForm(f => ({ ...f, datasetIds: e.target.checked ? [...f.datasetIds, d.id] : f.datasetIds.filter(id => id !== d.id) }))} />
                      {d.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={createTemplate.isPending}>
                {createTemplate.isPending ? 'Creating...' : 'Create Template'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Template Sheet */}
      <Sheet open={!!editing} onOpenChange={open => { if (!open) setEditing(null); }}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Template</SheetTitle>
          </SheetHeader>
          {editing && (
            <form onSubmit={handleUpdate} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Template Name *</Label>
                <Input
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={editForm.category} onValueChange={v => setEditForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.map(c => (
                        <SelectItem key={c} value={c}>{categoryLabels[c] || c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Variables</Label>
                  <Input
                    value={editForm.variables}
                    onChange={e => setEditForm(f => ({ ...f, variables: e.target.value }))}
                    placeholder="name, company, date"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Subject *</Label>
                <Input
                  value={editForm.subject}
                  onChange={e => setEditForm(f => ({ ...f, subject: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Body *</Label>
                <Textarea
                  value={editForm.body}
                  onChange={e => setEditForm(f => ({ ...f, body: e.target.value }))}
                  required
                  rows={12}
                />
              </div>
              {editForm.category === 'sample_email' && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Database size={12} /> Tag Products</Label>
                  <p className="text-[11px] text-muted-foreground">Select which products this sample email relates to.</p>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                    {datasets.filter((d: any) => d.is_active).map((d: any) => (
                      <label key={d.id} className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-colors ${editForm.datasetIds.includes(d.id) ? 'bg-primary/10 border-primary text-primary' : 'border-border hover:border-primary/50'}`}>
                        <input type="checkbox" className="sr-only" checked={editForm.datasetIds.includes(d.id)}
                          onChange={e => setEditForm(f => ({ ...f, datasetIds: e.target.checked ? [...f.datasetIds, d.id] : f.datasetIds.filter(id => id !== d.id) }))} />
                        {d.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Button type="submit" disabled={updateTemplate.isPending}>
                  {updateTemplate.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(editing.id)}
                >
                  <Trash2 size={13} className="mr-1" /> Delete
                </Button>
              </div>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
