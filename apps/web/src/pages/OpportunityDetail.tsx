import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import LoadingState from '@/components/LoadingState';
import { useOpportunities, useUpdateOpportunity, useDeleteOpportunity, useNotes, useActivities, useContacts, useDeliveries, useDatasets } from '@/hooks/useCrmData';
import { useProfiles } from '@/hooks/useProfiles';
import { useDb } from '@relai/db/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatCurrency, getStageColor, stageOrder, ICEBOX_STAGES } from '@/data/mockData';
import { useCurrencyRerender } from '@/hooks/useCurrencyRerender';
import { ArrowLeft, TrendingUp, MessageSquare, Calendar, Mail, Activity, Clock, Plus, Database, Trash2, Pencil, Check, X, Zap, AlertTriangle, Sparkles, FolderOpen } from 'lucide-react';
import OpportunityEmailDraft from '@/components/pipeline/OpportunityEmailDraft';
import type { EmailDraftTrigger } from '@/hooks/useOpportunityEmailDraft';
import DriveLinksPanel from '@/components/DriveLinksPanel';
import { useDriveLinks } from '@/hooks/useDriveLinks';

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useInteraction } from '@/contexts/InteractionContext';
import { useQuickCreate } from '@/contexts/QuickCreateContext';
import { format } from 'date-fns';
import { getTrialStatus, getDaysRemaining } from '@/lib/trialUtils';
import BallStatusBadge from '@/components/BallStatusBadge';
import { BallStatus, getBallStatusLabel, getBallStatusIcon } from '@/hooks/useActionCenter';
import { useOpportunityProducts, useAddOpportunityProduct, useUpdateOpportunityProduct, useRemoveOpportunityProduct } from '@/hooks/useOpportunityProducts';

type Tab = 'notes' | 'meetings' | 'emails' | 'documents' | 'activity';

const tabDefs: { id: Tab; label: string; icon: any }[] = [
  { id: 'notes', label: 'Notes', icon: MessageSquare },
  { id: 'meetings', label: 'Meetings', icon: Calendar },
  { id: 'emails', label: 'Emails', icon: Mail },
  { id: 'documents', label: 'Documents', icon: FolderOpen },
  { id: 'activity', label: 'Timeline', icon: Activity },
];

const ballStatusOptions: { value: BallStatus; label: string }[] = [
  { value: 'our_court', label: '🟢 Our Move' },
  { value: 'their_court', label: '🔵 Their Move' },
  { value: 'neutral', label: '⚪ Open Loop' },
  { value: 'closed_won', label: '🏆 Game Set Match' },
  { value: 'closed_lost', label: '🔴 Game Over' },
  { value: 'unknown', label: '⚫ Unknown' },
];

export default function OpportunityDetail() {
  const db = useDb();
  useCurrencyRerender();
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { open: openInteraction } = useInteraction();
  const { openTrial } = useQuickCreate();
  const [activeTab, setActiveTab] = useState<Tab>('notes');
  const [editingAction, setEditingAction] = useState(false);
  const [nextAction, setNextAction] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');

  // Inline edit states
  const [editingValueMin, setEditingValueMin] = useState(false);
  const [editValueMin, setEditValueMin] = useState('');
  const [editingValueMax, setEditingValueMax] = useState(false);
  const [editValueMax, setEditValueMax] = useState('');
  const [editingProb, setEditingProb] = useState(false);
  const [editProb, setEditProb] = useState('');
  const [editingClose, setEditingClose] = useState(false);
  const [editClose, setEditClose] = useState('');
  const [showClosedWonDialog, setShowClosedWonDialog] = useState(false);
  const [closedWonActualValue, setClosedWonActualValue] = useState('');
  const [emailViewMode, setEmailViewMode] = useState<'full' | 'summary' | 'date'>(() => (localStorage.getItem('email_view_mode') as any) || 'full');
  const [showEmailDraft, setShowEmailDraft] = useState(false);
  const [emailDraftTrigger, setEmailDraftTrigger] = useState<EmailDraftTrigger>('manual');
  const [searchParams] = useSearchParams();

  const qc = useQueryClient();
  const { data: opportunities = [], isLoading } = useOpportunities();
  const updateOpp = useUpdateOpportunity();
  const deleteOpp = useDeleteOpportunity();
  const opp = opportunities.find((o: any) => o.id === id);
  const { data: profiles = [] } = useProfiles();
  const { data: notes = [] } = useNotes({ opportunity_id: id });
  const { data: activities = [] } = useActivities({ opportunity_id: id });
  const { data: contacts = [] } = useContacts(opp?.client_id);
  const { data: clientDriveLinks = [] } = useDriveLinks(opp?.client_id ? { client_id: opp.client_id } : undefined);
  const { data: deliveries = [] } = useDeliveries({ opportunity_id: id });
  const { data: allDatasets = [] } = useDatasets();
  const { data: oppProducts = [] } = useOpportunityProducts(id);
  const addProduct = useAddOpportunityProduct();
  const updateProduct = useUpdateOpportunityProduct();
  const removeProduct = useRemoveOpportunityProduct();
  const [addingProduct, setAddingProduct] = useState(false);
  const [newProductDataset, setNewProductDataset] = useState('');
  const [newProductRevenue, setNewProductRevenue] = useState('');
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editProductRevenue, setEditProductRevenue] = useState('');
  const linkedTrials = deliveries.filter((d: any) => d.delivery_type?.toLowerCase() === 'trial');

  const { data: meetings = [] } = useQuery({
    queryKey: ['meetings', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db.query('meetings', { select: '*', filters: [{ column: 'opportunity_id', operator: 'eq', value: id! }], order: [{ column: 'meeting_date', ascending: false }] });
      if (error) throw error;
      return data;
    },
  });

  const { data: emails = [] } = useQuery({
    queryKey: ['emails', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db.query('emails', { select: '*', filters: [{ column: 'opportunity_id', operator: 'eq', value: id! }], order: [{ column: 'email_date', ascending: false }] });
      if (error) throw error;
      return data;
    },
  });

  const handleUpdate = async (field: string, value: any, extraFields?: Record<string, any>) => {
    try {
      await updateOpp.mutateAsync({ id: id!, [field]: value, ...extraFields });
      toast({ title: `${field.replace(/_/g, ' ')} updated` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleSaveNextAction = async () => {
    try {
      await updateOpp.mutateAsync({
        id: id!,
        next_action_description: nextAction,
        next_action_due_date: nextActionDate || null,
      });
      toast({ title: 'Next action saved' });
      setEditingAction(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleClearNextAction = async () => {
    try {
      await updateOpp.mutateAsync({
        id: id!,
        next_action_description: '',
        next_action_due_date: null,
      });
      toast({ title: 'Next action cleared' });
      setEditingAction(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  if (isLoading) return <AppLayout><LoadingState /></AppLayout>;
  if (!opp) return <AppLayout><p className="text-muted-foreground">Opportunity not found</p></AppLayout>;

  const daysOpen = Math.ceil((Date.now() - new Date(opp.created_at).getTime()) / (1000 * 60 * 60 * 24));
  const ballStatus: BallStatus = (opp as any).ball_status || 'unknown';
  const nextActionDesc = (opp as any).next_action_description || '';
  const nextActionDueDate = (opp as any).next_action_due_date || '';
  const isOverdue = nextActionDueDate && nextActionDueDate < new Date().toISOString().split('T')[0];

  const daysSinceActivity = opp.last_activity_at
    ? Math.ceil((Date.now() - new Date(opp.last_activity_at).getTime()) / (1000 * 60 * 60 * 24))
    : opp.updated_at
    ? Math.ceil((Date.now() - new Date(opp.updated_at).getTime()) / (1000 * 60 * 60 * 24))
    : daysOpen;
  const isStale = daysSinceActivity >= 14 && !nextActionDesc && !['Closed Won', 'Closed Lost'].includes(opp.stage);

  // Auto-open draft modal from query param (post-creation flow)
  useEffect(() => {
    const draft = searchParams.get('draft');
    if (draft && opp) {
      setEmailDraftTrigger(draft === 'initial' ? 'creation' : 'manual');
      setShowEmailDraft(true);
      window.history.replaceState({}, '', `/pipeline/${id}`);
    }
  }, [opp?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppLayout>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
        <button onClick={() => navigate('/')} className="hover:text-foreground transition-colors">Home</button>
        <span>/</span>
        <button onClick={() => navigate('/pipeline')} className="hover:text-foreground transition-colors">Pipeline</button>
        <span>/</span>
        <span className="text-foreground font-medium truncate max-w-[200px]">{opp.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start gap-3 mb-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={16} className="text-primary" />
            <h1 className="text-xl font-bold truncate">{opp.name}</h1>
            <BallStatusBadge status={ballStatus} size="md" />
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="cursor-pointer hover:text-foreground" onClick={() => navigate(`/clients/${opp.client_id}`)}>
              {opp.clients?.name}
            </span>
            <span>·</span>
            <span>{opp.datasets?.name || 'No dataset'}</span>
            <span>·</span>
            <span className="flex items-center gap-1"><Clock size={12} /> {daysOpen}d open</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setEmailDraftTrigger('manual'); setShowEmailDraft(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            title="Draft AI message"
          >
            <Sparkles size={13} /> Draft Message
          </button>
          <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Delete opportunity">
              <Trash2 size={16} />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete opportunity</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete "{opp.name}". This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  try {
                    await deleteOpp.mutateAsync(id!);
                    toast({ title: 'Opportunity deleted' });
                    navigate('/pipeline');
                  } catch (err: any) {
                    toast({ title: 'Error', description: err.message, variant: 'destructive' });
                  }
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </div>
      </div>

      {/* Summary cards — 2 rows of 4 for better readability */}
      <div className="grid grid-cols-4 gap-3 mb-3">
        <div className="data-card py-3 px-4">
          <span className="metric-label">Stage</span>
          <select value={opp.stage} onChange={e => {
            const newStage = e.target.value;
            if (newStage === 'Closed Won' && opp.stage !== 'Closed Won') {
              setClosedWonActualValue(String(Number(opp.value) || 0));
              setShowClosedWonDialog(true);
            } else {
              handleUpdate('stage', newStage).then(() => {
                if (!['Closed Won', 'Closed Lost'].includes(newStage)) {
                  toast({
                    title: `Stage updated to ${newStage}`,
                    description: 'Draft a stage-appropriate message?',
                    action: <button className="text-xs font-medium text-primary hover:underline" onClick={() => { setEmailDraftTrigger('stage_change'); setShowEmailDraft(true); }}>Draft Message</button>,
                  });
                }
              });
            }
          }}
            className="mt-1 block w-full text-sm font-medium bg-transparent border-0 p-0 cursor-pointer focus:ring-0 text-foreground">
            <optgroup label="Pipeline">
              {stageOrder.map(s => <option key={s} value={s}>{s}</option>)}
            </optgroup>
            <optgroup label="Icebox">
              {(['Inactive'] as const).map(s => <option key={s} value={s}>{s}</option>)}
            </optgroup>
          </select>
        </div>
        <div className="data-card py-3 px-4 group">
          <span className="metric-label">Min Value</span>
          {editingValueMin ? (
            <div className="flex items-center gap-1 mt-1">
              <span className="text-lg font-semibold">$</span>
              <input
                type="number"
                value={editValueMin}
                onChange={e => setEditValueMin(e.target.value)}
                className="w-full text-lg font-semibold font-mono bg-transparent border-0 p-0 focus:ring-0 outline-none"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const minVal = Number(editValueMin) || 0;
                    const maxVal = Number(opp.value_max) || 0;
                    handleUpdate('value_min', minVal);
                    handleUpdate('value', Math.round((minVal + maxVal) / 2));
                    setEditingValueMin(false);
                  }
                  if (e.key === 'Escape') setEditingValueMin(false);
                }}
              />
              <button onClick={() => { const minVal = Number(editValueMin) || 0; const maxVal = Number(opp.value_max) || 0; handleUpdate('value_min', minVal, { value: Math.round((minVal + maxVal) / 2) }); setEditingValueMin(false); }} className="p-0.5 rounded hover:bg-muted"><Check size={12} className="text-success" /></button>
              <button onClick={() => setEditingValueMin(false)} className="p-0.5 rounded hover:bg-muted"><X size={12} className="text-muted-foreground" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 mt-1 cursor-pointer" onClick={() => { setEditValueMin(String(Number(opp.value_min) || 0)); setEditingValueMin(true); }}>
              <p className="text-lg font-semibold font-mono">{formatCurrency(Number(opp.value_min) || 0)}</p>
              <Pencil size={10} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          )}
        </div>
        <div className="data-card py-3 px-4 group">
          <span className="metric-label">Max Value</span>
          {editingValueMax ? (
            <div className="flex items-center gap-1 mt-1">
              <span className="text-lg font-semibold">$</span>
              <input
                type="number"
                value={editValueMax}
                onChange={e => setEditValueMax(e.target.value)}
                className="w-full text-lg font-semibold font-mono bg-transparent border-0 p-0 focus:ring-0 outline-none"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const maxVal = Number(editValueMax) || 0;
                    const minVal = Number(opp.value_min) || 0;
                    handleUpdate('value_max', maxVal);
                    handleUpdate('value', Math.round((minVal + maxVal) / 2));
                    setEditingValueMax(false);
                  }
                  if (e.key === 'Escape') setEditingValueMax(false);
                }}
              />
              <button onClick={() => { const maxVal = Number(editValueMax) || 0; const minVal = Number(opp.value_min) || 0; handleUpdate('value_max', maxVal, { value: Math.round((minVal + maxVal) / 2) }); setEditingValueMax(false); }} className="p-0.5 rounded hover:bg-muted"><Check size={12} className="text-success" /></button>
              <button onClick={() => setEditingValueMax(false)} className="p-0.5 rounded hover:bg-muted"><X size={12} className="text-muted-foreground" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 mt-1 cursor-pointer" onClick={() => { setEditValueMax(String(Number(opp.value_max) || 0)); setEditingValueMax(true); }}>
              <p className="text-lg font-semibold font-mono">{formatCurrency(Number(opp.value_max) || 0)}</p>
              <Pencil size={10} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          )}
        </div>
        <div className="data-card py-3 px-4">
          <span className="metric-label">Midpoint / Weighted</span>
          <p className="text-lg font-semibold font-mono mt-1">{formatCurrency(Number(opp.value))}</p>
          <p className="text-[10px] text-muted-foreground font-mono mt-0.5">Wtd: {formatCurrency(Number(opp.value) * opp.probability / 100)}</p>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3 mb-6">
        {['Closed Won', 'Closed Lost'].includes(opp.stage) ? (
          <div className="data-card py-3 px-4 group">
            <span className="metric-label">Actual Close Date</span>
            {editingClose ? (
              <div className="flex items-center gap-1 mt-1">
                <input
                  type="date"
                  value={editClose}
                  onChange={e => setEditClose(e.target.value)}
                  className="text-sm font-medium bg-transparent border-0 p-0 focus:ring-0 outline-none"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') { handleUpdate('actual_close_date', editClose || null); setEditingClose(false); }
                    if (e.key === 'Escape') setEditingClose(false);
                  }}
                />
                <button onClick={() => { handleUpdate('actual_close_date', editClose || null); setEditingClose(false); }} className="p-0.5 rounded hover:bg-muted"><Check size={12} className="text-success" /></button>
                <button onClick={() => setEditingClose(false)} className="p-0.5 rounded hover:bg-muted"><X size={12} className="text-muted-foreground" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mt-1 cursor-pointer" onClick={() => { setEditClose((opp as any).actual_close_date || ''); setEditingClose(true); }}>
                <p className="text-sm font-medium">{(opp as any).actual_close_date || '—'}</p>
                <Pencil size={10} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
          </div>
        ) : (
          <div className="data-card py-3 px-4 group">
            <span className="metric-label">Expected Close</span>
            {editingClose ? (
              <div className="flex items-center gap-1 mt-1">
                <input
                  type="date"
                  value={editClose}
                  onChange={e => setEditClose(e.target.value)}
                  className="text-sm font-medium bg-transparent border-0 p-0 focus:ring-0 outline-none"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') { handleUpdate('expected_close', editClose || null); setEditingClose(false); }
                    if (e.key === 'Escape') setEditingClose(false);
                  }}
                />
                <button onClick={() => { handleUpdate('expected_close', editClose || null); setEditingClose(false); }} className="p-0.5 rounded hover:bg-muted"><Check size={12} className="text-success" /></button>
                <button onClick={() => setEditingClose(false)} className="p-0.5 rounded hover:bg-muted"><X size={12} className="text-muted-foreground" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mt-1 cursor-pointer" onClick={() => { setEditClose(opp.expected_close || ''); setEditingClose(true); }}>
                <p className="text-sm font-medium">{opp.expected_close || '—'}</p>
                <Pencil size={10} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
          </div>
        )}
        <div className="data-card py-3 px-4">
          <span className="metric-label">Ball Status</span>
          {['Closed Won', 'Closed Lost'].includes(opp.stage) ? (
            <p className="text-sm font-medium mt-1">{getBallStatusIcon(ballStatus)} {getBallStatusLabel(ballStatus)}</p>
          ) : (
            <select value={ballStatus} onChange={e => handleUpdate('ball_status', e.target.value)}
              className="mt-1 block w-full text-sm font-medium bg-transparent border-0 p-0 cursor-pointer focus:ring-0 text-foreground">
              {ballStatusOptions.filter(o => !['closed_won', 'closed_lost'].includes(o.value)).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
        </div>
        <div className="data-card py-3 px-4">
          <span className="metric-label">Owner</span>
          <select
            value={opp.owner_id || ''}
            onChange={e => handleUpdate('owner_id', e.target.value || null)}
            className="mt-1 block w-full text-sm font-medium bg-transparent border-0 p-0 cursor-pointer focus:ring-0 text-foreground"
          >
            <option value="">Unassigned</option>
            {profiles.filter((p: any) => p.is_active).map((p: any) => (
              <option key={p.user_id} value={p.user_id}>{p.full_name || p.email}</option>
            ))}
          </select>
        </div>
        <div className="data-card py-3 px-4">
          <span className="metric-label">Deal Type</span>
          <select
            value={(opp as any).deal_type || ''}
            onChange={e => handleUpdate('deal_type', e.target.value || null)}
            className="mt-1 block w-full text-sm font-medium bg-transparent border-0 p-0 cursor-pointer focus:ring-0 text-foreground"
          >
            <option value="">Not set</option>
            {['New Business', 'Upsell', 'Renewal', 'Trial'].map(dt => (
              <option key={dt} value={dt}>{dt}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Products & Revenue */}
      <div className="data-card mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Database size={14} className="text-primary" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Products & Revenue</span>
          </div>
          {!addingProduct && (
            <button onClick={() => setAddingProduct(true)} className="text-xs text-primary hover:underline flex items-center gap-1">
              <Plus size={11} /> Add Product
            </button>
          )}
        </div>

        {oppProducts.length > 0 ? (
          <table className="w-full text-sm mb-2">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Product</th>
                <th className="text-right py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium w-[120px]">Revenue</th>
                <th className="text-left py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Notes</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {oppProducts.map((p: any) => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="py-2 font-medium">{p.datasets?.name || '—'}</td>
                  <td className="py-2 text-right font-mono">
                    {editingProductId === p.id ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editProductRevenue}
                        onChange={e => setEditProductRevenue(e.target.value)}
                        onBlur={() => {
                          updateProduct.mutate({ id: p.id, opportunityId: id!, revenue: Number(editProductRevenue) || 0 });
                          setEditingProductId(null);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { updateProduct.mutate({ id: p.id, opportunityId: id!, revenue: Number(editProductRevenue) || 0 }); setEditingProductId(null); }
                          if (e.key === 'Escape') setEditingProductId(null);
                        }}
                        className="w-[100px] text-right bg-muted border border-border rounded px-2 py-0.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                        autoFocus
                      />
                    ) : (
                      <span
                        className="cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 -mx-1"
                        onClick={() => { setEditingProductId(p.id); setEditProductRevenue(String(p.revenue || 0)); }}
                      >
                        {formatCurrency(Number(p.revenue) || 0)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-muted-foreground text-xs">{p.notes || '—'}</td>
                  <td className="py-2">
                    <button
                      onClick={() => removeProduct.mutate({ id: p.id, opportunityId: id! })}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    >
                      <X size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <td className="py-2 text-xs font-medium text-muted-foreground">Total</td>
                <td className="py-2 text-right font-mono font-semibold text-primary">
                  {formatCurrency(oppProducts.reduce((sum: number, p: any) => sum + (Number(p.revenue) || 0), 0))}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        ) : !addingProduct ? (
          <p className="text-xs text-muted-foreground">No products assigned. Add products to track revenue per product.</p>
        ) : null}

        {addingProduct && (
          <div className="flex items-center gap-2 mt-2">
            <select
              value={newProductDataset}
              onChange={e => setNewProductDataset(e.target.value)}
              className="flex-1 bg-muted border border-border rounded-md px-2 py-1.5 text-xs"
            >
              <option value="">Select product...</option>
              {allDatasets
                .filter((d: any) => d.is_active && !oppProducts.some((p: any) => p.dataset_id === d.id))
                .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))
                .map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <input
              type="number"
              step="0.01"
              value={newProductRevenue}
              onChange={e => setNewProductRevenue(e.target.value)}
              placeholder="Revenue ($)"
              className="w-[120px] bg-muted border border-border rounded-md px-2 py-1.5 text-xs font-mono"
            />
            <button
              onClick={async () => {
                if (!newProductDataset) return;
                try {
                  await addProduct.mutateAsync({
                    opportunityId: id!,
                    datasetId: newProductDataset,
                    revenue: Number(newProductRevenue) || 0,
                  });
                  setNewProductDataset('');
                  setNewProductRevenue('');
                  setAddingProduct(false);
                  toast({ title: 'Product added' });
                } catch (err: any) {
                  toast({ title: 'Error', description: err.message, variant: 'destructive' });
                }
              }}
              disabled={!newProductDataset || addProduct.isPending}
              className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs font-medium disabled:opacity-50"
            >
              Add
            </button>
            <button onClick={() => { setAddingProduct(false); setNewProductDataset(''); setNewProductRevenue(''); }} className="text-xs text-muted-foreground">
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Next Action card */}
      <div className={`data-card mb-6 ${isOverdue ? 'border-destructive/50' : nextActionDesc ? 'border-primary/30' : ''}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="metric-label">Next Action</span>
          {!editingAction && (
            <button onClick={() => { setNextAction(nextActionDesc); setNextActionDate(nextActionDueDate); setEditingAction(true); }}
              className="text-xs text-primary hover:underline">{nextActionDesc ? 'Edit' : '+ Set next action'}</button>
          )}
        </div>
        {editingAction ? (
          <div className="space-y-2">
            <input value={nextAction} onChange={e => setNextAction(e.target.value)} placeholder="What needs to happen next?"
              className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm" />
            <div className="flex items-center gap-2">
              <input type="date" value={nextActionDate} onChange={e => setNextActionDate(e.target.value)}
                className="px-3 py-2 bg-muted border border-border rounded-md text-sm" />
              <button onClick={handleSaveNextAction} className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs font-medium">Save</button>
              {nextActionDesc && <button onClick={handleClearNextAction} className="px-3 py-1.5 text-destructive text-xs">Clear</button>}
              <button onClick={() => setEditingAction(false)} className="text-xs text-muted-foreground">Cancel</button>
            </div>
          </div>
        ) : nextActionDesc ? (
          <div className="flex items-center gap-3">
            <p className="text-sm">{nextActionDesc}</p>
            {nextActionDueDate && (
              <span className={`text-xs font-mono ${isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                {isOverdue ? '⚠ ' : ''}Due: {nextActionDueDate}
              </span>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No next action set. Set one to stay on top of this deal.</p>
        )}
      </div>

      {/* Stage progress */}
      <div className="flex gap-0.5 mb-6">
        {stageOrder.filter(s => s !== 'Closed Lost').map((s, i, arr) => {
          const idx = stageOrder.indexOf(opp.stage as any);
          const stageIdx = stageOrder.indexOf(s);
          const isCurrent = s === opp.stage;
          const isPast = stageIdx < idx;
          return (
            <button key={s} onClick={() => handleUpdate('stage', s)}
              className={`flex-1 flex flex-col items-center gap-1 group transition-colors`}
              title={s}
            >
              <div className={`w-full h-2 transition-colors ${i === 0 ? 'rounded-l-full' : ''} ${i === arr.length - 1 ? 'rounded-r-full' : ''} ${isCurrent ? 'bg-primary' : isPast ? 'bg-primary/40' : 'bg-muted'} group-hover:bg-primary/60`} />
              <span className={`text-[9px] leading-none truncate max-w-full ${isCurrent ? 'text-primary font-semibold' : isPast ? 'text-muted-foreground' : 'text-muted-foreground/50'}`}>
                {s === 'Closed Won' ? 'Won' : s === 'Initial Discussion' ? 'Discussion' : s === 'Demo Scheduled' ? 'Demo' : s === 'Commercial Discussion' ? 'Commercial' : s === 'Contract Sent' ? 'Contract' : s}
              </span>
            </button>
          );
        })}
      </div>

      {/* Contacts quick view */}
      {contacts.length > 0 && (
        <div className="flex gap-2 mb-6 flex-wrap">
          {contacts.slice(0, 5).map((c: any) => (
            <ContactChip key={c.id} contact={c} />
          ))}
        </div>
      )}

      {/* Trials quick view */}
      {linkedTrials.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium">Linked Trials</h3>
            <button onClick={() => openTrial({ client_id: opp.client_id, opportunity_id: id, dataset_id: opp.dataset_id })} className="text-xs text-primary hover:underline flex items-center gap-1"><Plus size={12} /> New Trial</button>
          </div>
          <div className="space-y-2">
            {linkedTrials.map((t: any) => {
              const status = getTrialStatus(t.status, t.trial_start_date, t.trial_end_date, opp.stage);
              const daysLeft = getDaysRemaining(t.trial_end_date);
              return (
                <div key={t.id} className="data-card py-2 px-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database size={14} className="text-muted-foreground" />
                    <span className="text-sm">{t.datasets?.name || 'Dataset'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{t.trial_start_date} → {t.trial_end_date}</span>
                    {status === 'active' && <span className="text-xs text-success font-medium">{daysLeft}d left</span>}
                    {status === 'ending_soon' && <span className="text-xs text-warning font-medium">{daysLeft}d left</span>}
                    <span className="status-badge bg-secondary text-secondary-foreground">{status}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {linkedTrials.length === 0 && (
        <div className="mb-6 flex justify-end">
          <button onClick={() => openTrial({ client_id: opp.client_id, opportunity_id: id, dataset_id: opp.dataset_id })} className="text-xs text-primary hover:underline flex items-center gap-1"><Plus size={12} /> Log Trial for Opportunity</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border mb-4">
        {tabDefs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors ${activeTab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={() => openInteraction({ opportunity_id: id, client_id: opp.client_id })}
          className="px-3 py-1.5 text-xs text-primary hover:bg-primary/5 rounded-md transition-colors">
          + Log interaction
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'notes' && (
        <div className="space-y-3">
          {notes.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No notes yet. Log an interaction to add notes.</p>}
          {notes.map((n: any) => (
            <div key={n.id} className="data-card">
              <p className="text-sm whitespace-pre-wrap">{n.content}</p>
              <p className="text-xs text-muted-foreground mt-2">{format(new Date(n.created_at), 'MMM d, yyyy h:mm a')}</p>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'meetings' && (
        <div className="space-y-3">
          {meetings.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No meetings logged.</p>}
          {meetings.map((m: any) => (
            <div key={m.id} className="data-card">
              <div className="flex items-center gap-2 mb-2">
                <Calendar size={14} className="text-primary" />
                <span className="text-sm font-medium">{format(new Date(m.meeting_date), 'MMM d, yyyy')}</span>
                {m.participants && <span className="text-xs text-muted-foreground">· {m.participants}</span>}
              </div>
              {m.summary && <p className="text-sm">{m.summary}</p>}
              {m.key_questions && <p className="text-xs text-muted-foreground mt-2"><span className="font-medium">Questions:</span> {m.key_questions}</p>}
              {m.next_steps && <p className="text-xs text-primary mt-1"><span className="font-medium">Next:</span> {m.next_steps}</p>}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'emails' && (
        <div className="space-y-3">
          {/* View toggle */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">View:</span>
            {(['full', 'summary', 'date'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => { setEmailViewMode(mode); localStorage.setItem('email_view_mode', mode); }}
                className={`px-2 py-1 rounded ${emailViewMode === mode ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {mode === 'full' ? 'Full' : mode === 'summary' ? 'Summary' : 'Date Only'}
              </button>
            ))}
          </div>
          {emails.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No emails logged.</p>}
          {emails.map((e: any) => {
            const isInbound = e.direction === 'inbound';
            const visibilityBadge = e.visibility === 'private' ? 'bg-destructive/10 text-destructive' : e.visibility === 'summary_only' ? 'bg-warning/10 text-warning' : '';
            return (
              <div key={e.id} className="data-card group">
                <div className="flex items-center gap-2 mb-2">
                  {isInbound ? (
                    <ArrowLeft size={12} className="text-info shrink-0" />
                  ) : (
                    <Mail size={14} className="text-primary shrink-0" />
                  )}
                  <span className="text-sm font-medium truncate">{e.subject}</span>
                  {e.sync_source === 'gmail' && (
                    <span className="text-[9px] bg-info/10 text-info px-1 py-0.5 rounded shrink-0">Gmail</span>
                  )}
                  {e.visibility && e.visibility !== 'public' && (
                    <span className={`text-[9px] px-1 py-0.5 rounded shrink-0 ${visibilityBadge}`}>{e.visibility}</span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto shrink-0">{format(new Date(e.email_date), 'MMM d, yyyy')}</span>
                  <button
                    onClick={async (ev) => {
                      ev.stopPropagation();
                      if (!confirm('Delete this email?')) return;
                      await db.delete('emails', { ['id']: e.id });
                      qc.invalidateQueries({ queryKey: ['emails', id] });
                    }}
                    className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-opacity shrink-0"
                    title="Delete email"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                {e.from_address && (
                  <p className="text-[10px] text-muted-foreground mb-1">
                    {isInbound ? 'From' : 'To'}: {isInbound ? e.from_address : (e.to_addresses || []).join(', ')}
                  </p>
                )}
                {emailViewMode === 'full' && (
                  <>
                    {e.body_text && <p className="text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">{e.body_text}</p>}
                    {!e.body_text && e.summary && <p className="text-sm">{e.summary}</p>}
                    {e.key_takeaways && <p className="text-xs text-muted-foreground mt-2"><span className="font-medium">Key points:</span> {e.key_takeaways}</p>}
                  </>
                )}
                {emailViewMode === 'summary' && (
                  <p className="text-sm text-muted-foreground">{e.ai_summary || e.summary || '(no summary)'}</p>
                )}
                {e.ai_next_action && emailViewMode !== 'date' && (
                  <div className="mt-2 px-2 py-1.5 bg-primary/5 rounded text-xs">
                    <span className="font-medium text-primary">Suggested action:</span> {e.ai_next_action}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'documents' && (
        <DriveLinksPanel
          opportunityId={id!}
          inheritedLinks={clientDriveLinks.filter((l: any) => l.link_type === 'folder')}
        />
      )}

      {activeTab === 'activity' && (
        <div className="space-y-2">
          {activities.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No activity recorded.</p>}
          {activities.map((a: any) => (
            <div key={a.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
              <Activity size={14} className="text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm">{a.description}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{a.activity_type} · {format(new Date(a.created_at), 'MMM d, yyyy h:mm a')}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Closed Won — actual value dialog */}
      <AlertDialog open={showClosedWonDialog} onOpenChange={setShowClosedWonDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close deal as Won</AlertDialogTitle>
            <AlertDialogDescription>
              Enter the actual contract value for this deal. This will be used for revenue reporting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-3">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Actual Deal Value ($)</label>
            <input
              type="number"
              step="0.01"
              value={closedWonActualValue}
              onChange={e => setClosedWonActualValue(e.target.value)}
              className="mt-1 w-full px-3 py-2 bg-muted border border-border rounded-md text-lg font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const val = Number(closedWonActualValue) || 0;
                  updateOpp.mutateAsync({ id: id!, stage: 'Closed Won', actual_value: val });
                  toast({ title: 'Deal closed as Won', description: `Actual value: ${formatCurrency(val)}` });
                  setShowClosedWonDialog(false);
                }
              }}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const val = Number(closedWonActualValue) || 0;
                updateOpp.mutateAsync({ id: id!, stage: 'Closed Won', actual_value: val });
                toast({ title: 'Deal closed as Won', description: `Actual value: ${formatCurrency(val)}` });
              }}
            >
              Close as Won
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Stale opportunity banner */}
      {isStale && (
        <div className="data-card border-warning/50 bg-warning/5 flex items-center justify-between mt-4">
          <div>
            <p className="text-sm font-medium flex items-center gap-1.5"><AlertTriangle size={14} className="text-warning" /> No activity for {daysSinceActivity} days</p>
            <p className="text-xs text-muted-foreground">Consider re-engaging this opportunity</p>
          </div>
          <button
            onClick={() => { setEmailDraftTrigger('stale'); setShowEmailDraft(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-warning/10 text-warning rounded-md hover:bg-warning/20"
          >
            <Sparkles size={12} /> Draft Re-engagement
          </button>
        </div>
      )}

      {/* Email Draft Modal */}
      {showEmailDraft && opp && (
        <OpportunityEmailDraft
          opportunity={opp}
          trigger={emailDraftTrigger}
          onClose={() => setShowEmailDraft(false)}
        />
      )}
    </AppLayout>
  );
}

function ContactChip({ contact }: { contact: any }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full hover:bg-muted/80 transition-colors"
      >
        <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-[10px] font-medium text-secondary-foreground">
          {contact.name.charAt(0)}
        </div>
        <span className="text-xs">{contact.name}</span>
        <span className="text-[10px] text-muted-foreground">{contact.title || ''}</span>
      </button>
      {expanded && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setExpanded(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-xl p-3 min-w-[220px]">
            <p className="text-sm font-medium">{contact.name}</p>
            {contact.title && <p className="text-xs text-muted-foreground">{contact.title}</p>}
            {contact.email && (
              <p className="text-xs text-primary mt-1">
                <a href={`mailto:${contact.email}`} className="hover:underline">{contact.email}</a>
              </p>
            )}
            {contact.linkedin && (
              <a href={contact.linkedin} target="_blank" rel="noopener noreferrer" className="text-xs text-info hover:underline mt-0.5 block">LinkedIn</a>
            )}
            {contact.influence_level && contact.influence_level !== 'Unknown' && (
              <p className="text-[10px] text-muted-foreground mt-1.5">{contact.influence_level} · {contact.relationship_strength || 'Unknown'}</p>
            )}
            {contact.last_interaction_date && (
              <p className="text-[10px] text-muted-foreground">Last contact: {contact.last_interaction_date}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
