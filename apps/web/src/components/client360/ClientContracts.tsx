import { useState, useRef } from 'react';
import { FileText, Upload, Download, Trash2, Loader2, Link2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useContracts,
  useUploadContract,
  useDeleteContract,
  getContractDownloadUrl,
  type Contract,
} from '@/hooks/useContracts';
import { useCreateDriveLink, useDriveLinks } from '@/hooks/useDriveLinks';
import { useToast } from '@/hooks/use-toast';

interface Props {
  clientId: string;
  opportunities: any[];
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ClientContracts({ clientId, opportunities }: Props) {
  const { data: contracts = [], isLoading } = useContracts(clientId);
  const { data: driveLinks = [] } = useDriveLinks({ client_id: clientId });
  const uploadMutation = useUploadContract();
  const deleteMutation = useDeleteContract();
  const createDriveLink = useCreateDriveLink();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedOppId, setSelectedOppId] = useState('');
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const { toast } = useToast();

  const closedWonOpps = opportunities.filter((o: any) => o.stage === 'Closed Won');
  const contractDriveLinks = driveLinks.filter((l: any) => l.title?.toLowerCase().includes('contract') || l.link_type === 'file');

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadMutation.mutateAsync({
        clientId,
        opportunityId: selectedOppId || undefined,
        file,
      });
      toast({ title: 'Contract uploaded' });
      setSelectedOppId('');
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    }
    // Reset file input
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDownload = async (contract: Contract) => {
    try {
      const url = await getContractDownloadUrl(contract.file_path);
      window.open(url, '_blank');
    } catch (err: any) {
      toast({ title: 'Download failed', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (contract: Contract) => {
    if (!confirm(`Delete "${contract.file_name}"?`)) return;
    try {
      await deleteMutation.mutateAsync({ id: contract.id, filePath: contract.file_path });
      toast({ title: 'Contract deleted' });
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div>
      {/* Upload section */}
      <div className="flex items-center gap-3 mb-6">
        {closedWonOpps.length > 0 && (
          <select
            value={selectedOppId}
            onChange={(e) => setSelectedOppId(e.target.value)}
            className="text-sm border border-border rounded-md px-2 py-1.5 bg-background"
          >
            <option value="">Link to opportunity (optional)</option>
            {closedWonOpps.map((o: any) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        )}
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
          onChange={handleUpload}
        />
        <Button
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploadMutation.isPending}
        >
          {uploadMutation.isPending ? (
            <Loader2 size={14} className="animate-spin mr-1" />
          ) : (
            <Upload size={14} className="mr-1" />
          )}
          Upload Contract
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowLinkForm(!showLinkForm)}
        >
          <Link2 size={14} className="mr-1" />
          Link Google Doc
        </Button>
      </div>

      {showLinkForm && (
        <div className="flex items-end gap-2 mb-4">
          <div className="flex-1">
            <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Google Drive URL</label>
            <input
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              placeholder="Paste a Google Drive link..."
              className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
          </div>
          <div className="w-48">
            <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Title</label>
            <input
              value={linkTitle}
              onChange={e => setLinkTitle(e.target.value)}
              placeholder="e.g. Signed Contract"
              className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <Button
            size="sm"
            disabled={!linkUrl.trim() || createDriveLink.isPending}
            onClick={async () => {
              try {
                await createDriveLink.mutateAsync({
                  client_id: clientId,
                  opportunity_id: selectedOppId || undefined,
                  url: linkUrl.trim(),
                  title: linkTitle.trim() || 'Contract',
                  link_type: 'file',
                });
                setLinkUrl('');
                setLinkTitle('');
                setShowLinkForm(false);
                toast({ title: 'Contract linked' });
              } catch (err: any) {
                toast({ title: 'Failed to link', description: err.message, variant: 'destructive' });
              }
            }}
          >
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setShowLinkForm(false); setLinkUrl(''); setLinkTitle(''); }}>
            Cancel
          </Button>
        </div>
      )}

      {/* Contracts list */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : contracts.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No contracts uploaded yet</p>
      ) : (
        <div className="space-y-2">
          {contracts.map((c) => (
            <div key={c.id} className="data-card flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <FileText size={16} className="text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{c.file_name}</p>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{formatFileSize(c.file_size)}</span>
                    <span>·</span>
                    <span>{new Date(c.created_at).toLocaleDateString()}</span>
                    {c.opportunity_name && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-0.5">
                          <Link2 size={9} /> {c.opportunity_name}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleDownload(c)}
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  title="Download"
                >
                  <Download size={14} />
                </button>
                <button
                  onClick={() => handleDelete(c)}
                  className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Linked Google Docs */}
      {contractDriveLinks.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Linked Documents</p>
          <div className="space-y-2">
            {contractDriveLinks.map((l: any) => (
              <div key={l.id} className="data-card flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <Link2 size={16} className="text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{l.title || 'Untitled'}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{l.url}</p>
                  </div>
                </div>
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0">
                  <ExternalLink size={14} />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
