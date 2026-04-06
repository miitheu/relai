import AppLayout from '@/components/AppLayout';
import { useContacts, useUpdateContact } from '@/hooks/useContacts';
import { useNavigate } from 'react-router-dom';
import { Users, Search, Mail, Phone, Building2, Pencil, X } from 'lucide-react';
import { useState } from 'react';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import { useToast } from '@/hooks/use-toast';

interface EditForm {
  id: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  linkedin: string;
  source: string;
  influence_level: string;
  relationship_strength: string;
  notes: string;
}

export default function ContactList() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: contacts = [], isLoading } = useContacts();
  const updateContact = useUpdateContact();
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [editing, setEditing] = useState<EditForm | null>(null);

  const sources = Array.from(new Set(contacts.map((c: any) => c.source).filter(Boolean))).sort();

  const filtered = contacts.filter((c: any) => {
    if (search) {
      const q = search.toLowerCase();
      const match =
        c.name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.title?.toLowerCase().includes(q) ||
        (c.clients as any)?.name?.toLowerCase().includes(q);
      if (!match) return false;
    }
    if (sourceFilter !== 'all' && c.source !== sourceFilter) return false;
    return true;
  });

  const openEdit = (c: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing({
      id: c.id,
      name: c.name || '',
      title: c.title || '',
      email: c.email || '',
      phone: c.phone || '',
      linkedin: c.linkedin || '',
      source: c.source || '',
      influence_level: c.influence_level || 'Unknown',
      relationship_strength: c.relationship_strength || 'Weak',
      notes: c.notes || '',
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      await updateContact.mutateAsync({
        id: editing.id,
        name: editing.name,
        title: editing.title || null,
        email: editing.email || null,
        phone: editing.phone || null,
        linkedin: editing.linkedin || null,
        source: editing.source || null,
        influence_level: editing.influence_level,
        relationship_strength: editing.relationship_strength,
        notes: editing.notes || null,
      });
      toast({ title: 'Contact updated' });
      setEditing(null);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  if (isLoading) return <AppLayout><LoadingState /></AppLayout>;

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="text-sm text-muted-foreground">{contacts.length} contacts in database</p>
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <form onSubmit={handleSave} onClick={e => e.stopPropagation()} className="data-card w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Edit Contact</h2>
              <button type="button" onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground block mb-1">Name *</label>
                <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} required className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Title</label>
                <input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Source</label>
                <input value={editing.source} onChange={e => setEditing({ ...editing, source: e.target.value })} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Email</label>
                <input type="email" value={editing.email} onChange={e => setEditing({ ...editing, email: e.target.value })} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Phone</label>
                <input value={editing.phone} onChange={e => setEditing({ ...editing, phone: e.target.value })} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">LinkedIn</label>
                <input value={editing.linkedin} onChange={e => setEditing({ ...editing, linkedin: e.target.value })} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="https://linkedin.com/in/..." />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Influence Level</label>
                <select value={editing.influence_level} onChange={e => setEditing({ ...editing, influence_level: e.target.value })} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm">
                  {['Unknown', 'Low', 'Medium', 'High', 'Champion'].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground block mb-1">Relationship Strength</label>
                <select value={editing.relationship_strength} onChange={e => setEditing({ ...editing, relationship_strength: e.target.value })} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm">
                  {['Weak', 'Developing', 'Strong', 'Champion'].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground block mb-1">Notes</label>
                <textarea value={editing.notes} onChange={e => setEditing({ ...editing, notes: e.target.value })} rows={3} className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button type="submit" disabled={updateContact.isPending} className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                {updateContact.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {contacts.length === 0 ? (
        <EmptyState icon={Users} title="No contacts yet" description="Import contacts to populate this list." />
      ) : (
        <>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by name, email, title or company..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            {sources.length > 0 && (
              <select
                value={sourceFilter}
                onChange={e => setSourceFilter(e.target.value)}
                className="bg-card border border-border rounded-md text-sm px-3 py-2"
              >
                <option value="all">All Sources</option>
                {sources.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}
          </div>

          <div className="data-card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Title</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Company</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Email</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Phone</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Source</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c: any) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/clients/${c.client_id}`)}
                    className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center">
                          <Users size={13} className="text-muted-foreground" />
                        </div>
                        <span className="font-medium">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.title || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Building2 size={12} />
                        <span>{(c.clients as any)?.name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {c.email ? (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Mail size={12} />
                          <span className="truncate max-w-[200px]">{c.email}</span>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {c.phone ? (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Phone size={12} />
                          <span>{c.phone}</span>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.source || '—'}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => openEdit(c, e)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit contact"
                      >
                        <Pencil size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">No contacts match your filters.</div>
            )}
          </div>
        </>
      )}
    </AppLayout>
  );
}
