import AppLayout from '@/components/AppLayout';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useClient, useContacts, useOpportunities,
  useRenewals, useDeliveries, useNotes
} from '@/hooks/useCrmData';
import { useActivities } from '@/hooks/useActivities';
import { useProductFitAnalyses } from '@/hooks/useFundIntelligence';
import { useCustomerHealth } from '@/hooks/useCustomerHealth';
import { formatCurrency } from '@/data/mockData';
import { useCurrencyRerender } from '@/hooks/useCurrencyRerender';
import {
  Building2, TrendingUp, Users, Clock, Brain, Pencil, Check, X, ListChecks, Heart, Briefcase, FileText, Receipt, FolderOpen, Mail
} from 'lucide-react';
import DriveLinksPanel from '@/components/DriveLinksPanel';
import { useMeetingPrep } from '@/hooks/useMeetingPrep';
import { useState, useRef, useEffect } from 'react';
import { useUpdateClient } from '@/hooks/useClients';
import { useToast } from '@/hooks/use-toast';
import LoadingState from '@/components/LoadingState';
import { useQuickCreate } from '@/contexts/QuickCreateContext';
import TaskPanel from '@/components/TaskPanel';
import { formatDistanceToNow } from 'date-fns';

// Modular components
import ClientContacts from '@/components/client360/ClientContacts';
import ClientPipeline from '@/components/client360/ClientPipeline';
import ClientTimeline from '@/components/client360/ClientTimeline';
import AccountIntelligenceTab from '@/components/client360/AccountIntelligenceTab';
import CustomerHealthTab from '@/components/client360/CustomerHealthTab';
import AccountActionBanners from '@/components/client360/AccountActionBanners';
import ClientContracts from '@/components/client360/ClientContracts';
import ClientInvoices from '@/components/client360/ClientInvoices';
import ClientEmails from '@/components/client360/ClientEmails';
import { useEmails } from '@/hooks/useGmailIntegration';
import { useAccountActionItems } from '@/hooks/useAccountActionItems';


const tabs = [
  { id: 'intelligence', label: 'Intelligence', icon: Brain },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'emails', label: 'Emails', icon: Mail },
  { id: 'pipeline', label: 'Pipeline', icon: TrendingUp },
  { id: 'health', label: 'Health', icon: Heart },
  { id: 'invoices', label: 'Invoices', icon: Receipt },
  { id: 'contracts', label: 'Contracts', icon: FileText },
  { id: 'documents', label: 'Documents', icon: FolderOpen },
  { id: 'tasks', label: 'Tasks', icon: ListChecks },
  { id: 'activity', label: 'Activity', icon: Clock },
];

export default function ClientDetail() {
  useCurrencyRerender();
  const { id } = useParams();
  const navigate = useNavigate();
  const { open: openOpportunity, openTrial, openDelivery } = useQuickCreate();
  const [activeTab, setActiveTab] = useState('intelligence');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const updateClient = useUpdateClient();
  const { toast } = useToast();
  const { result: meetingBrief, isLoading: isMeetingPrepLoading, generateBrief, error: meetingPrepError } = useMeetingPrep();
  const [showMeetingBrief, setShowMeetingBrief] = useState(false);

  const startEditingName = () => {
    setEditName(client?.name || '');
    setIsEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const saveName = async () => {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === client?.name) {
      setIsEditingName(false);
      return;
    }
    try {
      await updateClient.mutateAsync({ id: id!, name: trimmed });
      toast({ title: 'Name updated' });
    } catch (e: any) {
      toast({ title: 'Failed to update name', description: e.message, variant: 'destructive' });
    }
    setIsEditingName(false);
  };


  const { data: client, isLoading: loadingClient } = useClient(id);
  const { data: contacts = [] } = useContacts(id);
  const { data: opportunities = [] } = useOpportunities({ client_id: id });
  const { data: renewals = [] } = useRenewals(id);
  const { data: deliveries = [] } = useDeliveries({ client_id: id });
  const { data: activities = [] } = useActivities({ client_id: id });
  const { data: notes = [] } = useNotes({ client_id: id });
  const { data: productFits = [] } = useProductFitAnalyses(id);
  const { data: clientEmails = [] } = useEmails({ client_id: id });
  const healthData = useCustomerHealth(id);
  const { data: actionItems = [] } = useAccountActionItems(id);

  if (loadingClient) return <AppLayout><LoadingState /></AppLayout>;
  if (!client) return <AppLayout><p className="text-muted-foreground">Account not found</p></AppLayout>;

  // Redirect merged accounts to their canonical account
  if (client.is_merged && client.merged_into_client_id) {
    navigate(`/clients/${client.merged_into_client_id}`, { replace: true });
    return null;
  }

  const statusCls: Record<string, string> = {
    'Active Client': 'bg-success/10 text-success',
    'Prospect': 'bg-info/10 text-info',
    'Strategic': 'bg-primary/10 text-primary',
    'Dormant': 'bg-muted text-muted-foreground',
  };

  const activeOpps = opportunities.filter((o: any) => !['Closed Won', 'Closed Lost'].includes(o.stage));

  return (
    <AppLayout>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
        <button onClick={() => navigate('/')} className="hover:text-foreground transition-colors">Home</button>
        <span>/</span>
        <button onClick={() => navigate('/clients')} className="hover:text-foreground transition-colors">Accounts</button>
        <span>/</span>
        <span className="text-foreground font-medium truncate max-w-[200px]">{client.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
          <Building2 size={18} className="text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isEditingName ? (
              <div className="flex items-center gap-1">
                <input
                  ref={nameInputRef}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setIsEditingName(false); }}
                  className="text-xl font-bold bg-transparent border-b border-primary outline-none px-0 py-0"
                />
                <button onClick={saveName} className="p-1 rounded hover:bg-success/10 text-success"><Check size={14} /></button>
                <button onClick={() => setIsEditingName(false)} className="p-1 rounded hover:bg-destructive/10 text-destructive"><X size={14} /></button>
              </div>
            ) : (
              <>
                <h1 className="text-xl font-bold truncate">{client.name}</h1>
                <button onClick={startEditingName} className="p-1 rounded hover:bg-muted text-muted-foreground"><Pencil size={12} /></button>
              </>
            )}
            <span className={`status-badge ${statusCls[client.relationship_status] || ''}`}>{client.relationship_status}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {client.client_type} · {client.headquarters_country || 'N/A'}
            {client.aum ? ` · AUM ${client.aum}` : ''}
          </p>
        </div>
        <button
          onClick={async () => {
            await generateBrief(id!);
            setShowMeetingBrief(true);
          }}
          disabled={isMeetingPrepLoading}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-50 shrink-0"
        >
          <Briefcase size={14} />
          <span className="hidden sm:inline">{isMeetingPrepLoading ? 'Preparing...' : 'Meeting Prep'}</span>
        </button>
      </div>

      {/* Meeting Brief panel */}
      {showMeetingBrief && meetingBrief && (
        <div className="mb-6 data-card border-primary/30">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-1.5"><Briefcase size={14} /> Meeting Brief</h3>
            <button onClick={() => setShowMeetingBrief(false)} className="p-1 rounded hover:bg-muted text-muted-foreground"><X size={14} /></button>
          </div>
          <p className="text-sm mb-3">{meetingBrief.brief.executive_summary}</p>
          {meetingBrief.brief.talking_points.length > 0 && (
            <div className="mb-3">
              <span className="text-xs font-medium text-muted-foreground uppercase">Talking Points</span>
              <ul className="mt-1 space-y-1">
                {meetingBrief.brief.talking_points.map((tp, i) => (
                  <li key={i} className="text-sm flex items-start gap-2"><span className="text-primary mt-0.5">-</span> {tp}</li>
                ))}
              </ul>
            </div>
          )}
          {meetingBrief.brief.questions_to_ask.length > 0 && (
            <div className="mb-3">
              <span className="text-xs font-medium text-muted-foreground uppercase">Questions to Ask</span>
              <ul className="mt-1 space-y-1">
                {meetingBrief.brief.questions_to_ask.map((q, i) => (
                  <li key={i} className="text-sm flex items-start gap-2"><span className="text-info mt-0.5">?</span> {q}</li>
                ))}
              </ul>
            </div>
          )}
          {meetingBrief.brief.risk_factors.length > 0 && (
            <div className="mb-3">
              <span className="text-xs font-medium text-muted-foreground uppercase">Risk Factors</span>
              <ul className="mt-1 space-y-1">
                {meetingBrief.brief.risk_factors.map((r, i) => (
                  <li key={i} className="text-sm flex items-start gap-2"><span className="text-destructive mt-0.5">!</span> {r}</li>
                ))}
              </ul>
            </div>
          )}
          {meetingBrief.brief.next_steps.length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase">Suggested Next Steps</span>
              <ul className="mt-1 space-y-1">
                {meetingBrief.brief.next_steps.map((ns, i) => (
                  <li key={i} className="text-sm flex items-start gap-2"><span className="text-success mt-0.5">-</span> {ns}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {showMeetingBrief && meetingPrepError && (
        <div className="mb-6 data-card border-destructive/30">
          <p className="text-sm text-destructive">{meetingPrepError}</p>
          <button onClick={() => setShowMeetingBrief(false)} className="text-xs text-muted-foreground mt-2 hover:underline">Dismiss</button>
        </div>
      )}

      {/* Summary Tiles */}
      {(() => {
        const closedWon = opportunities.filter((o: any) => o.stage === 'Closed Won').length;
        const closedLost = opportunities.filter((o: any) => o.stage === 'Closed Lost').length;

        // Find last contact: most recent email or activity
        const lastEmail = clientEmails[0]; // already sorted by email_date desc
        const lastActivity = activities[0]; // already sorted by created_at desc
        const lastEmailDate = lastEmail?.email_date ? new Date(lastEmail.email_date) : null;
        const lastActivityDate = lastActivity?.created_at ? new Date(lastActivity.created_at) : null;

        let lastContactDate: Date | null = null;
        let lastContactWith = '';
        if (lastEmailDate && lastActivityDate) {
          if (lastEmailDate > lastActivityDate) {
            lastContactDate = lastEmailDate;
            lastContactWith = lastEmail.from_address || lastEmail.subject || 'Email';
          } else {
            lastContactDate = lastActivityDate;
            lastContactWith = lastActivity.activity_type || 'Activity';
          }
        } else if (lastEmailDate) {
          lastContactDate = lastEmailDate;
          lastContactWith = lastEmail.from_address || lastEmail.subject || 'Email';
        } else if (lastActivityDate) {
          lastContactDate = lastActivityDate;
          lastContactWith = lastActivity.activity_type || 'Activity';
        }

        return (
          <div className="grid grid-cols-4 gap-3 mb-6">
            <div className="data-card py-3 px-4 cursor-pointer hover:border-primary/30" onClick={() => setActiveTab('contacts')}>
              <span className="metric-label">Contacts</span>
              <p className="text-xl font-bold font-mono">{contacts.length}</p>
            </div>
            <div className="data-card py-3 px-4 cursor-pointer hover:border-primary/30" onClick={() => setActiveTab('pipeline')}>
              <span className="metric-label">Active Opps</span>
              <p className="text-xl font-bold font-mono">{activeOpps.length}</p>
            </div>
            <div className="data-card py-3 px-4 cursor-pointer hover:border-primary/30" onClick={() => setActiveTab('pipeline')}>
              <span className="metric-label">Closed Deals</span>
              <p className="text-xl font-bold font-mono">
                <span className="text-success">{closedWon}W</span>
                <span className="text-muted-foreground mx-1">/</span>
                <span className="text-destructive">{closedLost}L</span>
              </p>
            </div>
            <div className="data-card py-3 px-4 cursor-pointer hover:border-primary/30" onClick={() => setActiveTab('emails')}>
              <span className="metric-label">Last Contact</span>
              {lastContactDate ? (
                <>
                  <p className="text-sm font-semibold">{formatDistanceToNow(lastContactDate, { addSuffix: true })}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{lastContactWith}</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No contact yet</p>
              )}
            </div>
          </div>
        );
      })()}

      {/* Action Item Banners (Closed Won: upload contract, Closed Lost: loss reason) */}
      <AccountActionBanners items={actionItems} />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors whitespace-nowrap ${
              activeTab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon size={14} /> {t.label}
            {t.id === 'contacts' && contacts.length > 0 && (
              <span className="text-[10px] text-muted-foreground ml-1">{contacts.length}</span>
            )}
            {t.id === 'pipeline' && opportunities.length > 0 && (
              <span className="text-[10px] text-muted-foreground ml-1">{opportunities.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'intelligence' && (
        <AccountIntelligenceTab clientId={id!} clientName={client.name} clientType={client.client_type} />
      )}

      {activeTab === 'contacts' && (
        <ClientContacts clientId={id!} contacts={contacts} />
      )}

      {activeTab === 'emails' && (
        <ClientEmails clientId={id!} />
      )}

      {activeTab === 'pipeline' && (
        <ClientPipeline
          clientId={id!}
          opportunities={opportunities}
          deliveries={deliveries}
          renewals={renewals}
          onCreateOpportunity={() => openOpportunity({ client_id: id })}
          onLogTrial={() => openTrial({ client_id: id })}
          onLogDelivery={() => openDelivery({ client_id: id })}
        />
      )}

      {activeTab === 'health' && (
        <CustomerHealthTab clientId={id!} />
      )}

      {activeTab === 'invoices' && (
        <ClientInvoices clientId={id!} opportunities={opportunities} />
      )}

      {activeTab === 'contracts' && (
        <ClientContracts clientId={id!} opportunities={opportunities} />
      )}

      {activeTab === 'documents' && (
        <DriveLinksPanel clientId={id!} />
      )}

      {activeTab === 'tasks' && (
        <TaskPanel client_id={id!} />
      )}

      {activeTab === 'activity' && (
        <ClientTimeline
          activities={activities}
          notes={notes}
          opportunities={opportunities}
          deliveries={deliveries}
          renewals={renewals}
        />
      )}
    </AppLayout>
  );
}

