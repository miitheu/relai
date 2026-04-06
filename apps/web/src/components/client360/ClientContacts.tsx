import { useState, useMemo } from 'react';
import { Plus, Search, Mail, Phone, Linkedin, MoreVertical, X, Check } from 'lucide-react';
import { useCreateContact } from '@/hooks/useCrmData';
import { useUpdateContact } from '@/hooks/useContacts';
import { useEmails } from '@/hooks/useGmailIntegration';
import { useToast } from '@/hooks/use-toast';
import { differenceInDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ClientContactsProps {
  clientId: string;
  contacts: any[];
}

export default function ClientContacts({ clientId, contacts }: ClientContactsProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [formData, setFormData] = useState({
    name: '',
    title: '',
    email: '',
    phone: '',
    linkedin: '',
    influence_level: 'Unknown',
    relationship_strength: 'Weak',
  });

  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const { data: clientEmails = [] } = useEmails({ client_id: clientId });

  // Build map of contact_id → last email info
  const contactEmailStatus = useMemo(() => {
    const map = new Map<string, { date: string; daysAgo: number }>();
    for (const email of clientEmails) {
      if (!email.contact_id) continue;
      const existing = map.get(email.contact_id);
      if (!existing || new Date(email.email_date) > new Date(existing.date)) {
        map.set(email.contact_id, {
          date: email.email_date,
          daysAgo: differenceInDays(new Date(), new Date(email.email_date)),
        });
      }
    }
    return map;
  }, [clientEmails]);

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const startEdit = (contact: any) => {
    setEditingId(contact.id);
    setEditData({
      name: contact.name || '',
      title: contact.title || '',
      email: contact.email || '',
      phone: contact.phone || '',
      linkedin: contact.linkedin || '',
      influence_level: contact.influence_level || 'Unknown',
      relationship_strength: contact.relationship_strength || 'Weak',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      await updateContact.mutateAsync({ id: editingId, ...editData });
      toast({ title: 'Contact updated' });
      setEditingId(null);
      setEditData({});
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createContact.mutateAsync({
        client_id: clientId,
        ...formData,
      });
      toast({ title: 'Contact created' });
      setShowAddForm(false);
      setFormData({ name: '', title: '', email: '', phone: '', linkedin: '', influence_level: 'Unknown', relationship_strength: 'Weak' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const influenceColors: Record<string, string> = {
    'Decision Maker': 'bg-primary/10 text-primary',
    'Influencer': 'bg-info/10 text-info',
    'Champion': 'bg-success/10 text-success',
    'User': 'bg-muted text-muted-foreground',
    'Procurement': 'bg-warning/10 text-warning',
    'Unknown': 'bg-muted text-muted-foreground',
  };

  const strengthColors: Record<string, string> = {
    'Strong': 'bg-success/10 text-success',
    'Medium': 'bg-warning/10 text-warning',
    'Weak': 'bg-muted text-muted-foreground',
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>
        <Button size="sm" onClick={() => setShowAddForm(true)}>
          <Plus size={14} className="mr-1" /> Add Contact
        </Button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className="data-card mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Full name *" required />
            <Input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="Title / Role" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="Email" />
            <Input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="Phone" />
            <Input value={formData.linkedin} onChange={e => setFormData({ ...formData, linkedin: e.target.value })} placeholder="LinkedIn URL" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select value={formData.influence_level} onChange={e => setFormData({ ...formData, influence_level: e.target.value })} className="px-3 py-2 bg-muted border border-border rounded-md text-sm">
              <option value="Unknown">Influence: Unknown</option>
              <option value="Decision Maker">Decision Maker</option>
              <option value="Influencer">Influencer</option>
              <option value="Champion">Champion</option>
              <option value="User">User</option>
              <option value="Procurement">Procurement</option>
            </select>
            <select value={formData.relationship_strength} onChange={e => setFormData({ ...formData, relationship_strength: e.target.value })} className="px-3 py-2 bg-muted border border-border rounded-md text-sm">
              <option value="Weak">Relationship: Weak</option>
              <option value="Medium">Medium</option>
              <option value="Strong">Strong</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={createContact.isPending}>{createContact.isPending ? 'Saving...' : 'Save Contact'}</Button>
          </div>
        </form>
      )}

      {/* Edit Form */}
      {editingId && (
        <div className="data-card mb-4 space-y-3 border-primary/30">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Editing Contact</h4>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={cancelEdit}><X size={12} className="mr-1" /> Cancel</Button>
              <Button size="sm" onClick={saveEdit} disabled={updateContact.isPending}><Check size={12} className="mr-1" /> {updateContact.isPending ? 'Saving...' : 'Save'}</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })} placeholder="Full name" />
            <Input value={editData.title} onChange={e => setEditData({ ...editData, title: e.target.value })} placeholder="Title / Role" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input type="email" value={editData.email} onChange={e => setEditData({ ...editData, email: e.target.value })} placeholder="Email" />
            <Input value={editData.phone} onChange={e => setEditData({ ...editData, phone: e.target.value })} placeholder="Phone" />
            <Input value={editData.linkedin} onChange={e => setEditData({ ...editData, linkedin: e.target.value })} placeholder="LinkedIn URL" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select value={editData.influence_level} onChange={e => setEditData({ ...editData, influence_level: e.target.value })} className="px-3 py-2 bg-muted border border-border rounded-md text-sm">
              <option value="Unknown">Influence: Unknown</option>
              <option value="Decision Maker">Decision Maker</option>
              <option value="Influencer">Influencer</option>
              <option value="Champion">Champion</option>
              <option value="User">User</option>
              <option value="Procurement">Procurement</option>
            </select>
            <select value={editData.relationship_strength} onChange={e => setEditData({ ...editData, relationship_strength: e.target.value })} className="px-3 py-2 bg-muted border border-border rounded-md text-sm">
              <option value="Weak">Relationship: Weak</option>
              <option value="Medium">Medium</option>
              <option value="Strong">Strong</option>
            </select>
          </div>
        </div>
      )}

      {/* Contacts Table */}
      <div className="data-card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Name</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Title</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Contact</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Influence</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Relationship</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Last Email</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Source</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filteredContacts.map((contact: any) => (
              <tr key={contact.id} className={`border-b border-border hover:bg-muted/20 cursor-pointer ${editingId === contact.id ? 'bg-primary/5' : ''}`} onClick={() => startEdit(contact)}>
                <td className="px-4 py-3">
                  <span className="font-medium">{contact.name}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{contact.title || '—'}</td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    {contact.email && (
                      <a href={`mailto:${contact.email}`} className="text-muted-foreground hover:text-foreground" title={contact.email}>
                        <Mail size={14} />
                      </a>
                    )}
                    {contact.phone && (
                      <a href={`tel:${contact.phone}`} className="text-muted-foreground hover:text-foreground" title={contact.phone}>
                        <Phone size={14} />
                      </a>
                    )}
                    {contact.linkedin && (
                      <a href={contact.linkedin} target="_blank" rel="noopener" className="text-muted-foreground hover:text-foreground">
                        <Linkedin size={14} />
                      </a>
                    )}
                    {!contact.email && !contact.phone && !contact.linkedin && <span className="text-muted-foreground text-xs">—</span>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`status-badge ${influenceColors[contact.influence_level] || ''}`}>{contact.influence_level}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`status-badge ${strengthColors[contact.relationship_strength] || ''}`}>{contact.relationship_strength}</span>
                </td>
                <td className="px-4 py-3 text-xs">
                  {(() => {
                    const status = contactEmailStatus.get(contact.id);
                    if (!status) return <span className="text-muted-foreground">Never</span>;
                    const color = status.daysAgo <= 30 ? 'bg-success' : status.daysAgo <= 90 ? 'bg-warning' : 'bg-muted-foreground';
                    return (
                      <span className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${color}`} />
                        <span className="text-muted-foreground">{status.daysAgo}d ago</span>
                      </span>
                    );
                  })()}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{contact.source || '—'}</td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1 rounded hover:bg-muted">
                        <MoreVertical size={14} className="text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => startEdit(contact)}>Edit</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
            {filteredContacts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  {searchQuery ? 'No contacts match your search' : 'No contacts yet'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
