import { useState, useRef } from 'react';
import { FileUp, AlertTriangle, X, Check, Loader2, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AccountActionItem,
  useResolveActionItem,
  useDismissActionItem,
  uploadContract,
} from '@/hooks/useAccountActionItems';
import { useDriveLinks, useCreateDriveLink } from '@/hooks/useDriveLinks';
import { useToast } from '@/hooks/use-toast';

interface Props {
  items: AccountActionItem[];
}

export default function AccountActionBanners({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-3 mb-6">
      {items.map((item) =>
        item.action_type === 'upload_contract' ? (
          <ContractBanner key={item.id} item={item} />
        ) : (
          <LossReasonBanner key={item.id} item={item} />
        )
      )}
    </div>
  );
}

function ContractBanner({ item }: { item: AccountActionItem }) {
  const resolve = useResolveActionItem();
  const dismiss = useDismissActionItem();
  const createDriveLink = useCreateDriveLink();
  const { data: driveLinks = [] } = useDriveLinks({ opportunity_id: item.opportunity_id || undefined });
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const { toast } = useToast();

  // Auto-resolve if a drive link already exists for this opportunity
  if (driveLinks.length > 0 && item.status === 'pending') {
    resolve.mutate({ id: item.id, resolution_note: 'Document linked via Google Drive' });
    return null;
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadContract(file, item.opportunity_id || item.id);
      await resolve.mutateAsync({ id: item.id, file_url: url });
      toast({ title: 'Contract uploaded' });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleLinkDocument = async () => {
    if (!linkUrl.trim()) return;
    try {
      await createDriveLink.mutateAsync({
        url: linkUrl.trim(),
        title: linkTitle.trim() || 'Contract',
        link_type: 'file',
        client_id: item.client_id,
        opportunity_id: item.opportunity_id || undefined,
      });
      await resolve.mutateAsync({ id: item.id, file_url: linkUrl.trim(), resolution_note: 'Linked via Google Drive' });
      toast({ title: 'Document linked' });
      setShowLinkInput(false);
    } catch (err: any) {
      toast({ title: 'Failed to link', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="p-3 rounded-lg border border-warning/40 bg-warning/5">
      <div className="flex items-center gap-3">
        <FileUp size={18} className="text-warning shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{item.title}</p>
          <p className="text-xs text-muted-foreground">{item.description}</p>
        </div>
        <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.png,.jpg" onChange={handleUpload} />
        <Button
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Loader2 size={14} className="animate-spin mr-1" /> : <FileUp size={14} className="mr-1" />}
          {uploading ? 'Uploading...' : 'Upload'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowLinkInput(!showLinkInput)}
        >
          <Link2 size={14} className="mr-1" /> Link
        </Button>
        <button
          onClick={() => dismiss.mutate(item.id)}
          className="p-1 rounded hover:bg-muted text-muted-foreground"
          title="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
      {showLinkInput && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={linkTitle}
            onChange={(e) => setLinkTitle(e.target.value)}
            placeholder="Title (e.g. Signed Contract)"
            className="w-40 text-sm border border-border rounded-md px-2 py-1.5 bg-background"
          />
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="Google Drive URL"
            className="flex-1 text-sm border border-border rounded-md px-2 py-1.5 bg-background"
            autoFocus
          />
          <Button
            size="sm"
            disabled={!linkUrl.trim() || createDriveLink.isPending}
            onClick={handleLinkDocument}
          >
            {createDriveLink.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          </Button>
        </div>
      )}
    </div>
  );
}

function LossReasonBanner({ item }: { item: AccountActionItem }) {
  const resolve = useResolveActionItem();
  const dismiss = useDismissActionItem();
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState('');
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    try {
      await resolve.mutateAsync({ id: item.id, resolution_note: reason.trim() });
      toast({ title: 'Loss reason saved' });
    } catch (err: any) {
      toast({ title: 'Failed to save', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/5">
      <div className="flex items-center gap-3">
        <AlertTriangle size={18} className="text-destructive shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{item.title}</p>
          <p className="text-xs text-muted-foreground">{item.description}</p>
        </div>
        {!expanded && (
          <Button size="sm" variant="outline" onClick={() => setExpanded(true)}>
            Add Reason
          </Button>
        )}
        <button
          onClick={() => dismiss.mutate(item.id)}
          className="p-1 rounded hover:bg-muted text-muted-foreground"
          title="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
      {expanded && (
        <div className="mt-3 flex gap-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What went wrong? (e.g., pricing, timing, competitor, no budget...)"
            className="flex-1 text-sm border border-border rounded-md p-2 bg-background resize-none"
            rows={2}
            autoFocus
          />
          <Button
            size="sm"
            disabled={!reason.trim() || resolve.isPending}
            onClick={handleSubmit}
          >
            {resolve.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          </Button>
        </div>
      )}
    </div>
  );
}
