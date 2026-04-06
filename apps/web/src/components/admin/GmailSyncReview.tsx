import { useState, useMemo } from 'react';
import { type SyncResult, type UnmatchedAddress, useUpdateBlockedDomains, useBlockedDomains } from '@/hooks/useGmailIntegration';
import { useCreateContact } from '@/hooks/useContacts';
import { useCreateClient } from '@/hooks/useClients';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  X, Check, UserPlus, Building2, ShieldOff, ChevronDown, ChevronRight,
  Mail, Loader2, Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  diagnostics: SyncResult;
  onClose: () => void;
  onSyncNow: () => void;
  isSyncing: boolean;
}

interface DomainGroup {
  domain: string;
  addresses: UnmatchedAddress[];
  suggested_client_id: string | null;
  suggested_client_name: string | null;
}

export default function GmailSyncReview({ diagnostics, onClose, onSyncNow, isSyncing }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const createContact = useCreateContact();
  const createClient = useCreateClient();
  const updateBlockedDomains = useUpdateBlockedDomains();
  const { data: blockedDomains = [] } = useBlockedDomains();
  const [matchedExpanded, setMatchedExpanded] = useState(false);
  const [processedAddresses, setProcessedAddresses] = useState<Set<string>>(new Set());
  const [creatingClient, setCreatingClient] = useState<string | null>(null); // domain being created
  const [newClientName, setNewClientName] = useState('');
  const [selectingClient, setSelectingClient] = useState<string | null>(null); // address picking a client

  // Group unmatched addresses by domain
  const domainGroups = useMemo(() => {
    const groups = new Map<string, DomainGroup>();
    for (const addr of diagnostics.unmatched_addresses) {
      if (processedAddresses.has(addr.address)) continue;
      const domain = addr.address.split('@')[1]?.toLowerCase() || 'unknown';
      if (!groups.has(domain)) {
        groups.set(domain, {
          domain,
          addresses: [],
          suggested_client_id: addr.suggested_client_id,
          suggested_client_name: addr.suggested_client_name,
        });
      }
      groups.get(domain)!.addresses.push(addr);
    }
    return Array.from(groups.values()).sort((a, b) =>
      b.addresses.reduce((s, a) => s + a.email_count, 0) - a.addresses.reduce((s, a) => s + a.email_count, 0)
    );
  }, [diagnostics.unmatched_addresses, processedAddresses]);

  const handleAddContact = async (address: string, clientId: string) => {
    const local = address.split('@')[0].replace(/[._-]/g, ' ');
    const name = local.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    try {
      await createContact.mutateAsync({ name, email: address, client_id: clientId });
      setProcessedAddresses(prev => new Set([...prev, address]));
      toast({ title: `Added ${name} as contact` });
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    }
  };

  const handleAddAllInDomain = async (group: DomainGroup) => {
    if (!group.suggested_client_id) return;
    for (const addr of group.addresses) {
      await handleAddContact(addr.address, group.suggested_client_id);
    }
  };

  const handleBlockDomain = async (domain: string) => {
    const updated = [...blockedDomains.filter(d => d !== domain), domain];
    await updateBlockedDomains.mutateAsync(updated);
    // Mark all addresses from this domain as processed
    const addrsInDomain = diagnostics.unmatched_addresses
      .filter(a => a.address.split('@')[1]?.toLowerCase() === domain)
      .map(a => a.address);
    setProcessedAddresses(prev => new Set([...prev, ...addrsInDomain]));
  };

  const handleCreateAccount = async (domain: string) => {
    if (!newClientName.trim()) return;
    try {
      const result = await createClient.mutateAsync({ name: newClientName.trim(), client_type: 'Other' });
      // Now add all addresses from this domain to the new client
      const group = domainGroups.find(g => g.domain === domain);
      if (group) {
        for (const addr of group.addresses) {
          await handleAddContact(addr.address, result.id);
        }
      }
      setCreatingClient(null);
      setNewClientName('');
      toast({ title: `Created ${newClientName.trim()} and added contacts` });
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    }
  };

  const totalEmails = diagnostics.unmatched_addresses.reduce((s, a) => s + a.email_count, 0);

  return (
    <div className="border-t border-border pt-3 space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <span className="font-medium">{diagnostics.dry_run ? 'Scan Results' : 'Sync Results'}</span>
          <span className="text-muted-foreground">{diagnostics.total_from_gmail} scanned</span>
          <span className="text-success font-medium">{diagnostics.matched} matched</span>
          <span className="text-warning font-medium">{domainGroups.reduce((s, g) => s + g.addresses.length, 0)} need action</span>
          <span className="text-muted-foreground/60">{diagnostics.blocked} blocked</span>
        </div>
        <div className="flex items-center gap-2">
          {diagnostics.matched > 0 && diagnostics.dry_run && (
            <Button size="sm" onClick={onSyncNow} disabled={isSyncing}>
              {isSyncing ? <Loader2 size={13} className="animate-spin mr-1" /> : <Mail size={13} className="mr-1" />}
              Sync {diagnostics.matched} Matched
            </Button>
          )}
          {!diagnostics.dry_run && diagnostics.synced > 0 && (
            <span className="flex items-center gap-1 text-xs text-success font-medium">
              <Check size={13} /> {diagnostics.synced} synced
            </span>
          )}
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X size={14} /></button>
        </div>
      </div>

      {/* Matched addresses (collapsible) */}
      {diagnostics.matched_addresses.length > 0 && (
        <div>
          <button
            onClick={() => setMatchedExpanded(!matchedExpanded)}
            className="flex items-center gap-1.5 text-[11px] font-medium text-success"
          >
            {matchedExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            <Check size={10} /> Matched ({diagnostics.matched_addresses.length}) — will sync
          </button>
          {matchedExpanded && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {diagnostics.matched_addresses.map(a => (
                <span key={a.address} className="text-[10px] bg-success/10 text-success px-2 py-0.5 rounded-full">
                  {a.address} ({a.email_count})
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Unmatched — grouped by domain */}
      {domainGroups.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-medium text-warning">
            Needs Action ({domainGroups.reduce((s, g) => s + g.addresses.length, 0)} addresses, {totalEmails} emails)
          </p>

          {domainGroups.map(group => (
            <DomainGroupCard
              key={group.domain}
              group={group}
              onAddContact={handleAddContact}
              onAddAll={() => handleAddAllInDomain(group)}
              onBlock={() => handleBlockDomain(group.domain)}
              onCreateAccount={() => { setCreatingClient(group.domain); setNewClientName(group.domain.split('.')[0].charAt(0).toUpperCase() + group.domain.split('.')[0].slice(1)); }}
              isCreating={creatingClient === group.domain}
              newClientName={newClientName}
              onNewClientNameChange={setNewClientName}
              onConfirmCreate={() => handleCreateAccount(group.domain)}
              onCancelCreate={() => { setCreatingClient(null); setNewClientName(''); }}
            />
          ))}
        </div>
      )}

      {domainGroups.length === 0 && diagnostics.matched === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No actionable emails found. All addresses are either matched or blocked.
        </p>
      )}
    </div>
  );
}

function DomainGroupCard({ group, onAddContact, onAddAll, onBlock, onCreateAccount, isCreating, newClientName, onNewClientNameChange, onConfirmCreate, onCancelCreate }: {
  group: DomainGroup;
  onAddContact: (address: string, clientId: string) => Promise<void>;
  onAddAll: () => void;
  onBlock: () => void;
  onCreateAccount: () => void;
  isCreating: boolean;
  newClientName: string;
  onNewClientNameChange: (v: string) => void;
  onConfirmCreate: () => void;
  onCancelCreate: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const totalEmails = group.addresses.reduce((s, a) => s + a.email_count, 0);
  const hasSuggestion = !!group.suggested_client_id;

  return (
    <div className="bg-muted/20 rounded-lg border border-border/50 overflow-hidden">
      {/* Domain header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 text-xs font-medium">
          {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          <span className="font-mono">@{group.domain}</span>
          <span className="text-muted-foreground font-normal">{group.addresses.length} contacts · {totalEmails} emails</span>
          {hasSuggestion && (
            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
              → {group.suggested_client_name}
            </span>
          )}
        </button>
        <div className="flex items-center gap-1">
          {hasSuggestion && (
            <button onClick={onAddAll} className="text-[10px] px-2 py-0.5 bg-success/10 text-success rounded font-medium hover:bg-success/20">
              <UserPlus size={9} className="inline mr-0.5" /> Add all to {group.suggested_client_name}
            </button>
          )}
          {!hasSuggestion && !isCreating && (
            <button onClick={onCreateAccount} className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary rounded font-medium hover:bg-primary/20">
              <Building2 size={9} className="inline mr-0.5" /> Create Account
            </button>
          )}
          <button onClick={onBlock} className="text-[10px] px-2 py-0.5 bg-muted text-muted-foreground rounded hover:bg-destructive/10 hover:text-destructive">
            <ShieldOff size={9} className="inline mr-0.5" /> Block
          </button>
        </div>
      </div>

      {/* Create account inline form */}
      {isCreating && (
        <div className="px-3 py-2 bg-primary/5 border-b border-border/50 flex items-center gap-2">
          <input
            type="text"
            value={newClientName}
            onChange={e => onNewClientNameChange(e.target.value)}
            placeholder="Account name"
            className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
            autoFocus
          />
          <Button size="sm" className="h-6 text-[10px] px-2" onClick={onConfirmCreate}>Create & Add All</Button>
          <button onClick={onCancelCreate} className="text-muted-foreground hover:text-foreground"><X size={12} /></button>
        </div>
      )}

      {/* Address rows */}
      {expanded && (
        <div className="divide-y divide-border/30">
          {group.addresses.map(addr => (
            <div key={addr.address} className="flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-muted/20">
              <span className="font-mono text-foreground flex-1 truncate">{addr.address}</span>
              <span className="text-muted-foreground shrink-0">{addr.email_count} email{addr.email_count !== 1 ? 's' : ''}</span>
              {addr.sample_subjects[0] && (
                <span className="text-muted-foreground/40 truncate max-w-[180px] shrink-0">"{addr.sample_subjects[0]}"</span>
              )}
              {hasSuggestion && (
                <button
                  onClick={() => onAddContact(addr.address, group.suggested_client_id!)}
                  className="text-[10px] px-1.5 py-0.5 text-primary hover:bg-primary/10 rounded shrink-0"
                >
                  + {group.suggested_client_name}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
