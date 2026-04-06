import { useState } from 'react';
import { useGmailConnection, useConnectGmail, useDisconnectGmail, useSyncGmail, useBlockedDomains, useUpdateBlockedDomains, type SyncResult } from '@/hooks/useGmailIntegration';
import { Mail, Check, X, RefreshCw, Loader2, Search, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import GmailSyncReview from './GmailSyncReview';

export default function GmailIntegrationCard() {
  const { data: connection, isLoading } = useGmailConnection();
  const connectGmail = useConnectGmail();
  const disconnectGmail = useDisconnectGmail();
  const syncGmail = useSyncGmail();
  const { data: blockedDomains = [] } = useBlockedDomains();
  const updateBlockedDomains = useUpdateBlockedDomains();
  const [diagnostics, setDiagnostics] = useState<SyncResult | null>(null);
  const [justSynced, setJustSynced] = useState(false);

  if (isLoading) {
    return (
      <div className="data-card flex items-center gap-3 p-4">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Checking Gmail connection...</span>
      </div>
    );
  }

  const isConnected = connection?.connected;

  const handleDryRun = () => {
    syncGmail.mutate({ dry_run: true, full_rescan: true }, {
      onSuccess: (data) => setDiagnostics(data),
    });
  };

  const handleSync = () => {
    setJustSynced(false);
    syncGmail.mutate({ full_rescan: true }, {
      onSuccess: (data) => {
        setDiagnostics(data);
        setJustSynced(true);
      },
    });
  };

  const handleRemoveBlockedDomain = (domain: string) => {
    updateBlockedDomains.mutate(blockedDomains.filter(d => d !== domain));
  };

  return (
    <div className="space-y-3">
      <div className="data-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isConnected ? 'bg-success/10' : 'bg-muted'}`}>
              <Mail size={20} className={isConnected ? 'text-success' : 'text-muted-foreground'} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">Gmail Integration</h3>
                {isConnected ? (
                  <span className="flex items-center gap-1 text-[10px] bg-success/10 text-success px-1.5 py-0.5 rounded-full">
                    <Check size={10} /> Connected
                  </span>
                ) : (
                  <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                    Not connected
                  </span>
                )}
              </div>
              {isConnected && connection.email_address && (
                <p className="text-xs text-muted-foreground">{connection.email_address}</p>
              )}
              {isConnected && connection.last_sync_at && (
                <p className="text-[10px] text-muted-foreground">
                  Last synced: {format(new Date(connection.last_sync_at), 'MMM d, yyyy h:mm a')} · Auto-syncs daily at 9:00 AM CET
                </p>
              )}
              {isConnected && !connection.last_sync_at && (
                <p className="text-[10px] text-muted-foreground">
                  Not synced yet · Auto-syncs daily at 9:00 AM CET
                </p>
              )}
              {!isConnected && (
                <p className="text-xs text-muted-foreground">
                  Connect your Gmail to auto-sync emails with CRM contacts
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <Button size="sm" variant={justSynced ? "default" : "outline"} onClick={handleSync} disabled={syncGmail.isPending}>
                  {syncGmail.isPending ? <Loader2 size={13} className="animate-spin mr-1" /> : justSynced ? <Check size={13} className="mr-1" /> : <RefreshCw size={13} className="mr-1" />}
                  {syncGmail.isPending ? 'Syncing...' : justSynced ? 'Synced' : 'Sync Now'}
                </Button>
                <Button
                  size="sm" variant="ghost"
                  onClick={() => { if (confirm('Disconnect Gmail? Synced emails will remain.')) disconnectGmail.mutate(); }}
                  disabled={disconnectGmail.isPending}
                >
                  <X size={13} className="mr-1" /> Disconnect
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => connectGmail.mutate()} disabled={connectGmail.isPending}>
                {connectGmail.isPending ? <Loader2 size={13} className="animate-spin mr-1" /> : <Mail size={13} className="mr-1" />}
                Connect Gmail
              </Button>
            )}
          </div>
        </div>

        {/* Sync Review Panel */}
        {diagnostics && (
          <GmailSyncReview
            diagnostics={diagnostics}
            onClose={() => setDiagnostics(null)}
            onSyncNow={handleSync}
            isSyncing={syncGmail.isPending}
          />
        )}
      </div>

      {/* Blocked Domains */}
      {isConnected && blockedDomains.length > 0 && (
        <div className="data-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <ShieldOff size={14} className="text-muted-foreground" />
            <h3 className="text-xs font-semibold text-muted-foreground">Blocked Domains ({blockedDomains.length})</h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {blockedDomains.map(d => (
              <span key={d} className="flex items-center gap-1 text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                @{d}
                <button onClick={() => handleRemoveBlockedDomain(d)} className="hover:text-destructive">
                  <X size={9} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
