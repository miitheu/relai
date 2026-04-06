import { useState, useEffect, useRef, useMemo } from 'react';
import { X, MessageSquare, Phone, Video, FileText, Monitor, Search, ChevronDown } from 'lucide-react';
import { useInteraction, InteractionType } from '@/contexts/InteractionContext';
import { useClients, useContacts, useOpportunities, useCreateNote } from '@/hooks/useCrmData';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

const interactionTypes: { id: InteractionType; label: string; icon: any }[] = [
  { id: 'meeting', label: 'Meeting', icon: Video },
  { id: 'call', label: 'Call', icon: Phone },
  { id: 'email', label: 'Email', icon: MessageSquare },
  { id: 'demo', label: 'Demo', icon: Monitor },
  { id: 'note', label: 'Note', icon: FileText },
];

function MiniSelect({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void;
  options: { id: string; label: string }[]; placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() =>
    options.filter(o => o.label.toLowerCase().includes(search.toLowerCase())), [options, search]);
  const selectedLabel = options.find(o => o.id === value)?.label;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-muted border border-border rounded-lg text-sm hover:border-primary/40 transition-colors">
        <span className={selectedLabel ? 'text-foreground' : 'text-muted-foreground'}>{selectedLabel || placeholder}</span>
        <ChevronDown size={14} className="text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-muted rounded-md">
              <Search size={13} className="text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
                className="bg-transparent text-sm outline-none flex-1 text-foreground placeholder:text-muted-foreground" autoFocus />
            </div>
          </div>
          <div className="max-h-40 overflow-y-auto">
            <button type="button" onClick={() => { onChange(''); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-muted">— None —</button>
            {filtered.map(o => (
              <button key={o.id} type="button" onClick={() => { onChange(o.id); setOpen(false); setSearch(''); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${o.id === value ? 'bg-primary/10 text-primary' : 'text-foreground'}`}>{o.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function InteractionLogger() {
  const supabase = useSupabase();
  const { isOpen, defaults, close } = useInteraction();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const createNote = useCreateNote();
  const { data: clients = [] } = useClients();
  const { data: contacts = [] } = useContacts();
  const { data: opportunities = [] } = useOpportunities();

  const [type, setType] = useState<InteractionType>('note');
  const [clientId, setClientId] = useState('');
  const [contactId, setContactId] = useState('');
  const [oppId, setOppId] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setType(defaults.type || 'note');
      setClientId(defaults.client_id || '');
      setContactId(defaults.contact_id || '');
      setOppId(defaults.opportunity_id || '');
      setSubject('');
      setContent('');
      setTimeout(() => contentRef.current?.focus(), 150);
    }
  }, [isOpen, defaults]);

  if (!isOpen) return null;

  const clientOptions = clients.map((c: any) => ({ id: c.id, label: c.name }));
  const filteredContacts = clientId
    ? contacts.filter((c: any) => c.client_id === clientId)
    : contacts;
  const contactOptions = filteredContacts.map((c: any) => ({ id: c.id, label: `${c.name}${c.clients?.name ? ` (${c.clients.name})` : ''}` }));
  const oppOptions = opportunities.map((o: any) => ({ id: o.id, label: `${o.name} — ${o.clients?.name || ''}` }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      toast({ title: 'Please enter content', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (type === 'note') {
        await createNote.mutateAsync({
          content: content.trim(),
          client_id: clientId || undefined,
          contact_id: contactId || undefined,
          opportunity_id: oppId || undefined,
        });
      } else if (type === 'meeting') {
        await supabase.from('meetings').insert({
          summary: content.trim(),
          participants: subject || undefined,
          client_id: clientId || undefined,
          opportunity_id: oppId || undefined,
          dataset_id: defaults.dataset_id || undefined,
          created_by: user?.id,
        }).throwOnError();
        qc.invalidateQueries({ queryKey: ['meetings'] });
      } else if (type === 'email') {
        await supabase.from('emails').insert({
          subject: subject || 'Email',
          summary: content.trim(),
          client_id: clientId || undefined,
          contact_id: contactId || undefined,
          opportunity_id: oppId || undefined,
          created_by: user?.id,
        }).throwOnError();
        qc.invalidateQueries({ queryKey: ['emails'] });
      } else {
        // call / demo → store as activity
        await supabase.from('activities').insert({
          activity_type: type,
          description: `${subject ? subject + ': ' : ''}${content.trim()}`,
          client_id: clientId || undefined,
          contact_id: contactId || undefined,
          opportunity_id: oppId || undefined,
          created_by: user!.id,
        }).throwOnError();
        qc.invalidateQueries({ queryKey: ['activities'] });
      }

      toast({ title: `✓ ${interactionTypes.find(t => t.id === type)?.label} logged` });
      close();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm" onClick={close} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md flex flex-col bg-card border-l border-border shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-13 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-foreground">Log Interaction</h2>
          <button onClick={close} className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-4">
            {/* Type selector */}
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              {interactionTypes.map(t => (
                <button key={t.id} type="button" onClick={() => setType(t.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-colors ${type === t.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                  <t.icon size={13} />
                  {t.label}
                </button>
              ))}
            </div>

            {/* Subject (for meeting/email/call/demo) */}
            {type !== 'note' && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  {type === 'meeting' ? 'Participants' : type === 'email' ? 'Subject' : 'Title'}
                </label>
                <input value={subject} onChange={e => setSubject(e.target.value)}
                  placeholder={type === 'meeting' ? 'e.g. John, Sarah' : type === 'email' ? 'Email subject' : 'Brief title'}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm focus:border-primary/40 outline-none" />
              </div>
            )}

            {/* Content */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                {type === 'note' ? 'Note' : type === 'meeting' ? 'Summary & Next Steps' : type === 'email' ? 'Summary' : 'Details'}
              </label>
              <textarea ref={contentRef} value={content} onChange={e => setContent(e.target.value)}
                rows={5} required
                placeholder={type === 'meeting' ? 'Key discussion points, next steps...' : type === 'note' ? 'Quick note...' : 'Details...'}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm focus:border-primary/40 outline-none resize-none" />
            </div>

            {/* Link to entities */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Link to</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <MiniSelect value={clientId} onChange={setClientId} options={clientOptions} placeholder="Client (optional)" />
              <MiniSelect value={contactId} onChange={setContactId} options={contactOptions} placeholder="Contact (optional)" />
              <MiniSelect value={oppId} onChange={setOppId} options={oppOptions} placeholder="Opportunity (optional)" />
            </div>
          </div>
        </form>

        <div className="border-t border-border px-5 py-3 flex items-center justify-end gap-2 shrink-0">
          <button type="button" onClick={close} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !content.trim()}
            className="px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-all">
            {saving ? 'Saving...' : 'Log'}
          </button>
        </div>
      </div>
    </>
  );
}
