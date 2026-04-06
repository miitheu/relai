import { useState } from 'react';
import { useDriveLinks, useCreateDriveLink, useDeleteDriveLink, parseDriveUrl, type DriveLink } from '@/hooks/useDriveLinks';
import { useToast } from '@/hooks/use-toast';
import { FolderOpen, FileText, ExternalLink, Plus, X, Loader2, Link2 } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  clientId?: string;
  opportunityId?: string;
  /** Read-only inherited links from parent client (shown on opportunity view) */
  inheritedLinks?: DriveLink[];
}

export default function DriveLinksPanel({ clientId, opportunityId, inheritedLinks = [] }: Props) {
  const { data: links = [], isLoading } = useDriveLinks(
    opportunityId ? { opportunity_id: opportunityId } : clientId ? { client_id: clientId } : undefined
  );
  const createLink = useCreateDriveLink();
  const deleteLink = useDeleteDriveLink();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [linkType, setLinkType] = useState<'folder' | 'file'>('file');

  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);
    if (newUrl.length > 10) {
      const parsed = parseDriveUrl(newUrl);
      setLinkType(parsed.linkType);
      if (!title && parsed.suggestedTitle) setTitle(parsed.suggestedTitle);
    }
  };

  const handleAdd = async () => {
    if (!url.trim()) return;
    try {
      await createLink.mutateAsync({
        client_id: clientId || undefined,
        opportunity_id: opportunityId || undefined,
        url: url.trim(),
        title: title.trim() || 'Untitled',
        link_type: linkType,
      });
      setUrl('');
      setTitle('');
      setLinkType('file');
      setShowForm(false);
      toast({ title: 'Link added' });
    } catch (err: any) {
      toast({ title: 'Failed to add link', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteLink.mutateAsync(id);
      toast({ title: 'Link removed' });
    } catch (err: any) {
      toast({ title: 'Failed to remove link', description: err.message, variant: 'destructive' });
    }
  };

  const allLinks = [...inheritedLinks.map(l => ({ ...l, _inherited: true })), ...links.map(l => ({ ...l, _inherited: false }))];
  const folders = allLinks.filter(l => l.link_type === 'folder');
  const files = allLinks.filter(l => l.link_type === 'file');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {allLinks.length} {allLinks.length === 1 ? 'document' : 'documents'} linked
        </p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          <Plus size={12} /> Add Link
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="data-card space-y-3">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground mb-1 block">URL</label>
            <input
              value={url}
              onChange={e => handleUrlChange(e.target.value)}
              placeholder="Paste a Google Drive link..."
              className="w-full px-3 py-2 text-sm bg-muted/30 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
            {url && !parseDriveUrl(url).isDrive && (
              <p className="text-[10px] text-warning mt-1">Not a Google Drive URL (will still be saved)</p>
            )}
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Title</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Q1 Proposal, Contract Draft..."
                className="w-full px-3 py-2 text-sm bg-muted/30 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Type</label>
              <select
                value={linkType}
                onChange={e => setLinkType(e.target.value as 'folder' | 'file')}
                className="px-3 py-2 text-sm bg-muted/30 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="file">File</option>
                <option value="folder">Folder</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button onClick={() => { setShowForm(false); setUrl(''); setTitle(''); }} className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5">
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!url.trim() || createLink.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {createLink.isPending ? <Loader2 size={11} className="animate-spin" /> : <Link2 size={11} />}
              Add
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {allLinks.length === 0 && !showForm && (
        <div className="text-center py-12">
          <FolderOpen size={32} className="mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No documents linked</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Paste a Google Drive URL to get started</p>
        </div>
      )}

      {/* Folders section */}
      {folders.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Folders</p>
          <div className="space-y-1.5">
            {folders.map((l: any) => (
              <LinkRow key={l.id} link={l} inherited={l._inherited} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}

      {/* Files section */}
      {files.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Files</p>
          <div className="space-y-1.5">
            {files.map((l: any) => (
              <LinkRow key={l.id} link={l} inherited={l._inherited} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LinkRow({ link, inherited, onDelete }: { link: DriveLink; inherited: boolean; onDelete: (id: string) => void }) {
  const Icon = link.link_type === 'folder' ? FolderOpen : FileText;
  const isDrive = /drive\.google\.com|docs\.google\.com|sheets\.google\.com|slides\.google\.com/.test(link.url);

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 group transition-colors">
      <Icon size={16} className={isDrive ? 'text-primary shrink-0' : 'text-muted-foreground shrink-0'} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{link.title || 'Untitled'}</span>
          {inherited && (
            <span className="text-[9px] bg-info/10 text-info px-1.5 py-0.5 rounded shrink-0">Account</span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground truncate">{link.url}</p>
      </div>
      <span className="text-[10px] text-muted-foreground shrink-0">{format(new Date(link.created_at), 'MMM d')}</span>
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="p-1 text-muted-foreground hover:text-primary transition-colors shrink-0"
        onClick={e => e.stopPropagation()}
      >
        <ExternalLink size={13} />
      </a>
      {!inherited && (
        <button
          onClick={() => onDelete(link.id)}
          className="p-1 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 shrink-0"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
